import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir } from '../lib/fs.js';
import { getBrowserSession, closeBrowserSession } from '../lib/browser.js';
import { nseFetchJson } from '../lib/nse-api-client.js';
import { DebugLogger } from '../lib/debug.js';
import { loadNseEquityUniverse } from '../lib/nse-securities.js';
import type { SourceArtifact } from '../types/research.js';

const NSE_BASE = 'https://www.nseindia.com';
const PAGE_URL = `${NSE_BASE}/market-data/52-week-high-equity-market`;
const ENDPOINT = '/api/live-analysis-data-52weekhighstock';

export type Nse52WeekHighRow = {
  symbol: string;
  companyName: string;
  series: string;
  ltp: number | null;
  change: number | null;
  pChange: number | null;
  new52WHL: number | null;
  prev52WHL: number | null;
  prevClose: number | null;
  prevHLDate: string | null;
  isEqSecurity: boolean;
  fromOfficialSecurityMaster: boolean;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function normalize52WeekHighPayload(payload: any, universe: Awaited<ReturnType<typeof loadNseEquityUniverse>>): Nse52WeekHighRow[] {
  const sourceRows = Array.isArray(payload?.data) ? payload.data : [];
  const bySymbol = new Map(universe.map(r => [r.symbol, r]));
  return sourceRows.map((r: any) => {
    const symbol = String(r?.symbol ?? '').trim().toUpperCase();
    const master = bySymbol.get(symbol);
    return {
      symbol,
      companyName: String(r?.comapnyName ?? r?.companyName ?? master?.companyName ?? '').trim(),
      series: String(r?.series ?? master?.series ?? '').trim().toUpperCase(),
      ltp: num(r?.ltp),
      change: num(r?.change),
      pChange: num(r?.pChange),
      new52WHL: num(r?.new52WHL),
      prev52WHL: num(r?.prev52WHL),
      prevClose: num(r?.prevClose),
      prevHLDate: r?.prevHLDate ? String(r.prevHLDate) : null,
      isEqSecurity: String(r?.series ?? '').toUpperCase() === 'EQ',
      fromOfficialSecurityMaster: Boolean(master),
    };
  }).filter(r => r.symbol);
}

export async function runNse52WeekHigh(options: { root: string; includePageScreenshot?: boolean }) {
  const { root, includePageScreenshot = true } = options;
  const rawDir = path.join(root, '52-week-high');
  const debugDir = path.join(root, 'debug');
  await ensureDir(rawDir); await ensureDir(debugDir);
  const debug = new DebugLogger(debugDir, process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ adapter: 'NSE52WeekHigh', node: process.version, cwd: process.cwd(), root });
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const session = `stock-research-nse-52wh-${Date.now()}`;

  try {
    await debug.emit('NSE/52WH/PAGE', 'START', 'Opening NSE 52-week high equity market page', { url: PAGE_URL });
    if (includePageScreenshot) {
      const state = await getBrowserSession(session, 'nse');
      await state.page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      await state.page.waitForTimeout(3000);
      await state.page.screenshot({ path: path.join(rawDir, '52-week-high.png'), fullPage: true }).catch(() => {});
      await closeBrowserSession(session);
    }
    const payload = await nseFetchJson(ENDPOINT, { cwd: process.cwd(), session, referer: PAGE_URL });
    const rawPath = path.join(rawDir, '52-week-high.json');
    await writeFile(rawPath, JSON.stringify(payload, null, 2), 'utf8');
    const universe = await loadNseEquityUniverse(process.cwd());
    const normalized = normalize52WeekHighPayload(payload, universe);
    const normalizedPath = path.join(rawDir, '52-week-high.normalized.json');
    const equity = normalized.filter(r => r.series === 'EQ');
    await writeFile(normalizedPath, JSON.stringify({
      schema_version: '1.0', source: 'NSE India API', endpoint: `${NSE_BASE}${ENDPOINT}`,
      retrievedAt: new Date().toISOString(), high: payload?.high ?? null, timestamp: payload?.timestamp ?? null,
      totalRows: normalized.length, equityRows: equity.length, rows: normalized,
      freshness: { sourceAsOf: payload?.timestamp ?? null, retrievedAt: new Date().toISOString(), archiveDate: path.basename(root).replace(/^52-Week-High-/, '') },
    }, null, 2), 'utf8');
    await writeFile(path.join(rawDir, '52-week-high-symbols.json'), JSON.stringify({
      generatedAt: new Date().toISOString(), symbols: equity.map(r => r.symbol), count: equity.length,
    }, null, 2), 'utf8');
    await debug.emit('NSE/52WH/VALIDATION', normalized.length ? 'OK' : 'WARN', 'NSE 52-week high dataset acquired and normalized', {
      rawRows: Array.isArray(payload?.data) ? payload.data.length : 0, normalizedRows: normalized.length, equityRows: equity.length,
      pageScreenshot: includePageScreenshot ? 'attempted' : 'disabled'
    });
    artifacts.push({ id: 'nse-52-week-high-raw', type: 'market_data', provider: 'NSE India API', title: 'NSE 52-week high equity market data', url: `${NSE_BASE}${ENDPOINT}`, localPath: rawPath, retrievedAt: new Date().toISOString(), status: normalized.length ? 'ok' : 'partial', method: 'script' });
    artifacts.push({ id: 'nse-52-week-high-normalized', type: 'derived_data', provider: 'NSE India API', title: 'Normalized NSE 52-week high equity market data', url: `${NSE_BASE}${ENDPOINT}`, localPath: normalizedPath, retrievedAt: new Date().toISOString(), status: normalized.length ? 'ok' : 'partial', method: 'script', notes: [`rows=${normalized.length}`, `equityRows=${equity.length}`] });
    if (includePageScreenshot) artifacts.push({ id: 'nse-52-week-high-page', type: 'source_page', provider: 'NSE India', title: 'NSE 52-week high equity market page', url: PAGE_URL, localPath: path.join(rawDir, '52-week-high.png'), retrievedAt: new Date().toISOString(), status: 'ok', method: 'playwright' });
    return { artifacts, gaps, warnings, summary: { rows: normalized.length, equityRows: equity.length, high: payload?.high ?? null, timestamp: payload?.timestamp ?? null } };
  } catch (e: any) {
    const msg = e?.message || String(e);
    gaps.push(`NSE 52-week high acquisition failed: ${msg}`);
    await debug.emit('NSE/52WH/VALIDATION', 'ERROR', 'NSE 52-week high dataset failed', { error: msg });
    return { artifacts, gaps, warnings, summary: { rows: 0, equityRows: 0 } };
  } finally { await closeBrowserSession(session).catch(() => {}); }
}
