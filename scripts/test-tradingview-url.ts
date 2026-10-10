import assert from 'node:assert/strict';
import {
  buildTradingViewInstrument,
  buildTradingViewSurfaceUrl,
} from '../src/lib/tradingview-url.js';

const symbols=['ITC','RELIANCE','HDFCBANK','M&M'];
const surfaces=['forecast','news','documents','seasonals','community'] as const;

for (const symbol of symbols) {
  const instrument=buildTradingViewInstrument(symbol,'NSE');
  assert.equal(instrument.tvSymbol, 'NSE:' + symbol);
  assert.equal(instrument.chartUrl, 'https://in.tradingview.com/chart/?symbol=' + encodeURIComponent('NSE:' + symbol));

  for (const surface of surfaces) {
    const url=new URL(buildTradingViewSurfaceUrl(symbol,'NSE',surface));
    assert.equal(url.hostname,'in.tradingview.com');
    assert.ok(url.pathname.startsWith('/symbols/NSE-'));
    assert.ok(url.pathname.endsWith('/' + surfacePath(surface) + '/'));
    assert.ok(url.pathname.includes('/NSE-' + encodeURIComponent(symbol) + '/'));
  }
}

function surfacePath(surface: typeof surfaces[number]): string {
  return surface === 'forecast' ? 'forecast-price-target' : surface;
}

const itc=buildTradingViewInstrument('ITC','NSE');
assert.equal(itc.chartUrl,'https://in.tradingview.com/chart/?symbol=NSE%3AITC');
assert.equal(buildTradingViewSurfaceUrl('ITC','NSE','news'),'https://in.tradingview.com/symbols/NSE-ITC/news/');
assert.equal(buildTradingViewSurfaceUrl('ITC','NSE','documents'),'https://in.tradingview.com/symbols/NSE-ITC/documents/');
assert.equal(buildTradingViewSurfaceUrl('ITC','NSE','seasonals'),'https://in.tradingview.com/symbols/NSE-ITC/seasonals/');
assert.equal(buildTradingViewSurfaceUrl('ITC','NSE','community'),'https://in.tradingview.com/symbols/NSE-ITC/community/');
assert.equal(buildTradingViewSurfaceUrl('ITC','NSE','forecast'),'https://in.tradingview.com/symbols/NSE-ITC/forecast-price-target/');

console.log(JSON.stringify({ok:true,symbols,surfaces},null,2));
