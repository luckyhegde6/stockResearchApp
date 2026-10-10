export type SourceClass = 'core'|'supplementary'|'optional'|'excluded'|'unknown';

const CORE = new Set(['NSE','Screener','Tijori','TradingView']);
const SUPPLEMENTARY = new Set(['News']);
const OPTIONAL = new Set(['Chartink']);
const EXCLUDED = new Set(['BSE','Bombay Stock Exchange']);

export function classifySource(name: string): SourceClass {
  const s = String(name || '').trim().toLowerCase();
  if ([...CORE].some(x => x.toLowerCase() === s)) return 'core';
  if ([...SUPPLEMENTARY].some(x => x.toLowerCase() === s)) return 'supplementary';
  if ([...OPTIONAL].some(x => x.toLowerCase() === s)) return 'optional';
  if ([...EXCLUDED].some(x => x.toLowerCase() === s)) return 'excluded';
  return 'unknown';
}

export function classifyProvider(provider: string): SourceClass {
  const s=String(provider||'').toLowerCase();
  // News must be tested before TradingView: "TradingView News Flow" is a
  // supplementary news source, not a core TradingView charting provider.
  if (s.includes('nse')) return 'core';
  if (s.includes('screener')) return 'core';
  if (s.includes('tijori')) return 'core';
  if (s.includes('news')) return 'supplementary';
  if (s.includes('tradingview')) return 'core';
  if (s.includes('chartink')) return 'optional';
  if (s.includes('bse') || s.includes('bombay stock exchange')) return 'excluded';
  return 'unknown';
}
