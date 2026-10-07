import type { NseMarketIndexRowDto, NseIndexDataDto, NseMarketQuoteDto, NseMarketStatusDto } from '../types/nse-market.js';
import { classifyNseSeries } from '../data/nse-series-legend.js';
import type { NseIndexCatalogEntry } from '../data/nse-index-catalog.js';

const EXCLUDE_SYMBOLS = new Set([
  'ABOUT','ANNOUNCEMENTS','CAREERS','CAS','CBRICS','CHNG','CIRCULARS','CLOSE',
  'OPEN','HIGH','LOW','VOLUME','VALUE','CHANGE','LAST','MARKET','EQUITY','NSE',
  'LOGIN','SIGNIN','HOME','NEWS','TOOLS','PRODUCTS','CONTACT','SEARCH','INDICES',
]);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

export function isPlausibleNseSymbol(value: unknown): boolean {
  const s = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9&._-]{0,29}$/.test(s)) return false;
  return !EXCLUDE_SYMBOLS.has(s);
}

export function transformNseIndexRow(row: any): NseMarketIndexRowDto {
  return {
    priority: num(row?.priority),
    identifier: str(row?.identifier),
    change: num(row?.change),
    symbol: str(row?.symbol),
    series: str(row?.series),
    marketType: str(row?.marketType),
    lastPrice: num(row?.lastPrice),
    totalTradedVolume: num(row?.totalTradedVolume),
    open: num(row?.open),
    dayHigh: num(row?.dayHigh),
    dayLow: num(row?.dayLow),
    previousClose: num(row?.previousClose),
    totalTradedValue: num(row?.totalTradedValue),
    yearHigh: num(row?.yearHigh),
    yearLow: num(row?.yearLow),
    ffmc: num(row?.ffmc),
    lastUpdateTime: str(row?.lastUpdateTime),
    stockIndClosePrice: num(row?.stockIndClosePrice),
    perChange365d: num(row?.perChange365d),
    perChange30d: num(row?.perChange30d),
    date365dAgo: str(row?.date365dAgo),
    date30dAgo: str(row?.date30dAgo),
    nearWKH: num(row?.nearWKH),
    nearWKL: num(row?.nearWKL),
    chart30Path: str(row?.chart30Path),
    chart365Path: str(row?.chart365Path),
    companyName: str(row?.companyName),
    pChange: num(row?.pChange),
    seriesClass: classifyNseSeries(row?.series).class,
    isEquityUniverse: classifyNseSeries(row?.series).equityUniverse,
    isPreferredEquitySeries: classifyNseSeries(row?.series).preferredForStandardStockQuote,
  };
}

function getNestedRows(payload: any): any[] {
  const candidates = [
    payload?.data?.data,
    payload?.data?.items,
    payload?.data?.results,
    payload?.data,
    payload?.result,
    payload?.results,
    payload?.items,
    payload,
  ];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function getNestedMeta(payload: any) {
  const d = payload?.data ?? payload ?? {};
  return {
    timestamp: str(d?.timestamp ?? payload?.timestamp),
    marketStatus: d?.marketStatus ? {
      market: str(d.marketStatus.market),
      marketStatus: str(d.marketStatus.marketStatus),
      marketStatusMessage: str(d.marketStatus.marketStatusMessage),
    } as NseMarketStatusDto : null,
    aduCount: d?.aduCount ? {
      advances: num(d.aduCount.advances),
      declines: num(d.aduCount.declines),
      unchanged: num(d.aduCount.unchange ?? d.aduCount.unchanged),
    } : null,
  };
}

export function transformIndexDataPayload(index: NseIndexCatalogEntry, payload: any): NseIndexDataDto {
  const rawRows = getNestedRows(payload);
  const rows = rawRows.map(transformNseIndexRow);
  const equityRows = rows.filter(r => Boolean(r.isEquityUniverse) && isPlausibleNseSymbol(r.symbol));
  const symbols = [...new Set(equityRows.map(r => String(r.symbol).toUpperCase()))];
  const meta = getNestedMeta(payload);
  return {
    indexName: index.displayName,
    apiSymbol: index.apiSymbol,
    fetchedAt: new Date().toISOString(),
    timestamp: meta.timestamp,
    marketStatus: meta.marketStatus,
    aduCount: meta.aduCount,
    rowCount: rows.length,
    equityRowCount: equityRows.length,
    symbols,
    rows,
  };
}

function walkObjects(value: any, out: any[] = []): any[] {
  if (!value) return out;
  if (Array.isArray(value)) { for (const x of value) walkObjects(x, out); return out; }
  if (typeof value === 'object') {
    out.push(value);
    for (const x of Object.values(value)) walkObjects(x, out);
  }
  return out;
}

export function findQuoteRow(payload: any, ticker: string): any | null {
  const target = ticker.toUpperCase();
  const objects = walkObjects(payload);
  const exact = objects.find(obj => {
    const symbol = String(obj?.symbol ?? obj?.tradingSymbol ?? '').toUpperCase();
    return symbol === target && (
      obj?.lastPrice != null || obj?.lastTradedPrice != null || obj?.ltp != null || obj?.previousClose != null
    );
  });
  if (exact) return exact;
  return objects.find(obj =>
    (obj?.lastPrice != null || obj?.lastTradedPrice != null || obj?.ltp != null) &&
    (obj?.companyName || obj?.series || obj?.marketType)
  ) ?? null;
}

export function transformQuotePayload(ticker: string, payload: any, endpoint: string): NseMarketQuoteDto {
  const row = findQuoteRow(payload, ticker) ?? {};
  return {
    ticker: ticker.toUpperCase(),
    quoteSource: 'NSE NextApi getSymbolData',
    quoteEndpoint: endpoint,
    ...transformNseIndexRow({ ...row, symbol: row?.symbol ?? ticker }),
  };
}

export function normalizeIndexListPayload(payload: any): { categories: Record<string, Record<string, string>>; entries: NseIndexCatalogEntry[] } {
  const root = payload?.data ?? payload ?? {};
  const categories: Record<string, Record<string, string>> = {};

  const addCategory = (category: string, value: any) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const pairs: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === 'string') pairs[k] = v;
    if (Object.keys(pairs).length) categories[category] = pairs;
  };

  if (root && typeof root === 'object') {
    for (const [category, value] of Object.entries(root)) addCategory(category, value);
    if (!Object.keys(categories).length && Array.isArray((root as any).data)) {
      for (const row of (root as any).data) {
        const category = str((row as any)?.category ?? (row as any)?.group ?? 'Other') ?? 'Other';
        const display = str((row as any)?.name ?? (row as any)?.indexName ?? (row as any)?.index);
        const apiSymbol = str((row as any)?.symbol ?? (row as any)?.apiSymbol ?? display);
        if (display && apiSymbol) (categories[category] ||= {})[display] = apiSymbol;
      }
    }
  }

  const entries = Object.entries(categories).flatMap(([category, mapping]) =>
    Object.entries(mapping).map(([displayName, apiSymbol]) => ({ category: category as any, displayName, apiSymbol }))
  );
  return { categories, entries };
}
