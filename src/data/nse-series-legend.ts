export type NseSeriesClass =
  | 'fully_paid_equity_or_etf'
  | 'fully_paid_equity_sme'
  | 'partly_paid_equity'
  | 'mutual_fund'
  | 'preference_share'
  | 'debt'
  | 'warrant'
  | 'invit'
  | 'gold_bond'
  | 'government_security'
  | 'reit'
  | 'rights_entitlement'
  | 'state_development_loan'
  | 'treasury_bill'
  | 'buyback'
  | 'block_deal'
  | 'unknown';

export interface NseSeriesLegendEntry {
  seriesPattern: string;
  description: string;
  settlementType?: string;
  class: NseSeriesClass;
  equityUniverse: boolean;
  preferredForStandardStockQuote: boolean;
}

export const NSE_SERIES_LEGEND: NseSeriesLegendEntry[] = [
  { seriesPattern:'EQ', description:'Fully paid equity shares / ETFs', settlementType:'Rolling Settlement', class:'fully_paid_equity_or_etf', equityUniverse:true, preferredForStandardStockQuote:true },
  { seriesPattern:'BE/BZ', description:'Trade-for-trade / surveillance equity categories', settlementType:'Trade for Trade', class:'fully_paid_equity_or_etf', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'SM', description:'Fully paid equity shares SME', settlementType:'Rolling Settlement', class:'fully_paid_equity_sme', equityUniverse:true, preferredForStandardStockQuote:true },
  { seriesPattern:'ST/SZ', description:'SME trade-for-trade categories', settlementType:'Trade for Trade', class:'fully_paid_equity_sme', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'E@', description:'Partly paid equity shares', class:'partly_paid_equity', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'X@', description:'Partly paid trade-for-trade category', class:'partly_paid_equity', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'MF', description:'Closed ended mutual fund units', class:'mutual_fund', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'ME', description:'Mutual fund trade-for-trade category', class:'mutual_fund', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'P@', description:'Non-convertible preference shares', class:'preference_share', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'Q@', description:'Fully convertible preference shares', class:'preference_share', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'N@/Y@/Z@/A@/B@', description:'Non-convertible debt instruments', class:'debt', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'D@', description:'Fully convertible debt instruments', class:'debt', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'W@', description:'Convertible warrants', class:'warrant', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'IV', description:'Units of InvITs', class:'invit', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'GB', description:'Gold Bonds', class:'gold_bond', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'GS', description:'Government Securities', class:'government_security', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'RR', description:'Units of REITs', class:'reit', equityUniverse:true, preferredForStandardStockQuote:false },
  { seriesPattern:'BE', description:'Rights entitlement', class:'rights_entitlement', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'SG', description:'State Development Loans', class:'state_development_loan', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'TB', description:'Treasury Bills', class:'treasury_bill', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'BO', description:'Buyback of equity shares through stock exchange route', class:'buyback', equityUniverse:false, preferredForStandardStockQuote:false },
  { seriesPattern:'BL^', description:'Block deals', class:'block_deal', equityUniverse:false, preferredForStandardStockQuote:false },
];

function compactSeries(series: string): string { return series.trim().toUpperCase(); }
export function classifyNseSeries(series: string | null | undefined): NseSeriesLegendEntry {
  const s=compactSeries(series ?? '');
  if (s==='EQ') return NSE_SERIES_LEGEND[0];
  if (s==='BE'||s==='BZ') return NSE_SERIES_LEGEND[1];
  if (s==='SM') return NSE_SERIES_LEGEND[2];
  if (s==='ST'||s==='SZ') return NSE_SERIES_LEGEND[3];
  if (/^E[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[4];
  if (/^X[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[5];
  if (s==='MF') return NSE_SERIES_LEGEND[6];
  if (s==='ME') return NSE_SERIES_LEGEND[7];
  if (/^P[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[8];
  if (/^Q[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[9];
  if (/^[NYZAB][0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[10];
  if (/^D[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[11];
  if (/^W[0-9A-Z]$/.test(s)) return NSE_SERIES_LEGEND[12];
  if (s==='IV') return NSE_SERIES_LEGEND[13];
  if (s==='GB') return NSE_SERIES_LEGEND[14];
  if (s==='GS') return NSE_SERIES_LEGEND[15];
  if (s==='RR'||s==='RT') return NSE_SERIES_LEGEND[16];
  if (s==='BE') return NSE_SERIES_LEGEND[17];
  if (s==='SG') return NSE_SERIES_LEGEND[18];
  if (s==='TB') return NSE_SERIES_LEGEND[19];
  if (s==='BO') return NSE_SERIES_LEGEND[20];
  if (s.startsWith('BL')) return NSE_SERIES_LEGEND[21];
  return { seriesPattern:s || 'UNKNOWN', description:'Unmapped NSE series code', class:'unknown', equityUniverse:false, preferredForStandardStockQuote:false };
}
