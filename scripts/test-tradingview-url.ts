import { buildTradingViewInstrument } from '../src/lib/tradingview-url.js';
const symbols=['ITC','RELIANCE','HDFCBANK','M&M'];
console.log(JSON.stringify(symbols.map(symbol=>buildTradingViewInstrument(symbol,'NSE')),null,2));
const itc=buildTradingViewInstrument('ITC','NSE');
if(itc.chartUrl!=='https://in.tradingview.com/chart/?symbol=NSE%3AITC') throw new Error(`Unexpected ITC chart URL: ${itc.chartUrl}`);
console.log('TRADINGVIEW_URL_TEST_OK');
