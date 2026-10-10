import { loadNseEquityUniverse, resolveNseSecurity } from '../src/lib/nse-securities.js';
import { normalizeSymbolInput } from '../src/lib/research-config.js';

const root = process.cwd();
const universe = await loadNseEquityUniverse(root);
const samples = ['ITC','RELIANCE','COALINDIA'].map(input => {
  const symbol = normalizeSymbolInput(input);
  const resolved = resolveNseSecurity(symbol, universe).record;
  return { input, symbol, resolved: resolved ? { symbol: resolved.symbol, companyName: resolved.companyName, series: resolved.series, isin: resolved.isin } : null, ok: Boolean(resolved?.preferredForStockResearch) };
});
const ok = samples.every(x=>x.ok);
console.log(JSON.stringify({ ok, count: samples.length, samples, symbolSource: 'NSE EQUITY_L security master' }, null, 2));
process.exitCode = ok ? 0 : 1;
