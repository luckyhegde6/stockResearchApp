import { buildTradingViewInstrument } from '../src/lib/tradingview-url.js';
const i = buildTradingViewInstrument('ITC','NSE');
if (i.chartUrl !== 'https://in.tradingview.com/chart/?symbol=NSE%3AITC') throw new Error(i.chartUrl);
console.log(JSON.stringify({ok:true,chartUrl:i.chartUrl},null,2));
