import { RESEARCH_CONFIG, featureSummary, normalizeSymbolInput } from '../src/lib/research-config.js';

const cases = [
  ['ITC', 'ITC'],
  ['NSE:ITC', 'ITC'],
  ['NSE/ITC', 'ITC'],
  ['ITC.NS', 'ITC'],
  ['https://in.tradingview.com/chart/?symbol=NSE%3AITC', 'ITC'],
  ['COALINDIA', 'COALINDIA'],
];
const results = cases.map(([input, expected]) => ({ input, output: normalizeSymbolInput(input), expected, ok: normalizeSymbolInput(input) === expected }));
const ok = results.every(x => x.ok) && RESEARCH_CONFIG.defaultExchange === 'NSE';
console.log(JSON.stringify({ ok, cases: results, featureSummary: featureSummary(), defaultChartinkEnabled: RESEARCH_CONFIG.chartinkEnabled }, null, 2));
process.exitCode = ok ? 0 : 1;
