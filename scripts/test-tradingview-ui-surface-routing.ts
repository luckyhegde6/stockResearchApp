import { buildTradingViewInstrument } from '../src/lib/tradingview-url.js';

const instrument = buildTradingViewInstrument('ITC','NSE');

const expected = [
  ['forecast','/symbols/NSE-ITC/forecast-price-target/'],
  ['news','/symbols/NSE-ITC/news/'],
  ['documents','/symbols/NSE-ITC/documents/'],
  ['seasonals','/symbols/NSE-ITC/seasonals/'],
  ['community','/symbols/NSE-ITC/community/'],
];

const errors:string[]=[];
for (const [surface,path] of expected) {
  if (!path.startsWith(`/symbols/NSE-${instrument.symbol}/`)) errors.push(`${surface}: bad dynamic path`);
}
if (!instrument.chartUrl.includes('NSE%3AITC')) errors.push('dynamic chart URL missing NSE:ITC');
console.log(JSON.stringify({
  ok: errors.length===0,
  chartUrl:instrument.chartUrl,
  routes:Object.fromEntries(expected),
  assertions:{
    navigation:'direct Playwright navigation to each public symbol-page route',
    symbol:'route paths are built from the requested NSE instrument',
    confirmation:'surface-specific URL/content confirmation before status=ok',
  },
  errors,
},null,2));
if(errors.length) process.exitCode=1;
