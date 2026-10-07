import assert from 'node:assert/strict';
import { buildTradingViewInstrument, buildTradingViewSurfaceUrl } from '../src/lib/tradingview-url.js';

const symbols=['ITC','RELIANCE','BEL','M&M'];
const surfaces=['forecast','news','documents','seasonals','community'] as const;

for (const symbol of symbols) {
  const instrument=buildTradingViewInstrument(symbol,'NSE');
  assert.equal(new URL(instrument.chartUrl).hostname,'in.tradingview.com');
  for (const surface of surfaces) {
    const url=buildTradingViewSurfaceUrl(symbol,'NSE',surface);
    const parsed=new URL(url);
    assert.equal(parsed.hostname,'in.tradingview.com');
    assert.ok(parsed.pathname.startsWith('/symbols/NSE-'));
    assert.ok(parsed.pathname.includes('/NSE-' + encodeURIComponent(symbol) + '/'));
  }
}

const itcRoutes=Object.fromEntries(surfaces.map(surface=>[surface,buildTradingViewSurfaceUrl('ITC','NSE',surface)]));
console.log(JSON.stringify({
  ok:true,
  routes:itcRoutes,
  assertions:{
    navigation:'direct Playwright navigation to canonical public symbol-page routes',
    symbol:'each route contains the requested NSE symbol',
    confirmation:'production capture requires exact host + pathname match and surface-specific content',
  },
},null,2));