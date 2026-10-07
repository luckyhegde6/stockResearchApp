import type { NseSeriesClass } from '../data/nse-series-legend.js';
export interface NseMarketIndexRowDto {
  priority: number | null;
  identifier: string | null;
  change: number | null;
  symbol: string | null;
  series: string | null;
  marketType: string | null;
  lastPrice: number | null;
  totalTradedVolume: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  totalTradedValue: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  ffmc: number | null;
  lastUpdateTime: string | null;
  stockIndClosePrice: number | null;
  perChange365d: number | null;
  perChange30d: number | null;
  date365dAgo: string | null;
  date30dAgo: string | null;
  nearWKH: number | null;
  nearWKL: number | null;
  chart30Path: string | null;
  chart365Path: string | null;
  companyName: string | null;
  pChange: number | null;
  seriesClass?: NseSeriesClass;
  isEquityUniverse?: boolean;
  isPreferredEquitySeries?: boolean;
}

export interface NseMarketStatusDto {
  market: string | null;
  marketStatus: string | null;
  marketStatusMessage: string | null;
}

export interface NseIndexDataDto {
  indexName: string;
  apiSymbol: string;
  fetchedAt: string;
  timestamp: string | null;
  marketStatus: NseMarketStatusDto | null;
  aduCount: { advances: number | null; declines: number | null; unchanged: number | null } | null;
  rowCount: number;
  equityRowCount: number;
  symbols: string[];
  rows: NseMarketIndexRowDto[];
}

export interface NseMarketQuoteDto extends NseMarketIndexRowDto {
  ticker: string;
  quoteSource: string;
  quoteEndpoint: string;
}

export interface NseMarketIndexMembershipDto {
  ticker: string;
  indexName: string;
  apiSymbol: string;
  member: boolean;
  row?: NseMarketIndexRowDto;
}
