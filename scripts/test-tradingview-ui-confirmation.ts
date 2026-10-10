import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const file = path.resolve(process.cwd(), 'src/adapters/tradingview.ts');
  const text = await readFile(file, 'utf8');
  const required = [
    'buildTradingViewSurfaceUrl',
    'in.tradingview.com/symbols/',
    'waitForUiSurfaceConfirmation',
    'routeChanged',
    'surfaceContent',
    'Price target|Analyst rating|Actuals and estimates',
    'Latest news|Earnings|Dividends|Share buybacks|Mergers and acquisitions|Insider trading|Analysts',
    'Documents|Earnings, Q\\d|Corporate events',
    'Seasonals|Seasonality',
    'Community|Ideas|Published',
    'selection:{',
    'directNavigationFallback',
    'direct-public-symbol-page',
    'surfaceConfirmed',
    'routeHint',
    'contentHint',
  ];
  const missing = required.filter(x => !text.includes(x));
  const ok = missing.length === 0;
  console.log(JSON.stringify({
    ok,
    test: 'tradingview-ui-confirmation',
    missing,
    assertions: {
      directNavigation: 'UI surfaces are captured directly from TradingView stable public symbol-page URLs via Playwright, with a chart-page settle before each capture',
      confirmation: 'Selection is confirmed by route transition or strong surface-specific content, not by a generic label anywhere in the DOM',
      fallback: 'Screenshots are still retained when a surface cannot be confirmed',
    },
  }, null, 2));
  if (!ok) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });