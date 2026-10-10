export const SOURCE_PRECEDENCE: Record<string,string[]> = {
  identity: ['NSE Securities Master','NSE','Screener','Tijori','TradingView','Chartink'],
  market: ['NSE','Screener','Tijori'],
  valuation: ['Screener','Tijori','NSE'],
  financials: ['NSE','Screener','Tijori'],
  ownership: ['NSE'],
  technicals: ['NSE'],
  screening: ['Chartink','NSE','Screener','Tijori'],
  catalysts: ['NSE','Tijori','Screener'],
};

export function precedenceFor(field:string): string[] {
  if (['symbol','company_name','isin','series','listing_date'].includes(field)) return SOURCE_PRECEDENCE.identity;
  if (['last_price','previous_close','open','day_high','day_low','52_week_high','52_week_low','volume','percent_change','52_week_high_price'].includes(field)) return SOURCE_PRECEDENCE.market;
  if (['pe_ratio','market_cap','book_value','dividend_yield','roce','roe','debt','sales_growth','profit_growth'].includes(field)) return SOURCE_PRECEDENCE.valuation;
  if (/^(financial_|revenue|profit|eps)/.test(field)) return SOURCE_PRECEDENCE.financials;
  if (/ownership|promoter|fii|dii/i.test(field)) return SOURCE_PRECEDENCE.ownership;
  if (/ema|rsi|macd|sma|volume|close/.test(field)) return SOURCE_PRECEDENCE.technicals;
  if (/screen|scanner|strategy|52_week_high_membership/.test(field)) return SOURCE_PRECEDENCE.screening;
  return SOURCE_PRECEDENCE.market;
}

export function sourcePriority(source:string, field:string):number {
  const list = precedenceFor(field).map(x=>x.toLowerCase());
  const s = source.toLowerCase();
  const idx = list.findIndex(x=>s===x || s.includes(x));
  return idx === -1 ? 0 : list.length - idx;
}
