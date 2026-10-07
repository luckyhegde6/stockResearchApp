import type { CanonicalValue } from './canonical.js';

export interface NseSymbolIdentity {
  symbol: string | null;
  companyName: string | null;
  identifier: string | null;
  isin: string | null;
  series: string | null;
  marketType: string | null;
  activeSeries: string[];
}

export interface NseSymbolQuote {
  symbol: string | null;
  identifier: string | null;
  companyName: string | null;
  isin: string | null;
  series: string | null;
  marketType: string | null;
  lastPrice: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  averagePrice: number | null;
  change: number | null;
  pChange: number | null;
  closePrice: number | null;
  totalTradedVolume: number | null;
  totalTradedValue: number | null;
  issuedSize: number | null;
  ffmc: number | null;
  deliveryQuantity: number | null;
  deliveryPercent: number | null;
  totalMarketCap: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  yearHighDate: string | null;
  yearLowDate: string | null;
  tickSize: number | null;
  priceBand: string | null;
  pdSectorPe: number | null;
  pdSymbolPe: number | null;
  macro: string | null;
  sector: string | null;
  industry: string | null;
  basicIndustry: string | null;
  listedStatus: string | null;
  tradingSegment: string | null;
  index: string | null;
  indexList: string[];
  lastUpdateTime: string | null;
}

export interface NseYearwisePerformance {
  period: string;
  stockChangePct: number | null;
  indexChangePct: number | null;
  referenceDate: string | null;
  indexName: string | null;
}

export interface NseOneDayChartPoint {
  timestamp: number;
  price: number | null;
  type: string | null;
  change: number | null;
  changePct: number | null;
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(String(v).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(x) ? x : null;
}

function s(v: unknown): string | null {
  const x = String(v ?? '').trim();
  return x ? x : null;
}

function arr(v: unknown): any[] { return Array.isArray(v) ? v : []; }

function firstObject(root: any): any {
  if (!root || typeof root !== 'object') return {};
  if (Array.isArray(root)) return root[0] && typeof root[0] === 'object' ? root[0] : {};
  return root;
}

export function normalizeSymbolName(raw: any, requestedSymbol: string): NseSymbolIdentity {
  const root = firstObject(raw?.data ?? raw?.result ?? raw);
  const candidate = firstObject(root?.symbolData ?? root?.security ?? root);
  return {
    symbol: s(candidate.symbol ?? candidate.tradingSymbol ?? raw?.symbol ?? requestedSymbol) ?? requestedSymbol,
    companyName: s(candidate.companyName ?? candidate.name ?? candidate.symbolName ?? candidate.company ?? raw?.name),
    identifier: s(candidate.identifier ?? candidate.securityIdentifier),
    isin: s(candidate.isin ?? candidate.isinCode),
    series: s(candidate.series),
    marketType: s(candidate.marketType),
    activeSeries: arr(candidate.activeSeries).map(String).filter(Boolean),
  };
}

export function normalizeMetaData(raw: any, requestedSymbol: string): NseSymbolIdentity & Record<string, any> {
  const root = firstObject(raw?.data ?? raw?.result ?? raw);
  const meta = firstObject(root?.metadata ?? root?.metaData ?? root);
  const base = normalizeSymbolName(meta, requestedSymbol);
  return {
    ...base,
    activeSeries: arr(meta.activeSeries ?? base.activeSeries).map(String).filter(Boolean),
    debtSeries: arr(meta.debtSeries).map(String).filter(Boolean),
    isFNOSec: s(meta.isFNOSec),
    isCASec: s(meta.isCASec),
    isSLBSec: s(meta.isSLBSec),
    isDebtSec: s(meta.isDebtSec),
    isSuspended: s(meta.isSuspended),
    isETFSec: s(meta.isETFSec),
    isDelisted: s(meta.isDelisted),
    isMunicipalBond: s(meta.isMunicipalBond),
    isHybridSymbol: s(meta.isHybridSymbol),
    parentSymbol: s(meta.parentSymbol),
    casFlag: s(meta.casFlag),
    tempSuspendedSeries: arr(meta.tempSuspendedSeries).map(String).filter(Boolean),
  };
}

export function normalizeSymbolData(raw: any, requestedSymbol: string): NseSymbolQuote {
  const root = firstObject(raw?.equityResponse?.[0] ?? raw?.data?.[0] ?? raw?.data ?? raw);
  const meta = firstObject(root?.metaData ?? root?.metadata ?? {});
  const trade = firstObject(root?.tradeInfo ?? {});
  const price = firstObject(root?.priceInfo ?? {});
  const sec = firstObject(root?.secInfo ?? {});
  const order = firstObject(root?.orderBook ?? {});
  const indexList = arr(sec.indexList).map(String).map(x => x.trim()).filter(Boolean);
  return {
    symbol: s(meta.symbol ?? sec.symbol ?? requestedSymbol) ?? requestedSymbol,
    identifier: s(meta.identifier),
    companyName: s(meta.companyName),
    isin: s(meta.isinCode ?? meta.isin),
    series: s(meta.series ?? trade.series ?? 'EQ'),
    marketType: s(meta.marketType ?? trade.marketType ?? 'N'),
    lastPrice: n(trade.lastPrice ?? order.lastPrice ?? meta.closePrice),
    previousClose: n(meta.previousClose ?? meta.basePrice),
    open: n(meta.open),
    dayHigh: n(meta.dayHigh),
    dayLow: n(meta.dayLow),
    averagePrice: n(meta.averagePrice),
    change: n(meta.change),
    pChange: n(meta.pChange),
    closePrice: n(meta.closePrice),
    totalTradedVolume: n(trade.totalTradedVolume ?? trade.quantitytraded),
    totalTradedValue: n(trade.totalTradedValue),
    issuedSize: n(trade.issuedSize),
    ffmc: n(trade.ffmc),
    deliveryQuantity: n(trade.deliveryquantity ?? trade.deliveryQuantity),
    deliveryPercent: n(trade.deliveryToTradedQuantity ?? sec.deliveryTotradedQuantity),
    totalMarketCap: n(trade.totalMarketCap),
    yearHigh: n(price.yearHigh),
    yearLow: n(price.yearLow),
    yearHighDate: s(price.yearHightDt),
    yearLowDate: s(price.yearLowDt),
    tickSize: n(price.tickSize),
    priceBand: s(price.priceBand),
    pdSectorPe: n(sec.pdSectorPe),
    pdSymbolPe: n(sec.pdSymbolPe),
    macro: s(sec.macro),
    sector: s(sec.sector),
    industry: s(sec.industryInfo ?? sec.industry),
    basicIndustry: s(sec.basicIndustry),
    listedStatus: s(sec.secStatus),
    tradingSegment: s(sec.tradingSegment),
    index: s(sec.index),
    indexList,
    lastUpdateTime: s(raw?.lastUpdateTime),
  };
}

export function resolveQuoteIdentifier(quote: NseSymbolQuote, requestedSymbol: string): string {
  return quote.identifier || `${requestedSymbol.toUpperCase()}EQN`;
}

export function normalizeYearwise(raw: any): NseYearwisePerformance[] {
  const root = arr(raw?.data ?? raw?.result ?? raw);
  const row = firstObject(root[0] ?? root);
  if (!Object.keys(row).length) return [];
  const pairs: Array<[string, string, string]> = [
    ['yesterday', 'yesterday_chng_per', 'index_yesterday_chng_per'],
    ['one_week', 'one_week_chng_per', 'index_one_week_chng_per'],
    ['one_month', 'one_month_chng_per', 'index_one_month_chng_per'],
    ['three_month', 'three_month_chng_per', 'index_three_month_chng_per'],
    ['six_month', 'six_month_chng_per', 'index_six_month_chng_per'],
    ['one_year', 'one_year_chng_per', 'index_one_year_chng_per'],
    ['two_year', 'two_year_chng_per', 'index_two_year_chng_per'],
    ['three_year', 'three_year_chng_per', 'index_three_year_chng_per'],
    ['five_year', 'five_year_chng_per', 'index_five_year_chng_per'],
  ];
  return pairs.map(([period, stockKey, indexKey]) => ({
    period,
    stockChangePct: n(row[stockKey]),
    indexChangePct: n(row[indexKey]),
    referenceDate: s(row[`${stockKey.replace('_chng_per','')}_date`] ?? row.index_one_week_date),
    indexName: s(row.index_name),
  }));
}

export function normalizeSymbolChartData(raw: any): NseOneDayChartPoint[] {
  const rows = arr(raw?.grapthData ?? raw?.graphData ?? raw?.data ?? raw);
  return rows.flatMap(row => {
    if (!Array.isArray(row) || row.length < 2) return [];
    return [{
      timestamp: Number(row[0]),
      price: n(row[1]),
      type: s(row[2]),
      change: n(row[3]),
      changePct: n(row[4]),
    }];
  }).filter(x => Number.isFinite(x.timestamp));
}

export function quoteToFacts(quote: NseSymbolQuote, artifactId: string, asOf: string): CanonicalValue[] {
  const fields: Array<[string, any, string]> = [
    ['last_price', quote.lastPrice, 'price'],
    ['previous_close', quote.previousClose, 'price'],
    ['open', quote.open, 'price'],
    ['day_high', quote.dayHigh, 'price'],
    ['day_low', quote.dayLow, 'price'],
    ['average_price', quote.averagePrice, 'price'],
    ['percent_change', quote.pChange, '%'],
    ['volume', quote.totalTradedVolume, 'shares'],
    ['turnover', quote.totalTradedValue, 'INR'],
    ['market_cap', quote.totalMarketCap, 'INR'],
    ['52_week_high', quote.yearHigh, 'price'],
    ['52_week_low', quote.yearLow, 'price'],
    ['delivery_quantity', quote.deliveryQuantity, 'shares'],
    ['delivery_percent', quote.deliveryPercent, '%'],
    ['sector_pe', quote.pdSectorPe, 'x'],
    ['symbol_pe', quote.pdSymbolPe, 'x'],
  ];
  return fields.filter(([,v]) => v !== null && v !== undefined).map(([field, value, unit]) => ({
    id: `nse-nextapi-${field}`,
    evidenceRole: 'source_fact',
    field,
    value,
    unit,
    period: null,
    source: 'NSE India API',
    sourceArtifact: artifactId,
    method: 'source_extraction',
    verified: true,
    asOf,
    evidencePath: null,
    sourceUrl: null,
    confidence: 'high',
  }));
}
