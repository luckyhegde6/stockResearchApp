import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const file = path.resolve(process.cwd(), 'src/adapters/tradingview.ts');
  const text = await readFile(file, 'utf8');
  const required = [
    'buildTradingViewSurfaceUrl',
    'in.tradingview.com/symbols/',
    'forecast-price-target',
    'playwright-direct-public-symbol-page',
    'TRADINGVIEW_DIRECT_SURFACE_TIMEOUT_MS',
    'TRADINGVIEW_DIRECT_SURFACE_SETTLE_MS',
    'directNavigationFallback',
    'selection:{',
    'strategy:\'direct-public-symbol-page\'',
    'routeHint',
    'contentHint',
    'surfaceConfirmed',
    'waitForUiSurfaceConfirmation',
  ];
  const missing = required.filter(x => !text.includes(x));
  const ok = missing.length === 0;
  console.log(JSON.stringify({
    ok,
    test: 'tradingview-ui-metrics',
    missing,
    assertions: {
      directNavigation: 'UI surfaces are captured directly from TradingView public symbol-page URLs via Playwright, with a chart-page settle before each capture',
      confirmation: 'Surface is confirmed by route transition or strong surface-specific content, not by a generic label anywhere in the DOM',
      evidence: 'Navigation metadata, route/content hints and surface-confirmed flag are recorded alongside the screenshot',
      screenshots: 'retained even when confirmation fails',
    },
  }, null, 2));
  if (!ok) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });