import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const file = path.resolve(process.cwd(), 'src/adapters/tradingview.ts');
  const text = await readFile(file, 'utf8');
  const required = [
    'tradingViewSurfaceUrl',
    'in.tradingview.com/symbols/NSE-',
    'captureUiSurface',
    'direct-public-symbol-page',
    'TRADINGVIEW_DIRECT_SURFACE_TIMEOUT_MS',
    'TRADINGVIEW_DIRECT_SURFACE_SETTLE_MS',
    'TRADINGVIEW_UI_SURFACE_SETTLE_MS',
    'TRADINGVIEW_INITIAL_SETTLE_MS',
    'waitForUiSurfaceConfirmation',
    'routeChanged',
    'surfaceContent',
    'Forecast',
    'News',
    'Documents',
    'Seasonals',
    'Community',
    'Financials',
  ];
  const missing = required.filter(x => !text.includes(x));
  const ok = missing.length === 0;
  console.log(JSON.stringify({
    ok,
    test: 'tradingview-ui-direct-pages',
    missing,
    assertion: 'UI surfaces are captured directly from TradingView public symbol-page URLs through Playwright, with a chart-page settle before each capture and route/content confirmation',
  }, null, 2));
  if (!ok) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });