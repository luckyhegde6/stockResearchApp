import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTradingViewSurfaceUrl } from '../src/lib/tradingview-url.js';

async function main() {
  const src = await readFile(new URL('../src/adapters/tradingview.ts', import.meta.url), 'utf8');
  const urls = {
    forecast: buildTradingViewSurfaceUrl('ITC', 'NSE', 'forecast'),
    news: buildTradingViewSurfaceUrl('ITC', 'NSE', 'news'),
    documents: buildTradingViewSurfaceUrl('ITC', 'NSE', 'documents'),
    seasonals: buildTradingViewSurfaceUrl('ITC', 'NSE', 'seasonals'),
    community: buildTradingViewSurfaceUrl('ITC', 'NSE', 'community'),
  };
  const checks = {
    directPlaywright: src.includes("playwright-direct-public-symbol-page"),
    fullPageScreenshot: src.includes("fullPage: true"),
    canonicalBuilder: src.includes("buildTradingViewSurfaceUrl"),
    noMetricsLauncher: !src.includes("clickMetricsLauncher") && !src.includes("openTradingViewMetricsMenu"),
    noLocalSurfaceBuilder: !src.includes("function tradingViewSurfaceUrl"),
    routeConfirmation: src.includes("routeMatched") && src.includes("targetUrl"),
    evidenceContractUnchanged: src.includes("direct-public-symbol-page"),
  };
  assert.ok(Object.values(checks).every(Boolean));
  assert.ok(urls.forecast.endsWith('/symbols/NSE-ITC/forecast-price-target/'));
  assert.ok(urls.news.endsWith('/symbols/NSE-ITC/news/'));
  assert.ok(urls.documents.endsWith('/symbols/NSE-ITC/documents/'));
  assert.ok(urls.seasonals.endsWith('/symbols/NSE-ITC/seasonals/'));
  assert.ok(urls.community.endsWith('/symbols/NSE-ITC/community/'));
  console.log(JSON.stringify({ok:true,checks,urls},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});