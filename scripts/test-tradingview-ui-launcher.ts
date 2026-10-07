import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const text = await readFile(new URL('../src/adapters/tradingview.ts', import.meta.url), 'utf8');
assert.equal(text.includes('clickMetricsLauncher'), false);
assert.equal(text.includes('openTradingViewMetricsMenu'), false);
assert.equal(text.includes('findMetricsSurfaceItem'), false);
assert.equal(text.includes('clickUiSurface'), false);
assert.equal(text.includes('buildTradingViewSurfaceUrl'), true);
assert.equal(text.includes('waitForUiSurfaceConfirmation'), true);
console.log(JSON.stringify({
  ok:true,
  test:'tradingview-ui-legacy-launcher-removal',
  assertions:{
    metricsCodeRemoved:true,
    directSurfaceBuilder:true,
    routeConfirmation:true
  }
},null,2));