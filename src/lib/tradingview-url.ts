export type TradingViewExchange = 'NSE' | 'BSE';

export interface TradingViewInstrument {
  exchange: TradingViewExchange;
  symbol: string;
  tvSymbol: string;
  chartUrl: string;
  overviewUrl: string;
  technicalsUrl: string;
}

export function normalizeTvSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function buildTradingViewInstrument(symbol: string, exchange: TradingViewExchange = 'NSE'): TradingViewInstrument {
  const clean = normalizeTvSymbol(symbol);
  const encoded = encodeURIComponent(`${exchange}:${clean}`);
  return {
    exchange,
    symbol: clean,
    tvSymbol: `${exchange}:${clean}`,
    chartUrl: `https://in.tradingview.com/chart/?symbol=${encoded}`,
    overviewUrl: `https://in.tradingview.com/symbols/${exchange}-${encodeURIComponent(clean)}/?exchange=${exchange}`,
    technicalsUrl: `https://in.tradingview.com/symbols/${exchange}-${encodeURIComponent(clean)}/technicals/?exchange=${exchange}&interval=1D`,
  };
}
