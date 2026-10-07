import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { browserGoto, closeBrowserSession, getBrowserSession, resetBrowserSession } from '../lib/browser.js';
import { nseFetchJson, nseEndpoints } from '../lib/nse-api-client.js';
import { ensureDir, writeText } from '../lib/fs.js';
import { downloadFile } from '../lib/download.js';
import { DebugLogger } from '../lib/debug.js';
import { evaluateHistoricalQuality, writeQualityReport } from '../lib/data-quality.js';
import { captureLiveMarketPage } from './nse-market-universe.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';
import { normalizeMetaData, normalizeSymbolChartData, normalizeSymbolData, normalizeSymbolName, resolveQuoteIdentifier, normalizeYearwise, quoteToFacts } from '../lib/nse-nextapi-normalizer.js';
import { normalizeAnnualReports, normalizeAnnouncements, normalizeBoardMeetings, normalizeFinancialRows, normalizePeers, normalizeShareholding, toFinancialFacts } from '../lib/nse-nextapi-normalizers.js';

const NSE_BASE = 'https://www.nseindia.com';
const annualUrl = (ticker: string) => `${NSE_BASE}/companies-listing/corporate-filings-annual-reports?symbol=${encodeURIComponent(ticker)}&tabIndex=equity`;
const shareUrl = (ticker: string) => `${NSE_BASE}/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(ticker)}&tabIndex=equity`;
const liveMarketUrl = () => `${NSE_BASE}/market-data/live-equity-market`;
const quotePageUrl = (ticker: string) => `${NSE_BASE}/get-quote/equity/${encodeURIComponent(ticker)}`;

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function rowsFromHistorical(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.priceVolume)) return data.priceVolume;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function formatNseDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function snapshotDateKey(date = new Date()): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function snapshotDateTimeKey(date = new Date()): string {
  return new Date(date).toISOString().replace(/[:.]/g,'-');
}

async function writeNseApiArtifact(
  ctx: AdapterContext,
  debug: DebugLogger,
  artifacts: SourceArtifact[],
  specId: string,
  title: string,
  endpoint: string,
  data: any,
  family: string,
  options: { normalized?: any; status?: SourceArtifact['status']; notes?: string[] } = {},
) {
  const dir = path.join(ctx.researchDir, 'raw', 'nse-api', 'nextapi', family);
  await ensureDir(dir);
  const rawName = specId.endsWith('.json') ? specId : `${specId}.json`;
  const rawPath = path.join(dir, rawName);
  await writeText(rawPath, JSON.stringify(data, null, 2));
  let normalizedPath: string | undefined;
  if (options.normalized !== undefined) {
    normalizedPath = path.join(dir, rawName.replace(/\.json$/i, '-normalized.json'));
    await writeText(normalizedPath, JSON.stringify(options.normalized, null, 2));
  }
  const inferredType: SourceArtifact['type'] =
    family === 'financials' ? 'financials' :
    family === 'ownership' ? 'shareholding' :
    family === 'annual_reports' ? 'annual_report' :
    family === 'market' ? 'market_data' :
    family === 'corporate' ? 'news' :
    family === 'peers' ? 'derived_data' : 'source_page';
  const artifact: SourceArtifact = {
    id: `nse-nextapi-${specId.replace(/\.json$/i,'')}`,
    type: inferredType,
    provider: 'NSE India API',
    title,
    url: `${NSE_BASE}${endpoint}`,
    localPath: rawPath,
    retrievedAt: new Date().toISOString(),
    status: options.status ?? 'ok',
    method: 'script',
    notes: [...(options.notes ?? []), ...(normalizedPath ? [`normalized=${normalizedPath}`] : [])],
  };
  artifacts.push(artifact);
  await debug.emit(`NSE/NEXTAPI/${family}/${rawName}`, artifact.status === 'ok' ? 'OK' : 'WARN', `${title} acquired`, {
    endpoint: `${NSE_BASE}${endpoint}`,
    path: artifactPath(process.cwd(), rawPath),
    normalizedPath: normalizedPath ? artifactPath(process.cwd(), normalizedPath) : undefined,
    payload: payloadSummary(data),
  });
  return artifact;
}

function dateOnlyMinusDays(days: number): { fromDate: string; toDate: string } {
  const to = startOfUtcDay(new Date());
  const from = addUtcDays(to, -Math.max(1, days));
  return { fromDate: formatNseDate(from), toDate: formatNseDate(to) };
}

function buildHistoricalChunks(from: Date, to: Date, chunkDays: number, overlapDays: number) {
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);

  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(addUtcDays(cursor, chunkDays - 1).getTime(), end.getTime()));
    chunks.push({ from: formatNseDate(cursor), to: formatNseDate(chunkEnd) });
    if (chunkEnd >= end) break;
    cursor = addUtcDays(chunkEnd, 1 - Math.max(0, overlapDays));
  }

  return chunks;
}

function parseNseHistoricalDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function historicalRowKey(row: any): string | null {
  const rawDate = row?.CH_TIMESTAMP ?? row?.mTIMESTAMP ?? row?.Date ?? row?.date ?? row?.DATE;
  const parsed = parseNseHistoricalDate(rawDate);
  if (!parsed) return null;
  const date = parsed.toISOString().slice(0, 10);
  const series = String(row?.CH_SERIES ?? row?.series ?? row?.SERIES ?? '').trim().toUpperCase();
  const symbol = String(row?.CH_SYMBOL ?? row?.symbol ?? '').trim().toUpperCase();
  return `${symbol}|${series}|${date}`;
}

function normalizeHistorical(rows: any[]) {
  return rows
    .filter((r: any) => !r?.CH_SERIES || r.CH_SERIES === 'EQ')
    .map((r: any) => ({
      symbol: r?.CH_SYMBOL ?? null,
      series: r?.CH_SERIES ?? null,
      timestamp: r?.mTIMESTAMP ?? r?.CH_TIMESTAMP ?? r?.Date ?? r?.date ?? null,
      previousClose: num(r?.CH_PREVIOUS_CLS_PRICE),
      open: num(r?.CH_OPENING_PRICE),
      high: num(r?.CH_TRADE_HIGH_PRICE),
      low: num(r?.CH_TRADE_LOW_PRICE),
      last: num(r?.CH_LAST_TRADED_PRICE),
      close: num(r?.CH_CLOSING_PRICE),
      vwap: num(r?.VWAP),
      volume: num(r?.CH_TOT_TRADED_QTY),
      turnover: num(r?.CH_TOT_TRADED_VAL),
      trades: num(r?.CH_TOTAL_TRADES),
      deliveryQuantity: num(r?.COP_DELIV_QTY ?? r?.CH_DELIVERABLE_QTY ?? r?.DELIV_QTY),
      deliveryPercent: num(r?.COP_DELIV_PERC ?? r?.CH_DELIV_PER ?? r?.DELIV_PER),
      corporateActions: r?.CA ?? null,
    }));
}

function flattenUrls(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) || /^\/[^/]/.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) { for (const v of value) flattenUrls(v, out); return; }
  if (value && typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) flattenUrls(v, out);
}

function normalizeUrl(raw: string): string | null {
  try { return new URL(raw, NSE_BASE).toString(); } catch { return null; }
}

function isPdfUrl(value: string) {
  try {
    const u = new URL(value, NSE_BASE);
    return /\.pdf$/i.test(u.pathname);
  } catch { return false; }
}

function likelyShareholdingEndpoint(url: string) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (!p.includes('/api/')) return false;
    if (p.includes('corporate-share-holdings-master')) return true;
    return (p.includes('shareholding') || p.includes('share-hold')) && !p.includes('getnotes');
  } catch { return false; }
}

function looksLikeShareholdingPayload(json: any): boolean {
  const s = JSON.stringify(json ?? '').toLowerCase();
  return /promoter|promoters|fii|foreign institutional|dii|public shareholding|non-promoter/.test(s)
    && /holding|shareholding|shares/.test(s);
}

function extractQuoteFromPayload(payload: any, ticker: string) {
  const symbol = ticker.toUpperCase();
  const candidates: any[] = [];
  const walk = (v: any, parentKey = '') => {
    if (!v) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, parentKey); return; }
    if (typeof v !== 'object') return;
    const text = JSON.stringify(v).toLowerCase();
    const hasPrice = v.lastPrice != null || v.lastTradedPrice != null || v.ltp != null || v.close != null || v.previousClose != null;
    const hasSymbol = String(v.symbol ?? v.tradingSymbol ?? '').toUpperCase() === symbol || text.includes(`"${symbol.toLowerCase()}"`);
    if (hasPrice && (hasSymbol || /equityresponse|orderbook|marketwatch|stocks/i.test(parentKey))) candidates.push(v);
    for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(payload, 'root');
  if (!candidates.length) return null;
  return candidates[0];
}

function buildNormalizedQuote(raw: any, ticker: string) {
  const source = raw?.equityResponse?.[0] ?? raw?.data?.[0] ?? raw?.data ?? raw;
  const orderBook = source?.orderBook ?? {};
  const info = source?.metadata ?? source?.securityInfo ?? source?.info ?? {};
  const pick = (...vals: any[]) => vals.find(v => v !== undefined && v !== null && v !== '') ?? null;
  return {
    ticker,
    symbol: pick(source?.symbol, raw?.symbol, ticker),
    companyName: pick(source?.companyName, raw?.info?.companyName, info?.companyName),
    isin: pick(source?.isin, raw?.info?.isin, info?.isin),
    lastPrice: num(pick(source?.lastPrice, source?.last, source?.ltp, orderBook?.lastPrice)),
    previousClose: num(pick(source?.previousClose, source?.prevClose, source?.preClose)),
    open: num(pick(source?.open, source?.openPrice)),
    dayHigh: num(pick(source?.dayHigh, source?.high, source?.dayHighPrice)),
    dayLow: num(pick(source?.dayLow, source?.low, source?.dayLowPrice)),
    change: num(pick(source?.change, source?.netChange)),
    pChange: num(pick(source?.pChange, source?.percentChange)),
    vwap: num(pick(source?.vwap, source?.averagePrice)),
    totalTradedVolume: num(pick(source?.totalTradedVolume, source?.quantity, source?.tradedQuantity)),
    totalTradedValue: num(pick(source?.totalTradedValue, source?.turnover)),
    upperCircuit: num(pick(source?.upperCP, source?.upperCircuit)),
    lowerCircuit: num(pick(source?.lowerCP, source?.lowerCircuit)),
    totalBuyQuantity: num(pick(source?.totalBuyQuantity, orderBook?.totalBuyQuantity)),
    totalSellQuantity: num(pick(source?.totalSellQuantity, orderBook?.totalSellQuantity)),
    source: 'NSE India',
    rawShape: raw,
  };
}

async function collectNsePage(url: string, session: string, screenshotPath: string, rawJsonPath: string) {
  let state = await getBrowserSession(session, 'nse');
  let network: any[] = [];
  const attach = () => {
    const onResponse = async (response: any) => {
      const u = response.url();
      if (!/\/api\//i.test(u)) return;
      try {
        const headers = response.headers();
        const ct = String(headers['content-type'] || '').toLowerCase();
        const text = await response.text();
        network.push({ url: u, status: response.status(), contentType: ct, text });
      } catch {}
    };
    state.page.on('response', onResponse);
    return onResponse;
  };

  let listener = attach();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await state.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await state.page.waitForTimeout(5_000);
        break;
      } catch (error) {
        state.page.removeListener('response', listener);
        const msg = String((error as any)?.message || error);
        if (attempt < 2 && /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ERR_FAILED|Timeout/i.test(msg)) {
          state = await resetBrowserSession(session, 'nse');
          network = [];
          listener = attach();
          continue;
        }
        throw error;
      }
    }
    const links = await state.page.locator('a').evaluateAll((els: any[]) =>
      els.map((a: any) => ({ text: (a.innerText || a.textContent || '').trim(), href: a.href })).filter((x: any) => x.href));
    const text = await state.page.locator('body').innerText().catch(() => '');
    const html = await state.page.content();
    const result = { url: state.page.url(), title: await state.page.title(), text, html, links, network };
    await writeText(rawJsonPath, JSON.stringify(result, null, 2));
    await state.page.screenshot({ path: screenshotPath, fullPage: true });
    return result;
  } finally {
    state.page.removeListener('response', listener);
  }
}

function parseNetwork(data: any) {
  return (Array.isArray(data?.network) ? data.network : []).map((n: any) => {
    if (!n?.text) return { ...n, json: null };
    try { return { ...n, json: JSON.parse(n.text) }; }
    catch { return { ...n, json: null }; }
  });
}

function pdfCandidates(data: any): { url: string; text: string; source: string }[] {
  const found = new Map<string, { text: string; source: string }>();
  for (const link of Array.isArray(data?.links) ? data.links : []) {
    const href = normalizeUrl(String(link?.href || ''));
    if (href && isPdfUrl(href)) found.set(href, { text: String(link?.text || ''), source: 'dom' });
  }
  for (const item of parseNetwork(data)) {
    if (/application\/pdf/i.test(String(item.contentType || ''))) {
      const u = normalizeUrl(item.url);
      if (u) found.set(u, { text: '', source: 'network-pdf-response' });
    }
    const urls = new Set<string>();
    flattenUrls(item.json, urls);
    for (const candidate of urls) {
      const u = normalizeUrl(candidate);
      if (u && isPdfUrl(u)) found.set(u, { text: '', source: item.url || 'network-json' });
    }
  }
  return [...found.entries()].map(([url, meta]) => ({ url, ...meta }));
}

function relevantShareholdingNetwork(data: any) {
  return parseNetwork(data).filter((item: any) => likelyShareholdingEndpoint(String(item.url || '')) && looksLikeShareholdingPayload(item.json));
}

async function runQuoteFallback(ctx: AdapterContext, session: string, apiDir: string, screens: string, warnings: string[], debug: DebugLogger) {
  const quotePath = path.join(apiDir, 'quote.json');
  const auditPath = path.join(ctx.researchDir, 'raw', 'nse-quote-audit.json');
  const liveRoot = path.join(ctx.researchDir, 'raw', 'nse-market');
  const target = ctx.ticker.toUpperCase();

  // Fallback A: first verify the symbol on NSE's public live-equity-market page,
  // then acquire that symbol one-by-one through the same GetQuoteApi route.
  if (await pageIsUsable(session)) {
    try {
      await debug.emit('NSE/QUOTE/LIVE_MARKET', 'START', 'Verifying target ticker on NSE live-equity-market page', { ticker: target, url: liveMarketUrl() });
      const live = await captureLiveMarketPage(session, debug, liveRoot);
      const discovered = live.symbols.includes(target);
      await debug.emit('NSE/QUOTE/LIVE_MARKET', discovered ? 'OK' : 'WARN', discovered ? 'Target ticker found on live equity market page' : 'Target ticker was not found on live equity market page; direct quote fallback will continue', { ticker: target, symbolCount: live.symbols.length, discovered });

      if (discovered) {
        const alt = await nseFetchJson(nseEndpoints.quoteNextApi(ctx.ticker), { cwd: process.cwd(), session, referer: liveMarketUrl() });
        await writeText(path.join(apiDir, 'quote-nextapi.json'), JSON.stringify(alt, null, 2));
        const normalized = buildNormalizedQuote(alt, ctx.ticker);
        await writeText(path.join(apiDir, 'quote-normalized.json'), JSON.stringify(normalized, null, 2));
        if (normalized.lastPrice != null) {
          await writeText(quotePath, JSON.stringify(alt, null, 2));
          if (!ctx.companyName) ctx.companyName = normalized.companyName || undefined;
          if (!ctx.isin) ctx.isin = normalized.isin ? String(normalized.isin).toUpperCase() : undefined;
          return { recovered: true, artifact: {
            id: 'nse-api-quote-live-market-nextapi-fallback', type: 'market_data', provider: 'NSE India API', title: 'NSE quote verified from live-equity-market then acquired via GetQuoteApi', url: `${NSE_BASE}${nseEndpoints.quoteNextApi(ctx.ticker)}`, localPath: path.join(apiDir, 'quote-nextapi.json'), screenshotPath: path.join(liveRoot, 'live-equity-market.png'), retrievedAt: new Date().toISOString(), status: 'ok_with_fallback', method: 'script', notes: ['Target symbol was first discovered on NSE live-equity-market; quote acquired one-by-one with NextApi getSymbolData.']
          } as SourceArtifact };
        }
      }
    } catch (e: any) {
      warnings.push(`NSE live-market target verification: ${e?.message || String(e)}`);
    }
  }

  // Fallback B: direct deterministic GetQuoteApi route if live-page verification failed.
  try {
    const alt = await nseFetchJson(nseEndpoints.quoteNextApi(ctx.ticker), { cwd: process.cwd(), session, referer: liveMarketUrl() });
    await writeText(path.join(apiDir, 'quote-nextapi.json'), JSON.stringify(alt, null, 2));
    const normalized = buildNormalizedQuote(alt, ctx.ticker);
    await writeText(path.join(apiDir, 'quote-normalized.json'), JSON.stringify(normalized, null, 2));
    if (normalized.lastPrice != null) {
      await writeText(quotePath, JSON.stringify(alt, null, 2));
      if (!ctx.companyName) ctx.companyName = normalized.companyName || undefined;
      if (!ctx.isin) ctx.isin = normalized.isin ? String(normalized.isin).toUpperCase() : undefined;
      return { recovered: true, artifact: {
        id: 'nse-api-quote-nextapi-fallback', type: 'market_data', provider: 'NSE India API', title: 'NSE quote (NextApi fallback)', url: `${NSE_BASE}${nseEndpoints.quoteNextApi(ctx.ticker)}`, localPath: path.join(apiDir, 'quote-nextapi.json'), retrievedAt: new Date().toISOString(), status: 'ok_with_fallback', method: 'script', notes: ['Primary quote-equity route returned 403; alternate GetQuoteApi route returned usable quote data.']
      } as SourceArtifact };
    }
  } catch (e: any) { warnings.push(`NSE alternate quote API: ${e?.message || String(e)}`); }

  // Fallback C: live-equity-market network payload, for deployments where GetQuoteApi is unavailable.
  try {
    const data = await collectNsePage(liveMarketUrl(), session, path.join(screens, 'nse-live-market-audit.png'), auditPath);
    for (const item of parseNetwork(data)) {
      if (!item.json) continue;
      const candidate = extractQuoteFromPayload(item.json, ctx.ticker);
      if (!candidate) continue;
      const rawPayloadPath = path.join(apiDir, 'quote-live-market.json');
      const normalizedPath = path.join(apiDir, 'quote-normalized.json');
      await writeText(rawPayloadPath, JSON.stringify(item.json, null, 2));
      const normalized = buildNormalizedQuote(candidate, ctx.ticker);
      await writeText(normalizedPath, JSON.stringify(normalized, null, 2));
      if (normalized.lastPrice == null) continue;
      await writeText(quotePath, JSON.stringify(item.json, null, 2));
      if (!ctx.companyName) ctx.companyName = normalized.companyName || undefined;
      if (!ctx.isin) ctx.isin = normalized.isin ? String(normalized.isin).toUpperCase() : undefined;
      return { recovered: true, artifact: {
        id: 'nse-api-quote-live-market-fallback', type: 'market_data', provider: 'NSE India', title: 'NSE quote recovered from live equity market network', url: item.url, localPath: rawPayloadPath, screenshotPath: path.join(screens, 'nse-live-market-audit.png'), retrievedAt: new Date().toISOString(), status: 'ok_with_fallback', method: 'playwright', notes: ['Quote-equity route returned 403; live-equity-market network payload contained the target symbol.']
      } as SourceArtifact };
    }
  } catch (e: any) { warnings.push(`NSE live-market quote fallback: ${e?.message || String(e)}`); }

  // Fallback D: quote page only as audit/network fallback.
  try {
    const data = await collectNsePage(quotePageUrl(ctx.ticker), session, path.join(screens, 'nse-quote-audit.png'), auditPath);
    const usable = parseNetwork(data).find((item: any) => /quote-equity|getquoteapi/i.test(String(item.url || '')) && item.json && extractQuoteFromPayload(item.json, ctx.ticker));
    if (usable) {
      await writeText(quotePath, JSON.stringify(usable.json, null, 2));
      const normalized = buildNormalizedQuote(extractQuoteFromPayload(usable.json, ctx.ticker), ctx.ticker);
      await writeText(path.join(apiDir, 'quote-normalized.json'), JSON.stringify(normalized, null, 2));
      return { recovered: normalized.lastPrice != null, artifact: {
        id: 'nse-api-quote-page-fallback', type: 'market_data', provider: 'NSE India', title: 'NSE quote recovered from quote page network', url: usable.url, localPath: quotePath, screenshotPath: path.join(screens, 'nse-quote-audit.png'), retrievedAt: new Date().toISOString(), status: normalized.lastPrice != null ? 'ok' : 'partial', method: 'playwright', notes: ['Audit/fallback only; not part of the primary acquisition path.']
      } as SourceArtifact };
    }
  } catch (e: any) { warnings.push(`NSE quote-page audit fallback: ${e?.message || String(e)}`); }
  return { recovered: false };
}

async function readTextSafe(file: string) { try { return await readFile(file, 'utf8'); } catch { return null; } }

async function pageIsUsable(session: string) {
  try {
    const state = await getBrowserSession(session, 'nse');
    return !state.page.isClosed();
  } catch {
    return false;
  }
}

function payloadSummary(data: any) {
  if (Array.isArray(data)) return { kind: 'array', items: data.length };
  if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    const arrays: Record<string, number> = {};
    for (const [k, v] of Object.entries(data)) if (Array.isArray(v)) arrays[k] = v.length;
    return { kind: 'object', keys: keys.slice(0, 30), arrayCounts: arrays };
  }
  return { kind: typeof data };
}

function historicalValidation(
  rawRows: any[],
  normalized: any[],
  requestedFrom: Date,
  requestedTo: Date,
  chunkCount: number,
) {
  const dates = normalized
    .map(r => parseNseHistoricalDate(r?.timestamp))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime());

  const uniqueDateKeys = new Set(
    dates.map(d => d.toISOString().slice(0, 10))
  );

  const earliestDate = dates.length ? dates[0] : null;
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  const earliest = earliestDate?.toISOString() ?? null;
  const latest = latestDate?.toISOString() ?? null;

  const requestedStart = startOfUtcDay(requestedFrom);
  const requestedEnd = startOfUtcDay(requestedTo);
  const requestedDays = Math.max(1, Math.round((requestedEnd.getTime() - requestedStart.getTime()) / 86400000) + 1);
  const coverageDays = earliestDate && latestDate
    ? Math.max(1, Math.round((latestDate.getTime() - earliestDate.getTime()) / 86400000) + 1)
    : 0;

  const coverageRatio = requestedDays > 0 ? Math.min(1, coverageDays / requestedDays) : 0;
  const equityRows = rawRows.filter(r => String(r?.CH_SERIES ?? r?.series ?? '').trim().toUpperCase() === 'EQ').length;
  const seriesCounts: Record<string, number> = {};
  for (const r of rawRows) {
    const series = String(r?.CH_SERIES ?? r?.series ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    seriesCounts[series] = (seriesCounts[series] || 0) + 1;
  }

  return {
    requestedFrom: requestedStart.toISOString(),
    requestedTo: requestedEnd.toISOString(),
    rawRows: rawRows.length,
    normalizedRows: normalized.length,
    uniqueDates: uniqueDateKeys.size,
    duplicateDates: Math.max(0, dates.length - uniqueDateKeys.size),
    earliest,
    latest,
    coverageDays,
    requestedDays,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    chunkCount,
    equityRows,
    seriesCounts,
    lowCoverage: normalized.length === 0 || coverageRatio < 0.90,
    empty: normalized.length === 0,
  };
}

function countWeekdays(start: Date, end: Date) {
  const a = new Date(start.getTime());
  const b = new Date(end.getTime());
  a.setUTCHours(0, 0, 0, 0);
  b.setUTCHours(0, 0, 0, 0);
  let count = 0;
  for (const d = a; d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function artifactPath(root: string, target: string) {
  return path.relative(root, target).replace(/\\/g, '/');
}

export async function runNse(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const session = `${process.env.PLAYWRIGHT_SESSION_PREFIX || 'stock-research'}-${ctx.ticker}-nse`;
  const apiDir = path.join(ctx.researchDir, 'raw', 'nse-api');
  const rawReports = path.join(ctx.researchDir, 'raw', 'annual-reports', 'nse');
  const rawShare = path.join(ctx.researchDir, 'raw', 'shareholding', 'nse');
  const screens = path.join(ctx.researchDir, 'screenshots');
  const debugDir = path.join(ctx.researchDir, 'debug');
  await Promise.all([ensureDir(apiDir), ensureDir(rawReports), ensureDir(rawShare), ensureDir(screens), ensureDir(debugDir)]);

  const debug = new DebugLogger(debugDir, process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({
    ticker: ctx.ticker,
    adapter: 'NSE',
    node: process.version,
    cwd: process.cwd(),
    researchDir: ctx.researchDir,
  });

  const started = Date.now();
  await debug.emit('NSE/SESSION', 'START', 'Preparing NSE acquisition session', {
    session,
    apiDir: artifactPath(process.cwd(), apiDir),
    debugDir: artifactPath(process.cwd(), debugDir),
  });

  let playwrightReady = false;
  try {
    await getBrowserSession(session, 'nse');
    playwrightReady = true;
    await debug.emit('NSE/PLAYWRIGHT', 'OK', 'Playwright browser session ready', {
      session,
      mode: 'library',
    });
  } catch (e: any) {
    const message = e?.message || String(e);
    warnings.push(`Playwright unavailable: ${message}`);
    await debug.emit('NSE/PLAYWRIGHT', 'WARN', 'Playwright browser unavailable; API-only acquisition will continue', { error: message });
  }

  // NSE NextApi is the canonical quote/instrument route. The legacy /api/quote-equity endpoint
  // is no longer part of the normal acquisition path because it routinely returns 403 while the
  // NextApi GetQuoteApi route provides the full instrument payload needed for analysis.
  let quoteAvailable = false;
  const nextApiJobs = [
    ['nse-api-symbol-name', nseEndpoints.symbolName(ctx.ticker), 'symbol-name.json', 'source_page', 'NSE NextApi symbol-name'],
    ['nse-api-symbol-metadata', nseEndpoints.metadata(ctx.ticker), 'symbol-metadata.json', 'source_page', 'NSE NextApi metadata'],
    ['nse-api-symbol-data', nseEndpoints.quoteNextApi(ctx.ticker), 'quote-nextapi.json', 'market_data', 'NSE NextApi symbol-data'],
  ] as const;

  let symbolData: any = null;
  let symbolIdentifier = `${ctx.ticker.toUpperCase()}EQN`;

  for (const [id, endpoint, filename, type, title] of nextApiJobs) {
    const t0 = Date.now();
    await debug.emit(`NSE/NEXTAPI/${filename}`, 'START', title, { method:'GET', endpoint:`${NSE_BASE}${endpoint}` });
    try {
      const data = await nseFetchJson(endpoint, { cwd: process.cwd(), session, referer: liveMarketUrl() });
      const out = path.join(apiDir, filename);
      await writeText(out, JSON.stringify(data, null, 2));
      artifacts.push({ id, type:type as any, provider:'NSE India API', title, url:`${NSE_BASE}${endpoint}`, localPath:out, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:['Canonical NSE NextApi acquisition route.'] });
      const details:any = { statusCode:200, path:artifactPath(process.cwd(), out), durationMs:Date.now()-t0, payload:payloadSummary(data) };
      if (id === 'nse-api-symbol-name') {
        const identity = normalizeSymbolName(data, ctx.ticker);
        await writeText(path.join(apiDir,'symbol-name-normalized.json'), JSON.stringify(identity,null,2));
        if (identity.companyName && !ctx.companyName) ctx.companyName = identity.companyName;
        if (identity.isin && !ctx.isin) ctx.isin = identity.isin.toUpperCase();
        details.normalized = identity;
      } else if (id === 'nse-api-symbol-metadata') {
        const metadata = normalizeMetaData(data, ctx.ticker);
        await writeText(path.join(apiDir,'symbol-metadata-normalized.json'), JSON.stringify(metadata,null,2));
        if (metadata.companyName && !ctx.companyName) ctx.companyName = metadata.companyName;
        if (metadata.isin && !ctx.isin) ctx.isin = metadata.isin.toUpperCase();
        details.normalized = metadata;
      } else if (id === 'nse-api-symbol-data') {
        symbolData = data;
        const normalized = normalizeSymbolData(data, ctx.ticker);
        symbolIdentifier = resolveQuoteIdentifier(normalized, ctx.ticker);
        quoteAvailable = normalized.lastPrice != null;
        await writeText(path.join(apiDir,'quote-normalized.json'), JSON.stringify(normalized,null,2));
        await writeText(path.join(apiDir,'symbol-data-normalized.json'), JSON.stringify(normalized,null,2));
        const nextFacts = quoteToFacts(normalized, id, new Date().toISOString());
        await writeText(path.join(apiDir,'quote-facts.json'), JSON.stringify(nextFacts,null,2));
        if (normalized.companyName && !ctx.companyName) ctx.companyName = normalized.companyName;
        if (normalized.isin && !ctx.isin) ctx.isin = normalized.isin.toUpperCase();
        details.normalized = { ...normalized, rawShape: undefined };
        details.identifier = symbolIdentifier;
        details.lastPrice = normalized.lastPrice;
      }
      await debug.emit(`NSE/NEXTAPI/${filename}`, 'OK', `${title} acquired`, details, Date.now()-t0);
    } catch (e:any) {
      const message=e?.message||String(e);
      warnings.push(`${title}: ${message}`);
      await debug.emit(`NSE/NEXTAPI/${filename}`, 'WARN', `${title} failed`, { error:message, durationMs:Date.now()-t0 }, Date.now()-t0);
    }
  }

  if (quoteAvailable && symbolData) {
    const normalized = normalizeSymbolData(symbolData, ctx.ticker);
    const identifier = resolveQuoteIdentifier(normalized, ctx.ticker);
    symbolIdentifier = identifier;
    await debug.emit('NSE/NEXTAPI/SYMBOL_BUNDLE', 'START', 'Fetching yearwise performance and 1D chart data from the canonical symbol identifier', { ticker:ctx.ticker, identifier });
    const extraJobs = [
      ['nse-api-yearwise', nseEndpoints.yearwise(identifier), 'yearwise.json', 'market_data', 'NSE NextApi yearwise performance'],
      ['nse-api-symbol-chart-1d', nseEndpoints.symbolChart(identifier), 'symbol-chart-1d.json', 'market_data', 'NSE NextApi 1D symbol chart data'],
    ] as const;
    for (const [id, endpoint, filename, type, title] of extraJobs) {
      const t0=Date.now();
      try {
        const data=await nseFetchJson(endpoint,{cwd:process.cwd(),session,referer:`${NSE_BASE}/get-quote/equity/${encodeURIComponent(ctx.ticker)}`});
        const out=path.join(apiDir,filename); await writeText(out,JSON.stringify(data,null,2));
        const normalizedData = id === 'nse-api-yearwise' ? normalizeYearwise(data) : normalizeSymbolChartData(data);
        const normalizedName = filename.replace('.json','-normalized.json');
        const normalizedPath=path.join(apiDir,normalizedName);
        await writeText(normalizedPath,JSON.stringify(normalizedData,null,2));
        artifacts.push({ id, type:type as any, provider:'NSE India API', title, url:`${NSE_BASE}${endpoint}`, localPath:out, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:[`identifier=${identifier}`,`normalizedRows=${Array.isArray(normalizedData)?normalizedData.length:1}`] });
        await debug.emit(`NSE/NEXTAPI/${filename}`,'OK',`${title} acquired`,{statusCode:200,path:artifactPath(process.cwd(),out),normalizedPath:artifactPath(process.cwd(),normalizedPath),normalizedRows:Array.isArray(normalizedData)?normalizedData.length:1,durationMs:Date.now()-t0},Date.now()-t0);
      } catch(e:any) {
        const message=e?.message||String(e); warnings.push(`${title}: ${message}`); await debug.emit(`NSE/NEXTAPI/${filename}`,'WARN',`${title} failed`,{error:message,durationMs:Date.now()-t0},Date.now()-t0);
      }
    }
    const bundlePath=path.join(apiDir,'nextapi-normalized.json');
    const quoteNorm=await readTextSafe(path.join(apiDir,'quote-normalized.json'));
    const metaNorm=await readTextSafe(path.join(apiDir,'symbol-metadata-normalized.json'));
    const nameNorm=await readTextSafe(path.join(apiDir,'symbol-name-normalized.json'));
    const yearNorm=await readTextSafe(path.join(apiDir,'yearwise-normalized.json'));
    const chartNorm=await readTextSafe(path.join(apiDir,'symbol-chart-1d-normalized.json'));
    await writeText(bundlePath, JSON.stringify({schema_version:'1.0',ticker:ctx.ticker,identifier,symbolName:nameNorm?JSON.parse(nameNorm):null,metadata:metaNorm?JSON.parse(metaNorm):null,quote:quoteNorm?JSON.parse(quoteNorm):null,yearwise:yearNorm?JSON.parse(yearNorm):[],chart1d:chartNorm?JSON.parse(chartNorm):[],deterministic:true,llmUsed:false},null,2));
    artifacts.push({ id:'nse-api-nextapi-normalized-bundle', type:'derived_data', provider:'NSE India API', title:'Canonical NSE NextApi normalized instrument bundle', url:`${NSE_BASE}${nseEndpoints.quoteNextApi(ctx.ticker)}`, localPath:bundlePath, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:[`identifier=${identifier}`] });
    await debug.emit('NSE/NEXTAPI/SYMBOL_BUNDLE','OK','Canonical NSE NextApi instrument bundle completed',{ticker:ctx.ticker,identifier,lastPrice:normalized.lastPrice,indexCount:normalized.indexList.length},Date.now()-started);
  }

  // Expanded NSE NextApi research surface. These are the canonical per-symbol
  // endpoints used for corporate events, financial periods, ownership, peers,
  // compliance and annual-report discovery. All acquisition remains deterministic.
  const expandedDir = path.join(ctx.researchDir, 'raw', 'nse-api', 'nextapi');
  await ensureDir(expandedDir);
  const dateRange = dateOnlyMinusDays(Number(process.env.NSE_ANNOUNCEMENT_LOOKBACK_DAYS || 184));
  const expanded: Array<{ id:string; family:string; title:string; endpoint:string; normalize?:(data:any)=>any; }> = [
    { id:'corporate-announcement-subjects', family:'corporate', title:'NSE corporate announcement subject catalog', endpoint:nseEndpoints.corporateAnnouncementSubjects(ctx.ticker), normalize:d=>Array.isArray(d)?d:[] },
    { id:'corporate-announcements', family:'corporate', title:'NSE corporate announcements (rolling window)', endpoint:nseEndpoints.corporateAnnouncements(ctx.ticker,dateRange.fromDate,dateRange.toDate), normalize:normalizeAnnouncements },
    { id:'board-meetings', family:'corporate', title:'NSE corporate board meetings', endpoint:nseEndpoints.boardMeetings(ctx.ticker), normalize:normalizeBoardMeetings },
    { id:'corporate-actions', family:'corporate', title:'NSE corporate actions', endpoint:nseEndpoints.corporateActionsNextApi(ctx.ticker), normalize:d=>Array.isArray(d)?d:[] },
    { id:'event-calendar', family:'corporate', title:'NSE corporate event calendar', endpoint:nseEndpoints.eventCalendar(ctx.ticker), normalize:d=>Array.isArray(d)?d:(Array.isArray(d?.data)?d.data:[]) },
    { id:'brsr', family:'compliance', title:'NSE BRSR disclosure', endpoint:nseEndpoints.brsr(ctx.ticker), normalize:d=>d },
    { id:'shareholding-pattern', family:'ownership', title:'NSE shareholding pattern (5 records)', endpoint:nseEndpoints.shareholdingNextApi(ctx.ticker), normalize:normalizeShareholding },
    { id:'financial-result-data', family:'financials', title:'NSE financial result data (5 records)', endpoint:nseEndpoints.financialResultData(ctx.ticker), normalize:normalizeFinancialRows },
    { id:'financial-status', family:'financials', title:'NSE financial status', endpoint:nseEndpoints.financialStatus(ctx.ticker), normalize:normalizeFinancialRows },
    { id:'peer-comparison-quarters', family:'peers', title:'NSE peer comparison quarter catalog', endpoint:nseEndpoints.peerQuarters(ctx.ticker), normalize:d=>Array.isArray(d)?d:[] },
  ];
  const expandedStarted = Date.now();
  await debug.emit('NSE/NEXTAPI/EXPANDED', 'START', 'Acquiring expanded per-symbol NSE NextApi research bundle', { ticker:ctx.ticker, announcementRange:dateRange, endpointCount:expanded.length });
  for (const job of expanded) {
    const t0=Date.now();
    try {
      const data=await nseFetchJson(job.endpoint,{cwd:process.cwd(),session,referer:`${NSE_BASE}/get-quote/equity/${encodeURIComponent(ctx.ticker)}`});
      const normalized=job.normalize ? job.normalize(data) : undefined;
      await writeNseApiArtifact(ctx,debug,artifacts,job.id,job.title,job.endpoint,data,job.family,{normalized,notes:[`announcementRange=${dateRange.fromDate}..${dateRange.toDate}`]});
      if (job.id==='financial-status' || job.id==='financial-result-data') {
        const rows=normalizeFinancialRows(data);
        const facts=toFinancialFacts(rows,`nse-nextapi-${job.id}`,new Date().toISOString());
        const factPath=path.join(ctx.researchDir,'raw','nse-api','nextapi','financials',`${job.id}-facts.json`);
        await writeText(factPath,JSON.stringify(facts,null,2));
      }
      await debug.emit(`NSE/NEXTAPI/${job.family}/${job.id}`, 'OK', 'Expanded NextApi endpoint complete', { durationMs:Date.now()-t0, normalizedRows:Array.isArray(normalized)?normalized.length:(normalized?.rows?.length ?? undefined) });
    } catch(e:any) {
      const message=e?.message||String(e);
      warnings.push(`NSE NextApi ${job.id}: ${message}`);
      await debug.emit(`NSE/NEXTAPI/${job.family}/${job.id}`, 'WARN', `${job.title} failed; continuing`, {error:message,durationMs:Date.now()-t0});
    }
  }

  // Annual reports are downloaded from the NextApi index when possible; the filing-page
  // discovery remains a fallback/audit route below.
  try {
    const data=await nseFetchJson(nseEndpoints.annualReports(ctx.ticker),{cwd:process.cwd(),session,referer:annualUrl(ctx.ticker)});
    const reports=normalizeAnnualReports(data);
    const annualDir=path.join(ctx.researchDir,'raw','annual-reports','nse','nextapi');
    await ensureDir(annualDir);
    await writeText(path.join(annualDir,'annual-reports-index.json'),JSON.stringify({schema_version:'1.0',ticker:ctx.ticker,reports,source:'NSE NextApi',retrievedAt:new Date().toISOString()},null,2));
    const limit=Math.max(1,Number(process.env.NSE_ANNUAL_REPORT_DOWNLOAD_LIMIT||5));
    let downloaded=0;
    for (const [i,r] of reports.slice(0,limit).entries()) {
      if (!r.fileName) continue;
      const ext=/\.(pdf|zip)$/i.exec(r.fileName)?.[1] || 'bin';
      const local=path.join(annualDir,`annual-report-${r.fromYear||'unknown'}-${r.toYear||'unknown'}.${ext}`.replace(/[^a-zA-Z0-9._-]/g,'-'));
      try { const result=await downloadFile(r.fileName,local,{Referer:annualUrl(ctx.ticker), 'User-Agent':process.env.NSE_USER_AGENT||'Mozilla/5.0'}); downloaded++; artifacts.push({id:`nse-nextapi-annual-report-${i+1}`,type:'annual_report',provider:'NSE India',title:`NSE Annual Report FY${r.fromYear}-${r.toYear}`,url:r.fileName,localPath:local,retrievedAt:new Date().toISOString(),period:`FY${r.fromYear}-${r.toYear}`,status:'ok',method:'script',notes:[`NextApi source; bytes=${result.bytes}`,`broadcastAt=${r.broadcastAt||'n/a'}`]}); }
      catch(e:any){ warnings.push(`NSE annual report download FY${r.fromYear}-${r.toYear}: ${e?.message||String(e)}`); }
    }
    const idxPath=path.join(annualDir,'annual-reports-index.json');
    artifacts.push({id:'nse-nextapi-annual-reports-index',type:'source_page',provider:'NSE India',title:'NSE NextApi annual report index',url:`${NSE_BASE}${nseEndpoints.annualReports(ctx.ticker)}`,localPath:idxPath,retrievedAt:new Date().toISOString(),status:reports.length?'ok':'partial',method:'script',notes:[`reports=${reports.length}`,`downloaded=${downloaded}`]});
    await debug.emit('NSE/NEXTAPI/annual_reports',reports.length?'OK':'WARN','Annual report index and downloads processed',{reports:reports.length,downloaded,limit});
  } catch(e:any) { warnings.push(`NSE NextApi annual reports: ${e?.message||String(e)}`); await debug.emit('NSE/NEXTAPI/annual_reports','WARN','NextApi annual report acquisition failed; filing-page fallback may still run',{error:e?.message||String(e)}); }

  // Persist a date-keyed snapshot index without duplicating the raw evidence tree.
  try {
    const snapshotDir=path.join(ctx.researchDir,'snapshots',snapshotDateKey()); await ensureDir(snapshotDir);
    await writeText(path.join(snapshotDir,'nse-api-index.json'),JSON.stringify({schema_version:'1.0',ticker:ctx.ticker,snapshotDate:snapshotDateKey(),capturedAt:new Date().toISOString(),snapshotDateTime:snapshotDateTimeKey(),rawRoot:'../raw/nse-api/nextapi',endpointFamilies:['identity','market','financials','corporate','ownership','annual_reports','compliance','peers'],llmUsed:false},null,2));
  } catch(e:any) { warnings.push(`NSE datewise snapshot index: ${e?.message||String(e)}`); }

  await debug.emit('NSE/HISTORICAL', 'START', 'Fetching 3-year price/volume/delivery history in bounded chunks');
  const historicalStarted = Date.now();
  try {
    const now = startOfUtcDay(new Date());
    const requestedTo = now;
    const requestedFrom = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate()));
    const chunkDays = Math.max(30, Number(process.env.NSE_HISTORICAL_CHUNK_DAYS || 85));
    const overlapDays = Math.max(0, Number(process.env.NSE_HISTORICAL_OVERLAP_DAYS || 2));
    const chunks = buildHistoricalChunks(requestedFrom, requestedTo, chunkDays, overlapDays);

    await debug.emit('NSE/HISTORICAL/PLAN', 'OK', 'Historical request split into bounded chunks', {
      requestedFrom: formatNseDate(requestedFrom),
      requestedTo: formatNseDate(requestedTo),
      chunkDays,
      overlapDays,
      chunkCount: chunks.length,
    });

    const allRawRows: any[] = [];
    const chunkSummaries: any[] = [];
    const chunkDir = path.join(apiDir, 'historical-chunks');
    await ensureDir(chunkDir);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStarted = Date.now();
      const endpoint = nseEndpoints.historical(ctx.ticker, chunk.from, chunk.to);
      await debug.emit(`NSE/HISTORICAL/CHUNK_${String(i + 1).padStart(2, '0')}`, 'START', 'Fetching historical chunk', {
        index: i + 1,
        total: chunks.length,
        from: chunk.from,
        to: chunk.to,
        endpoint: `${NSE_BASE}${endpoint}`,
      });

      try {
        const data = await nseFetchJson(endpoint, { cwd: process.cwd(), session });
        const rows = rowsFromHistorical(data);
        const rawPath = path.join(chunkDir, `historical-${String(i + 1).padStart(2, '0')}.json`);
        await writeText(rawPath, JSON.stringify(data, null, 2));
        allRawRows.push(...rows);
        const summary = {
          index: i + 1,
          from: chunk.from,
          to: chunk.to,
          rawRows: rows.length,
          rawPath: artifactPath(process.cwd(), rawPath),
        };
        chunkSummaries.push(summary);
        await debug.emit(`NSE/HISTORICAL/CHUNK_${String(i + 1).padStart(2, '0')}`, 'OK', 'Historical chunk acquired', summary, Date.now() - chunkStarted);
      } catch (e: any) {
        const message = e?.message || String(e);
        chunkSummaries.push({ index: i + 1, from: chunk.from, to: chunk.to, rawRows: 0, error: message });
        warnings.push(`NSE historical chunk ${i + 1}/${chunks.length}: ${message}`);
        await debug.emit(`NSE/HISTORICAL/CHUNK_${String(i + 1).padStart(2, '0')}`, 'WARN', 'Historical chunk failed', {
          index: i + 1,
          total: chunks.length,
          from: chunk.from,
          to: chunk.to,
          error: message,
        }, Date.now() - chunkStarted);
      }
    }

    // Deduplicate overlapping chunks and keep EQ only for technical analysis.
    const deduped = new Map<string, any>();
    for (const row of allRawRows) {
      const key = historicalRowKey(row);
      if (!key) continue;
      const series = String(row?.CH_SERIES ?? row?.series ?? '').trim().toUpperCase();
      if (series !== 'EQ') continue;
      deduped.set(key, row);
    }

    const mergedRows = Array.from(deduped.values());
    mergedRows.sort((a, b) => {
      const da = parseNseHistoricalDate(a?.CH_TIMESTAMP ?? a?.mTIMESTAMP ?? a?.Date ?? a?.date)?.getTime() ?? 0;
      const db = parseNseHistoricalDate(b?.CH_TIMESTAMP ?? b?.mTIMESTAMP ?? b?.Date ?? b?.date)?.getTime() ?? 0;
      return da - db;
    });

    const normalized = normalizeHistorical(mergedRows);
    const validation = historicalValidation(allRawRows, normalized, requestedFrom, requestedTo, chunks.length);
    const quality = evaluateHistoricalQuality(ctx.ticker, allRawRows, normalized, requestedFrom, requestedTo, chunks.length);
    const qualityPath = await writeQualityReport(ctx.researchDir, quality);

    const raw = path.join(apiDir, 'historical-3y.json');
    await writeText(raw, JSON.stringify({
      symbol: ctx.ticker,
      requestedFrom: formatNseDate(requestedFrom),
      requestedTo: formatNseDate(requestedTo),
      chunkDays,
      overlapDays,
      chunks: chunkSummaries,
      rawRows: allRawRows.length,
      deduplicatedEqRows: mergedRows.length,
      rows: allRawRows,
    }, null, 2));

    const norm = path.join(apiDir, 'historical-normalized.json');
    await writeText(norm, JSON.stringify(normalized, null, 2));

    const validationPath = path.join(apiDir, 'historical-validation.json');
    await writeText(validationPath, JSON.stringify(validation, null, 2));

    const base = {
      provider: 'NSE India API',
      url: `${NSE_BASE}${nseEndpoints.historical(ctx.ticker, formatNseDate(requestedFrom), formatNseDate(requestedTo))}`,
      retrievedAt: new Date().toISOString(),
      status: 'ok' as const,
      method: 'script' as const,
    };

    artifacts.push({
      id: 'nse-api-historical-3y',
      type: 'market_data',
      title: 'NSE API historical-3y (chunked)',
      localPath: raw,
      ...base,
      notes: [`chunks=${chunks.length}`, `rawRows=${allRawRows.length}`, `eqRows=${mergedRows.length}`],
    });

    artifacts.push({
      id: 'nse-api-historical-normalized',
      type: 'derived_data',
      title: 'Normalized 3-year NSE OHLCV and delivery history',
      localPath: norm,
      ...base,
      notes: [
        `rows=${normalized.length}`,
        `uniqueDates=${validation.uniqueDates}`,
        `earliest=${validation.earliest || 'n/a'}`,
        `latest=${validation.latest || 'n/a'}`,
        `coverage=${validation.coverageRatio}`,
      ],
    });

    artifacts.push({
      id: 'nse-api-historical-validation',
      type: 'derived_data',
      title: 'Historical data validation',
      localPath: validationPath,
      ...base,
      notes: [
        `rawRows=${validation.rawRows}`,
        `normalizedRows=${validation.normalizedRows}`,
        `duplicateDates=${validation.duplicateDates}`,
        `coverageRatio=${validation.coverageRatio}`,
        `chunkCount=${validation.chunkCount}`,
        `lowCoverage=${validation.lowCoverage}`,
      ],
    });

    artifacts.push({
      id: 'nse-api-historical-quality',
      type: 'derived_data',
      title: 'Historical OHLCV data quality report',
      localPath: qualityPath,
      provider: 'NSE India API',
      url: `${NSE_BASE}${nseEndpoints.historical(ctx.ticker, formatNseDate(requestedFrom), formatNseDate(requestedTo))}`,
      retrievedAt: new Date().toISOString(),
      status: quality.qualityStatus === 'error' ? 'error' : quality.qualityStatus === 'warning' ? 'partial' : 'ok',
      method: 'script',
      notes: [
        `qualityStatus=${quality.qualityStatus}`,
        `finalRows=${quality.finalRows}`,
        `coverage=${quality.coverageRatio}`,
        `duplicateDates=${quality.duplicateDates}`,
        `invalidOhlcRows=${quality.invalidOhlcRows}`,
      ],
    });

    const successfulChunks = chunkSummaries.filter(c => !c.error).length;
    if (validation.empty) {
      gaps.push('NSE historical price/volume data returned no normalized rows.');
      await debug.emit('NSE/HISTORICAL/VALIDATION', 'FAIL', 'Historical acquisition returned no normalized EQ rows', {
        ...validation,
        successfulChunks,
      }, Date.now() - historicalStarted);
    } else if (validation.lowCoverage) {
      warnings.push(`NSE historical coverage remains below 90%: ${validation.coverageRatio}.`);
      await debug.emit('NSE/HISTORICAL/VALIDATION', 'WARN', 'Historical data acquired but coverage is below target', {
        ...validation,
        successfulChunks,
      }, Date.now() - historicalStarted);
    } else if (successfulChunks < chunks.length) {
      warnings.push(`NSE historical acquisition completed with ${successfulChunks}/${chunks.length} chunks.`);
      await debug.emit('NSE/HISTORICAL/VALIDATION', 'WARN', 'Historical data coverage is acceptable but some chunks failed', {
        ...validation,
        successfulChunks,
      }, Date.now() - historicalStarted);
    } else {
      const qualityStatus = quality.qualityStatus === 'ok' ? 'OK' : quality.qualityStatus === 'warning' ? 'WARN' : 'FAIL';
      await debug.emit('NSE/HISTORICAL/QUALITY', qualityStatus, 'Historical dataset quality validation complete', {
        qualityStatus: quality.qualityStatus,
        finalRows: quality.finalRows,
        coverageRatio: quality.coverageRatio,
        duplicateDates: quality.duplicateDates,
        chronologyErrors: quality.chronologyErrors,
        invalidOhlcRows: quality.invalidOhlcRows,
        invalidVolumeRows: quality.invalidVolumeRows,
        invalidDeliveryRows: quality.invalidDeliveryRows,
        issues: quality.issues.length,
      });
      if (quality.qualityStatus !== 'ok') warnings.push(`NSE historical quality status=${quality.qualityStatus} issues=${quality.issues.length}`);
      await debug.emit('NSE/HISTORICAL/VALIDATION', 'OK', 'Historical data acquired with full requested coverage', {
        ...validation,
        successfulChunks,
        finalRows: quality.finalRows,
        qualityStatus: quality.qualityStatus,
      }, Date.now() - historicalStarted);
    }

    await debug.emit('NSE/HISTORICAL/QUALITY', quality.qualityStatus === 'ok' ? 'OK' : quality.qualityStatus === 'warning' ? 'WARN' : 'FAIL', 'Historical dataset quality validation complete', {
      qualityStatus: quality.qualityStatus, finalRows: quality.finalRows, coverageRatio: quality.coverageRatio, duplicateDates: quality.duplicateDates, chronologyErrors: quality.chronologyErrors, invalidOhlcRows: quality.invalidOhlcRows, invalidVolumeRows: quality.invalidVolumeRows, invalidDeliveryRows: quality.invalidDeliveryRows, issues: quality.issues.length,
    });
    await debug.emit('NSE/HISTORICAL', validation.lowCoverage ? 'WARN' : 'OK', 'Historical acquisition complete', {
      chunks: chunks.length,
      successfulChunks,
      rawRows: allRawRows.length,
      normalizedRows: normalized.length,
      coverageRatio: validation.coverageRatio,
      earliest: validation.earliest,
      latest: validation.latest,
    }, Date.now() - historicalStarted);
  } catch (e: any) {
    const message = e?.message || String(e);
    warnings.push(`NSE historical API: ${message}`);
    gaps.push('NSE historical price/volume data unavailable.');
    await debug.emit('NSE/HISTORICAL', 'FAIL', 'Historical API acquisition failed', { error: message }, Date.now() - historicalStarted);
  }

  if (!quoteAvailable) {
    gaps.push('NSE canonical GetQuoteApi did not return a usable last price.');
    await debug.emit('NSE/QUOTE', 'WARN', 'Canonical NSE NextApi symbol-data did not contain a usable last price', { ticker:ctx.ticker, identifier:symbolIdentifier });
  } else {
    await debug.emit('NSE/QUOTE', 'OK', 'Canonical NSE NextApi quote acquired', { ticker:ctx.ticker, identifier:symbolIdentifier });
  }

  const annualApiReady = artifacts.some(a => a.id === 'nse-nextapi-annual-reports-index' && ['ok','ok_with_fallback'].includes(a.status)) && artifacts.some(a => a.type === 'annual_report' && a.id.startsWith('nse-nextapi-annual-report-'));
  if (playwrightReady && (!annualApiReady || process.env.NSE_FILING_PAGE_AUDIT === 'true')) {
    await debug.emit('NSE/ANNUAL_REPORTS', 'START', annualApiReady ? 'Running annual-report filing page as optional audit' : 'Discovering latest annual-report PDFs through NSE filing page/network');
    const annualStarted = Date.now();
    try {
      const annualJsonPath = path.join(ctx.researchDir, 'raw', 'nse-annual-page.json');
      const data = await collectNsePage(annualUrl(ctx.ticker), session, path.join(screens,'nse-annual-reports.png'), annualJsonPath);
      const pdfs = pdfCandidates(data).slice(0, Number(process.env.ANNUAL_REPORT_LIMIT || 3));
      await writeText(path.join(rawReports, 'discovered-api-endpoints.json'), JSON.stringify(parseNetwork(data).map((item: any) => ({ endpoint:item.url, status:item.status, contentType:item.contentType, kind:'annual' })), null, 2));
      if (!pdfs.length) gaps.push('NSE annual-report PDFs were not discoverable from actual PDF links/responses.');
      let downloaded = 0;
      for (let i=0;i<pdfs.length;i++) {
        const pdf = pdfs[i];
        const local = path.join(rawReports, `annual-report-${String(i+1).padStart(2,'0')}.pdf`);
        try {
          const result = await downloadFile(pdf.url, local, { Referer: annualUrl(ctx.ticker), 'User-Agent': process.env.NSE_USER_AGENT || 'Mozilla/5.0' });
          downloaded++;
          artifacts.push({ id:`nse-annual-${i+1}`, type:'annual_report', provider:'NSE India', title:pdf.text || `NSE Annual Report ${i+1}`, url:pdf.url, localPath:local, retrievedAt:new Date().toISOString(), period:deriveReportPeriod(pdf.url, i+1), status:'ok', method:'playwright', notes:[`Source=${pdf.source}`, `bytes=${result.bytes}`, `contentType=${result.contentType}`, 'Accepted only because the URL path ended in .pdf or the response content-type was application/pdf.'] });
        } catch (e: any) { warnings.push(`NSE annual report download failed: ${pdf.url}: ${e.message}`); }
      }
      artifacts.push({ id:'nse-annual-page', type:'source_page', provider:'NSE India', title:'NSE Annual Reports filing page', url:annualUrl(ctx.ticker), localPath:annualJsonPath, screenshotPath:path.join(screens,'nse-annual-reports.png'), retrievedAt:new Date().toISOString(), status:downloaded > 0 ? 'ok':'partial', method:'playwright', notes:[`networkResponses=${Array.isArray(data?.network)?data.network.length:0}`, `pdfCandidates=${pdfs.length}`, `downloaded=${downloaded}`] });
      const status = downloaded > 0 ? 'OK' : 'WARN';
      await debug.emit('NSE/ANNUAL_REPORTS', status, downloaded > 0 ? 'Annual report PDFs discovered and downloaded' : 'Annual report page reached but no usable PDFs downloaded', {
        networkResponses: Array.isArray(data?.network) ? data.network.length : 0,
        pdfCandidates: pdfs.length,
        downloaded,
        files: pdfs.slice(0, downloaded).map((p: any, i: number) => ({ year: deriveReportPeriod(p.url, i + 1), url: p.url })),
        pagePath: artifactPath(process.cwd(), annualJsonPath),
      }, Date.now() - annualStarted);
    } catch (e: any) {
      const message = e?.message || String(e);
      gaps.push('NSE annual reports page could not be automated with Playwright.');
      warnings.push(`NSE annual reports: ${message}`);
      await debug.emit('NSE/ANNUAL_REPORTS', 'FAIL', 'Annual report acquisition failed', { error: message }, Date.now() - annualStarted);
    }
  } else if (!annualApiReady) {
    gaps.push('NSE annual reports page requires Playwright but browser automation is unavailable.');
    await debug.emit('NSE/ANNUAL_REPORTS', 'SKIP', 'Playwright unavailable and NextApi annual-report route did not provide usable reports');
  } else {
    await debug.emit('NSE/ANNUAL_REPORTS', 'OK', 'Annual-report NextApi acquisition is sufficient; filing page audit skipped');
  }

  const shareApiReady = artifacts.some(a => a.id === 'nse-nextapi-shareholding-pattern' && ['ok','ok_with_fallback'].includes(a.status));
  if (playwrightReady && (!shareApiReady || process.env.NSE_FILING_PAGE_AUDIT === 'true')) {
    await debug.emit('NSE/SHAREHOLDING', 'START', shareApiReady ? 'Running shareholding filing page as optional audit' : 'Discovering equity shareholding payload through NSE filing page/network');
    const shareStarted = Date.now();
    try {
      const shareJsonPath = path.join(ctx.researchDir, 'raw', 'nse-shareholding-page.json');
      const data = await collectNsePage(shareUrl(ctx.ticker), session, path.join(screens,'nse-shareholding.png'), shareJsonPath);
      const relevant = relevantShareholdingNetwork(data);
      await writeText(path.join(rawShare, 'discovered-api-endpoints.json'), JSON.stringify(parseNetwork(data).map((item: any) => ({ endpoint:item.url, status:item.status, contentType:item.contentType, relevant:relevant.some((r:any)=>r===item) })), null, 2));
      for (let i=0;i<relevant.length;i++) {
        const p = path.join(rawShare, `shareholding-${i+1}.json`);
        await writeText(p, JSON.stringify(relevant[i].json, null, 2));
        artifacts.push({ id:`nse-shareholding-${i+1}`, type:'shareholding', provider:'NSE India API', title:'NSE corporate share-holdings data', url:relevant[i].url, localPath:p, retrievedAt:new Date().toISOString(), status:'ok', method:'playwright', notes:['Filtered to the equity share-holdings endpoint/payload; generic getNotes20 metadata responses are excluded.'] });
      }
      const textPath = path.join(rawShare, 'nse-shareholding-page.txt');
      await writeText(textPath, data?.text || '');
      artifacts.push({ id:'nse-shareholding-page', type:'shareholding', provider:'NSE India', title:'Latest shareholding pattern filing page', url:shareUrl(ctx.ticker), localPath:shareJsonPath, screenshotPath:path.join(screens,'nse-shareholding.png'), retrievedAt:new Date().toISOString(), status:relevant.length ? 'ok' : (data?.text ? 'partial' : 'error'), method:'playwright', notes:[`shareholdingRelevantResponses=${relevant.length}`] });
      if (!relevant.length && !data?.text) gaps.push('NSE shareholding data was not discoverable from the filing page/network.');
      await debug.emit('NSE/SHAREHOLDING', relevant.length ? 'OK' : 'WARN', relevant.length ? 'Equity shareholding payload acquired' : 'Shareholding page reached but no relevant equity payload was found', {
        networkResponses: Array.isArray(data?.network) ? data.network.length : 0,
        relevantResponses: relevant.length,
        endpoints: relevant.map((r: any) => r.url),
        pagePath: artifactPath(process.cwd(), shareJsonPath),
      }, Date.now() - shareStarted);
    } catch (e: any) {
      const message = e?.message || String(e);
      gaps.push('NSE shareholding pattern page could not be automated with Playwright.');
      warnings.push(`NSE shareholding: ${message}`);
      await debug.emit('NSE/SHAREHOLDING', 'FAIL', 'Shareholding acquisition failed', { error: message }, Date.now() - shareStarted);
    }
  } else if (!shareApiReady) {
    gaps.push('NSE shareholding pattern page requires Playwright but browser automation is unavailable.');
    await debug.emit('NSE/SHAREHOLDING', 'SKIP', 'Playwright unavailable and NextApi shareholding route did not provide usable data');
  } else {
    await debug.emit('NSE/SHAREHOLDING', 'OK', 'Shareholding NextApi acquisition is sufficient; filing page audit skipped');
  }

  await closeBrowserSession(session).catch(() => {});

  const uniqueGaps = [...new Set(gaps)];
  const uniqueWarnings = [...new Set(warnings)];
  const status = uniqueGaps.length === 0
    ? (uniqueWarnings.length ? 'ok_with_fallback' : 'ok')
    : (artifacts.length ? 'partial' : 'error');

  await debug.emit('NSE/VALIDATION', status === 'ok' ? 'OK' : status === 'ok_with_fallback' ? 'OK_WITH_FALLBACK' : status === 'partial' ? 'WARN' : 'FAIL', 'NSE acquisition validation complete', {
    artifacts: artifacts.length,
    dataGaps: uniqueGaps.length,
    warnings: uniqueWarnings.length,
    quoteAvailable: quoteAvailable || artifacts.some(a => a.id === 'nse-api-quote-nextapi-fallback' && a.status === 'ok_with_fallback'),
    playwrightReady,
  }, Date.now() - started);

  await debug.finish({
    status,
    ticker: ctx.ticker,
    artifacts: artifacts.length,
    dataGaps: uniqueGaps.length,
    warnings: uniqueWarnings.length,
    debugFiles: {
      json: artifactPath(process.cwd(), debug.paths().jsonPath),
      jsonl: artifactPath(process.cwd(), debug.paths().jsonlPath),
      timeline: artifactPath(process.cwd(), debug.paths().timelinePath),
    },
  });

  return {
    artifacts,
    gaps: uniqueGaps,
    warnings: uniqueWarnings,
    companyName: ctx.companyName,
    isin: ctx.isin,
    bseScrip: ctx.bseScrip,
  };
}

function deriveReportPeriod(url: string, fallback: number) {
  const m = url.match(/_(20\d{2})_(20\d{2})_/i);
  if (m) return `FY${m[1]}-${m[2].slice(-2)}`;
  const y = url.match(/20\d{2}/g);
  if (y?.length) return y.slice(-2).join('-');
  return `report-${fallback}`;
}
