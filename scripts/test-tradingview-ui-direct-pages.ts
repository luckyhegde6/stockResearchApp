import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function main() {
  const src = await readFile(new URL('../src/adapters/tradingview.ts', import.meta.url), 'utf8');
  const checks = {
    publicNews: src.includes("news:'news'"),
    publicDocuments: src.includes("documents:'documents'"),
    publicSeasonals: src.includes("seasonals:'seasonals'"),
    publicForecast: src.includes("forecast:'forecast-price-target'"),
    directPlaywright: src.includes("playwright-direct-public-symbol-page"),
    fullPageScreenshot: src.includes("fullPage: true"),
    noMetricsRequired: src.includes('No Metrics launcher interaction is required for these surfaces.'),
  };
  assert.equal(checks.publicNews,true);
  assert.equal(checks.publicDocuments,true);
  assert.equal(checks.publicSeasonals,true);
  assert.equal(checks.publicForecast,true);
  assert.equal(checks.directPlaywright,true);
  assert.equal(checks.fullPageScreenshot,true);
  assert.equal(checks.noMetricsRequired,true);
  console.log(JSON.stringify({ok:true,checks},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
