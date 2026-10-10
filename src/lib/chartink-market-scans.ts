import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { ensureDir } from './fs.js';
import { getBrowserSession, closeBrowserSession } from './browser.js';
import { buildTradingViewInstrument } from './tradingview-url.js';
import { CHARTINK_SCAN_REGISTRY, CHARTINK_SCAN_TYPES, getScansByType, type ScanEntry, type ScanType } from './chartink-scan-registry.js';
import { loadNseEquityUniverse, resolveNseSecurity } from './nse-securities.js';
import { DebugLogger } from './debug.js';

export type MarketScanRunType = ScanType | 'all';

type Row = Record<string, unknown>;

type ScanResult = {
  name: string;
  url: string;
  scanType: ScanType;
  slug: string;
  sourceMode: 'csv-download' | 'copy-table' | 'visible-table' | 'process-json' | 'failed';
  csvCaptured: boolean;
  csvPath: string | null;
  csvBytes: number;
  copyCaptured: boolean;
  copyPath: string | null;
  processCaptured: boolean;
  visibleRows: number;
  rowCount: number;
  stocks: Array<{
    symbol: string;
    name: string | null;
    close: number | string | null;
    percentChange: number | string | null;
    volume: number | string | null;
    marketCap: number | string | null;
    sector: string | null;
    raw: Row;
  }>;
  scanClause: string | null;
  screenshotPath: string;
  metadataPath: string;
  status: 'ok' | 'partial' | 'error';
  warnings: string[];
};

function slugify(v: string) { return v.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function clean(v: unknown) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function numOrText(v: unknown): number | string | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, '').replace(/%/g, ''));
  return Number.isFinite(n) ? n : s;
}
function normalizeSymbol(v: unknown) { return clean(v).toUpperCase().replace(/\s+/g, ''); }

function parseDelimited(text: string): string[][] {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(x => x.trim());
  return lines.map(line => {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const cells: string[] = []; let current = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i], next = line[i + 1];
      if (ch === '"') {
        if (quoted && next === '"') { current += '"'; i++; } else quoted = !quoted;
      } else if (ch === delimiter && !quoted) { cells.push(current.trim()); current = ''; }
      else current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}

function rowsFromCsv(text: string): Row[] {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headerIndex = rows.findIndex(r => /symbol/i.test(r.join(' ')) || /nse.?code/i.test(r.join(' ')));
  const idx = headerIndex >= 0 ? headerIndex : 0;
  const headers = rows[idx].map(clean);
  return rows.slice(idx + 1).filter(r => r.some(Boolean)).map(values => {
    const o: Row = {};
    headers.forEach((h, i) => { if (h) o[h] = values[i] ?? ''; });
    return o;
  });
}

function normalizeRows(rows: Row[], scan: ScanEntry) {
  return rows.map(row => {
    const name = clean(row.name ?? row['Stock Name'] ?? row.Stock ?? row.Name) || null;
    const rawSymbol = row.nsecode ?? row.NSECode ?? row['NSE Code'] ?? row.symbol ?? row.Symbol;
    const symbol = normalizeSymbol(rawSymbol ?? '');
    return {
      symbol,
      name,
      close: numOrText(row.close ?? row.Close),
      percentChange: numOrText(row.per_chg ?? row['%_change'] ?? row['% Change'] ?? row.Change),
      volume: numOrText(row.volume ?? row.Volume),
      marketCap: numOrText(row.market_cap ?? row.Marketcap ?? row['Market Cap']),
      sector: clean(row.sector ?? row.Sector) || null,
      raw: row,
      strategy: scan.name,
      strategySlug: slugify(new URL(scan.url).pathname.split('/').filter(Boolean).pop() || scan.name),
      scanType: scan.scanType,
    };
  }).filter(r => r.symbol || r.name);
}

async function visibleRows(page: any): Promise<Row[]> {
  const table = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('table')].map((table: any) => {
      const headers = [...table.querySelectorAll('thead th,thead td')].map((e: any) => (e.innerText || e.textContent || '').trim());
      const body = [...table.querySelectorAll('tbody tr')].map((tr: any) => [...tr.querySelectorAll('td,th')].map((e: any) => (e.innerText || e.textContent || '').trim())).filter((r: string[]) => r.some(Boolean));
      const h = headers.join(' ').toLowerCase();
      return { headers, rows: body, score: (h.includes('symbol') ? 4 : 0) + (h.includes('close') ? 2 : 0) + (h.includes('volume') ? 1 : 0) };
    }).filter((x: any) => x.rows.length).sort((a: any, b: any) => b.score - a.score);
    return candidates[0] || { headers: [], rows: [] };
  });
  return (table.rows || []).map((values: string[]) => Object.fromEntries((table.headers || []).map((h: string, i: number) => [clean(h), values[i] ?? ''])));
}

async function readScanClause(page: any) {
  return page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="scan_clause"]');
    if (textarea?.value) return textarea.value;
    const el = document.querySelector<HTMLInputElement>('input[name="scan_clause"]');
    return el?.value || null;
  }).catch(() => null);
}

async function copyTable(page: any, timeoutMs = 7000) {
  const captured: { text: string } = { text: '' };
  await page.exposeFunction('__captureChartinkCopy', (text: string) => { captured.text = text || ''; }).catch(() => {});
  await page.evaluate(() => {
    const w = window as any;
    if (w.__chartinkCopyHookInstalled) return;
    w.__chartinkCopyHookInstalled = true;
    const notify = (text: string) => { try { (window as any).__captureChartinkCopy(text); } catch {} };
    document.addEventListener('copy', () => notify(window.getSelection()?.toString() || ''), true);
    try {
      const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string) => { notify(text); try { await original?.(text); } catch {} } });
    } catch {}
  }).catch(() => {});

  const findVisible = async (patterns: RegExp[]) => {
    const locators: any[] = [];
    for (const re of patterns) {
      locators.push(page.getByRole('button', { name: re }), page.getByRole('menuitem', { name: re }), page.getByText(re));
    }
    for (const locator of locators) {
      const n = await locator.count().catch(() => 0);
      for (let i = 0; i < n; i++) if (await locator.nth(i).isVisible().catch(() => false)) return locator.nth(i);
    }
    return null;
  };

  const copy = await findVisible([/^Copy$/i, /\bCopy\b/i]);
  if (!copy) return { ok: false, reason: 'copy-control-not-found', text: '' };
  await copy.click({ timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(300);
  const tableOpt = await findVisible([/^table$/i, /^Table$/i]);
  if (!tableOpt) return { ok: false, reason: 'table-option-not-found', text: '' };
  await tableOpt.click({ timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(300);
  const confirmation = await findVisible([/All pages table data copied successfully/i, /copied successfully/i]);
  if (!confirmation) return { ok: false, reason: 'confirmation-not-found', text: captured.text };
  const ok = await findVisible([/^OK$/i]);
  if (ok) await ok.click({ timeout: timeoutMs }).catch(() => {});
  const started = Date.now();
  while (!captured.text && Date.now() - started < timeoutMs) await page.waitForTimeout(250);
  return { ok: Boolean(captured.text), reason: captured.text ? undefined : 'clipboard-text-empty', text: captured.text };
}

async function clickCsv(page: any, filePath: string, timeoutMs = 7000) {
  const buttons: any[] = [page.getByText(/^CSV$/i), page.getByRole('button', { name: /^CSV$/i }), page.locator('[title="CSV"]'), page.locator('[aria-label="CSV"]')];
  let target: any = null;
  for (const loc of buttons) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible().catch(() => false)) { target = loc.nth(i); break; }
    if (target) break;
  }
  if (!target) return { ok: false, bytes: 0, method: 'not-found' as const };
  const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs }).catch(() => null);
  await target.click({ timeout: timeoutMs }).catch(() => {});
  const download = await downloadPromise;
  if (!download) return { ok: false, bytes: 0, method: 'no-download-event' as const };
  await ensureDir(path.dirname(filePath));
  await download.saveAs(filePath);
  const s = await stat(filePath).catch(() => null);
  return { ok: Boolean(s?.isFile() && (s?.size ?? 0) > 0), bytes: s?.size ?? 0, method: 'download-event' as const, originalFilename: download.suggestedFilename() };
}

async function capturePageState(page: any) {
  return page.evaluate(() => ({ url: location.href, title: document.title, bodyText: (document.body?.innerText || '').slice(0, 12000) })).catch(() => ({ url: '', title: '', bodyText: '' }));
}

async function captureTradingViewEvidence(projectRoot: string, dateSlug: string, stocks: string[], debug: DebugLogger) {
  const max = Number(process.env.SCAN_CHART_LIMIT || 0);
  const selected = max > 0 ? stocks.slice(0, max) : stocks;
  const root = path.join(projectRoot, 'scans', dateSlug, 'chart-evidence');
  await ensureDir(root);
  const session = `stock-scan-tradingview-${dateSlug}-${Date.now()}`;
  const browser = await getBrowserSession(session, 'default');
  const records: any[] = [];
  try {
    for (let i = 0; i < selected.length; i++) {
      const symbol = selected[i];
      const instrument = buildTradingViewInstrument(symbol, 'NSE');
      const symbolRoot = path.join(root, symbol);
      await ensureDir(symbolRoot);
      const page = browser.page;
      try {
        await page.goto(instrument.chartUrl, { waitUntil: 'domcontentloaded', timeout: Number(process.env.SOURCE_TIMEOUT_MS || 120000) });
        await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 6000));
        const selectCandles = async () => {
          const locs = [
            page.getByRole('button', { name: /chart type/i }),
            page.locator('[aria-label*="Chart type" i]'),
            page.locator('[title*="Chart type" i]'),
            page.locator('[data-name*="chartType" i]')
          ];
          for (const loc of locs) {
            const n = await loc.count().catch(() => 0);
            for (let i=0;i<n;i++) if (await loc.nth(i).isVisible().catch(()=>false)) {
              await loc.nth(i).click({timeout:5000}).catch(()=>{});
              await page.waitForTimeout(300);
              for (const cl of [page.getByText(/^Candles$/i), page.getByText(/^Candlestick$/i), page.getByRole('menuitem',{name:/^Candles$/i})]) {
                const cn = await cl.count().catch(()=>0);
                for (let j=0;j<cn;j++) if (await cl.nth(j).isVisible().catch(()=>false)) { await cl.nth(j).click({timeout:5000}).catch(()=>{}); await page.waitForTimeout(700); return true; }
              }
            }
          }
          return false;
        };
        const selectRange = async (range: string) => {
          const patterns = range === '5Y' ? [/^5Y$/i, /^5 years$/i, /5 years/i] : [/^All$/i, /^All data$/i, /^All time$/i, /All data/i];
          const locs:any[] = [];
          for (const re of patterns) locs.push(page.getByRole('button',{name:re}), page.getByRole('menuitem',{name:re}), page.getByRole('option',{name:re}), page.getByText(re));
          for (const loc of locs) { const n=await loc.count().catch(()=>0); for(let i=0;i<n;i++) if(await loc.nth(i).isVisible().catch(()=>false)){ await loc.nth(i).click({timeout:5000}).catch(()=>{}); await page.waitForTimeout(1800); return true; } }
          return false;
        };
        const capture = async (range: string, file: string) => {
          const candleSelected = await selectCandles();
          const rangeClicked = await selectRange(range);
          const controls = await page.getByRole('button').allTextContents().catch(() => []);
          const p = path.join(symbolRoot, file);
          await page.screenshot({ path: p, fullPage: false });
          const st = await stat(p).catch(() => null);
          return { path: p, exists: Boolean(st?.isFile()), bytes: st?.size ?? 0, range, candleSelected, rangeClicked, controlCandidates: controls.slice(0,40) };
        };
        const oneD = path.join(symbolRoot, 'tradingview-1d.png');
        await page.screenshot({ path: oneD, fullPage: false });
        const fiveY = await capture('5Y', 'tradingview-5y.png');
        await page.goto(instrument.chartUrl, { waitUntil: 'domcontentloaded', timeout: Number(process.env.SOURCE_TIMEOUT_MS || 120000) }).catch(() => {});
        await page.waitForTimeout(Number(process.env.TRADINGVIEW_INITIAL_SETTLE_MS || 5000));
        const all = await capture('All', 'tradingview-all.png');
        const identity = await capturePageState(page);
        const rec = { symbol, chartUrl: instrument.chartUrl, screenshots: { oneD, fiveY, all }, finalUrl: identity.url, title: identity.title };
        await writeFile(path.join(symbolRoot, 'evidence.json'), JSON.stringify(rec, null, 2), 'utf8');
        records.push(rec);
        await debug.emit('SCAN/CHARTS/STOCK', 'OK', 'TradingView scan evidence captured', { symbol, index: i + 1, total: selected.length, fiveYBytes: fiveY.bytes, allBytes: all.bytes });
      } catch (e: any) {
        records.push({ symbol, error: e?.message || String(e) });
        await debug.emit('SCAN/CHARTS/STOCK', 'WARN', 'TradingView scan evidence failed', { symbol, error: e?.message || String(e) });
      }
    }
  } finally { await closeBrowserSession(session).catch(() => {}); }
  await writeFile(path.join(root, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), requested: stocks.length, selected: selected.length, records }, null, 2), 'utf8');
  return { root, requested: stocks.length, captured: records.filter(r => !r.error).length, records };
}

function dateSlug(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}-${get('month')}-${get('year')}`;
}

export async function runChartinkMarketScans(options: { projectRoot: string; scanType: MarketScanRunType; captureCharts?: boolean }) {
  const { projectRoot, scanType, captureCharts = true } = options;
  if (scanType === 'all') {
    const outputs: any[] = [];
    for (const type of CHARTINK_SCAN_TYPES) outputs.push(await runChartinkMarketScans({ projectRoot, scanType: type, captureCharts }));
    const root = path.join(projectRoot, 'scans'); await ensureDir(root);
    const index = { schema_version:'1.0', generatedAt:new Date().toISOString(), source:'Chartink', runType:'all', scanTypes:outputs.map(o=>({scanType:o.summary.scanType,date:o.date,dir:o.dateDir,summary:o.summary})), deterministic:true, llmUsed:false };
    await writeFile(path.join(root,'index.json'), JSON.stringify(index,null,2),'utf8');
    return { date: dateSlug(), dateDir: root, summary: { scanType:'all', scanTypes:outputs.map(o=>o.summary.scanType), configured:outputs.reduce((n,o)=>n+o.summary.configured,0), results:outputs.reduce((n,o)=>n+o.summary.results,0), ok:outputs.reduce((n,o)=>n+o.summary.ok,0), partial:outputs.reduce((n,o)=>n+o.summary.partial,0), failed:outputs.reduce((n,o)=>n+o.summary.failed,0), csvCaptured:outputs.reduce((n,o)=>n+o.summary.csvCaptured,0), copied:outputs.reduce((n,o)=>n+o.summary.copied,0), uniqueStocksByType:Object.fromEntries(outputs.map(o=>[o.summary.scanType,o.summary.uniqueStocks])), chartEvidence:outputs.map(o=>o.summary.chartEvidence) }, outputs };
  }
  const date = dateSlug();
  const scanEntries = getScansByType(scanType);
  const root = path.join(projectRoot, 'scans');
  const dateDir = path.join(root, `${scanType.replace(/\b\w/g, x => x.toUpperCase())}-${date}`);
  await ensureDir(dateDir);
  await writeFile(path.join(dateDir, 'scan-conditions.json'), JSON.stringify({ schema_version: '1.0', generatedAt: new Date().toISOString(), scanType, count: scanEntries.length, scans: scanEntries }, null, 2), 'utf8');
  const debugDir = path.join(dateDir, 'debug');
  await ensureDir(debugDir);
  const debug = new DebugLogger(debugDir, process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ adapter: 'ChartinkMarketScans', node: process.version, cwd: process.cwd(), root: dateDir, scanType });
  const strategiesDir = path.join(dateDir, 'strategies');
  await ensureDir(strategiesDir);
  const session = `stock-scan-chartink-${Date.now()}`;
  const state = await getBrowserSession(session, 'default');
  const results: ScanResult[] = [];
  try {
    for (let i = 0; i < scanEntries.length; i++) {
      const scan = scanEntries[i];
      const scanPage = await state.context.newPage();
      const slug = slugify(new URL(scan.url).pathname.split('/').filter(Boolean).pop() || scan.name);
      const scanDir = path.join(strategiesDir, slug);
      const csvDir = path.join(scanDir, 'csv');
      await ensureDir(csvDir);
      const csvPath = path.join(csvDir, `${slug}.csv`);
      const metadataPath = path.join(scanDir, 'metadata.json');
      const pagePath = path.join(scanDir, 'page.json');
      const screenshotPath = path.join(scanDir, 'page.png');
      const warnings: string[] = [];
      await debug.emit(`SCAN/${scan.scanType.toUpperCase()}/${String(i+1).padStart(3,'0')}`, 'START', 'Opening Chartink scan', { name: scan.name, url: scan.url, sequence: i + 1, total: scanEntries.length });
      try {
        await scanPage.goto(scan.url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.SCAN_TIMEOUT_MS || 120000) });
        await scanPage.waitForTimeout(Number(process.env.SCAN_INITIAL_SETTLE_MS || 4000));
        const initialRows = await visibleRows(scanPage);
        const scanClause = await readScanClause(scanPage);
        const csv = await clickCsv(scanPage, csvPath, Number(process.env.SCAN_CSV_TIMEOUT_MS || 7000));
        let normalizedRows: any[] = [];
        let sourceMode: ScanResult['sourceMode'] = 'failed';
        if (csv.ok) {
          normalizedRows = normalizeRows(rowsFromCsv(await readFile(csvPath, 'utf8')), scan);
          sourceMode = 'csv-download';
          await debug.emit(`SCAN/${scan.scanType.toUpperCase()}/CSV`, 'OK', 'CSV downloaded and parsed', { name: scan.name, bytes: csv.bytes, rows: normalizedRows.length });
        } else {
          warnings.push(`CSV unavailable: ${csv.method}`);
          const copied = await copyTable(scanPage, Number(process.env.SCAN_COPY_TIMEOUT_MS || 7000));
          if (copied.ok) {
            const copyPath = path.join(scanDir, 'copy-table.txt');
            await writeFile(copyPath, copied.text, 'utf8');
            normalizedRows = normalizeRows(rowsFromCsv(copied.text), scan);
            sourceMode = 'copy-table';
            await debug.emit(`SCAN/${scan.scanType.toUpperCase()}/COPY`, 'OK', 'Copy → Table → OK captured', { name: scan.name, chars: copied.text.length, rows: normalizedRows.length });
          } else {
            normalizedRows = normalizeRows(initialRows, scan);
            sourceMode = normalizedRows.length ? 'visible-table' : 'failed';
            warnings.push(`Copy unavailable: ${copied.reason}`);
          }
        }
        const stateDump = await capturePageState(scanPage);
        await scanPage.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        const meta = { schema_version: '1.0', generatedAt: new Date().toISOString(), scan, sequence: i + 1, total: scanEntries.length, sourceMode, visibleRows: initialRows.length, normalizedRows: normalizedRows.length, csv, scanClause, page: stateDump, screenshotPath, screenshotBytes: (await stat(screenshotPath).catch(() => null))?.size ?? 0, warnings, deterministic: true, llmUsed: false };
        await writeFile(pagePath, JSON.stringify({ ...stateDump, scan }, null, 2), 'utf8');
        await writeFile(metadataPath, JSON.stringify(meta, null, 2), 'utf8');
        const rowsPath = path.join(scanDir, 'results.json');
        await writeFile(rowsPath, JSON.stringify({ schema_version: '1.0', generatedAt: new Date().toISOString(), scan, sourceMode, scanClause, rowCount: normalizedRows.length, stocks: normalizedRows }, null, 2), 'utf8');
        const copyPath = existsSync(path.join(scanDir, 'copy-table.txt')) ? path.join(scanDir, 'copy-table.txt') : null;
        results.push({ name: scan.name, url: scan.url, scanType: scan.scanType, slug, sourceMode, csvCaptured: csv.ok, csvPath: csv.ok ? csvPath : null, csvBytes: csv.bytes, copyCaptured: Boolean(copyPath), copyPath, processCaptured: false, visibleRows: initialRows.length, rowCount: normalizedRows.length, stocks: normalizedRows, scanClause, screenshotPath, metadataPath, status: normalizedRows.length ? 'ok' : 'partial', warnings });
        await debug.emit(`SCAN/${scan.scanType.toUpperCase()}/${String(i+1).padStart(3,'0')}`, normalizedRows.length ? 'OK' : 'WARN', 'Chartink scan captured', { name: scan.name, sourceMode, rows: normalizedRows.length, csvCaptured: csv.ok, csvBytes: csv.bytes });
      } catch (e: any) {
        const msg = e?.message || String(e);
        warnings.push(msg);
        results.push({ name: scan.name, url: scan.url, scanType: scan.scanType, slug, sourceMode: 'failed', csvCaptured: false, csvPath: null, csvBytes: 0, copyCaptured: false, copyPath: null, processCaptured: false, visibleRows: 0, rowCount: 0, stocks: [], scanClause: null, screenshotPath, metadataPath, status: 'error', warnings });
        await debug.emit(`SCAN/${scan.scanType.toUpperCase()}/${String(i+1).padStart(3,'0')}`, 'ERROR', 'Chartink scan failed', { name: scan.name, error: msg });
      } finally {
        await scanPage.close().catch(() => {});
      }
    }
  } finally { await closeBrowserSession(session).catch(() => {}); }

  const nseUniverse = await loadNseEquityUniverse(projectRoot);
  const nseBySymbol = new Map(nseUniverse.map(r => [r.symbol, r]));
  const allRows = results.flatMap(r => r.stocks.map(s => ({ ...s, scan: r.name, scanType: r.scanType })));
  const bySymbol = new Map<string, any>();
  for (const row of allRows) {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol) continue;
    const master = nseBySymbol.get(symbol);
    const e = bySymbol.get(symbol) || { symbol, name: row.name, nse: master ? { companyName: master.companyName, isin: master.isin, series: master.series, preferredForStockResearch: master.preferredForStockResearch } : null, scanTypes: new Set<string>(), scans: new Set<string>(), occurrences: 0, rows: [] as any[] };
    e.occurrences++;
    e.scanTypes.add(row.scanType); e.scans.add(row.scan); e.rows.push(row); if (!e.name && row.name) e.name = row.name;
    bySymbol.set(symbol, e);
  }
  const deduped = [...bySymbol.values()].map(e => ({ ...e, scanTypes: [...e.scanTypes], scans: [...e.scans], nseMasterVerified: Boolean(e.nse?.preferredForStockResearch), rows: e.rows.slice(0, 10) })).sort((a, b) => b.occurrences - a.occurrences || a.symbol.localeCompare(b.symbol));
  await writeFile(path.join(dateDir, 'deduped-stocks.json'), JSON.stringify({ schema_version: '1.0', generatedAt: new Date().toISOString(), scanType, uniqueStocks: deduped.length, stocks: deduped, deterministic: true, llmUsed: false }, null, 2), 'utf8');
  for (const t of CHARTINK_SCAN_TYPES) {
    const typeResults = results.filter(r => r.scanType === t);
    const subset = [...new Set(typeResults.flatMap(r => r.stocks.map(s => normalizeSymbol(s.symbol)).filter(Boolean)))].sort();
    const scored = new Map<string, any>();
    for (const r of typeResults) for (let i=0;i<r.stocks.length;i++) {
      const row:any = r.stocks[i]; const sym = normalizeSymbol(row.symbol); if (!sym) continue;
      const e = scored.get(sym) || { symbol:sym, name:row.name||sym, strategyHits:0, strategies:[], rankScore:0 };
      e.strategyHits += 1; e.rankScore += i+1; if (!e.strategies.includes(r.name)) e.strategies.push(r.name); if (!e.name && row.name) e.name=row.name; scored.set(sym,e);
    }
    const consensus = [...scored.values()].sort((a,b)=>b.strategyHits-a.strategyHits || a.rankScore-b.rankScore || a.symbol.localeCompare(b.symbol)).map((x,i)=>({rank:i+1,...x}));
    await writeFile(path.join(dateDir, `${t}-stocks.json`), JSON.stringify({ scanType:t, count:subset.length, symbols:subset }, null, 2), 'utf8');
    await writeFile(path.join(dateDir, `${t}-top20.json`), JSON.stringify({ schema_version:'1.0', scanType:t, generatedAt:new Date().toISOString(), stocks:consensus.slice(0,20), deterministic:true, llmUsed:false }, null, 2), 'utf8');
  }
  let chartEvidence: any = null;
  if (captureCharts) chartEvidence = await captureTradingViewEvidence(projectRoot, path.basename(dateDir), deduped.filter(x => x.nseMasterVerified !== false).map(x => x.symbol), debug);
  const summary = { schema_version: '1.0', generatedAt: new Date().toISOString(), date: date, scanType, registryConfigured: CHARTINK_SCAN_REGISTRY.filter(s=>s.scanType===scanType).length, configured: scanEntries.length, results: results.length, ok: results.filter(r => r.status === 'ok').length, partial: results.filter(r => r.status === 'partial').length, failed: results.filter(r => r.status === 'error').length, csvCaptured: results.filter(r => r.csvCaptured).length, copied: results.filter(r => r.copyCaptured).length, rawRows: results.reduce((n,r)=>n+r.rowCount,0), uniqueStocks: deduped.length, chartEvidence, scans: results.map(r=>({ name:r.name, scanType:r.scanType, slug:r.slug, status:r.status, sourceMode:r.sourceMode, rows:r.rowCount, csvCaptured:r.csvCaptured, csvBytes:r.csvBytes, warnings:r.warnings })) };
  await writeFile(path.join(dateDir, 'index.json'), JSON.stringify(summary, null, 2), 'utf8');
  return { date, dateDir, summary, results };
}
