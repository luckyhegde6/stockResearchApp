import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const tv = await fs.readFile(path.join(root,'src','adapters','tradingview.ts'),'utf8');
const idx = await fs.readFile(path.join(root,'src','index.ts'),'utf8');
const config = await fs.readFile(path.join(root,'src','lib','research-config.ts'),'utf8');
const aep = await fs.readFile(path.join(root,'src','lib','analysis-evidence-pack.ts'),'utf8');
const ai = await fs.readFile(path.join(root,'src','lib','analysis-inputs.ts'),'utf8');

const checks = {
  dynamicInstrument: tv.includes("buildTradingViewInstrument(ctx.ticker, 'NSE')"),
  directPublicSymbolPage: tv.includes('buildTradingViewSurfaceUrl') && tv.includes('in.tradingview.com/symbols/'),
  noLegacyMetricsPath: !tv.includes('clickMetricsLauncher') &&
    !tv.includes('findMetricsSurfaceItem') &&
    !tv.includes('clickUiSurface'),
  routeConfirmation: tv.includes('routeMatched') && tv.includes('targetUrl'),
  surfaceLabels: tv.includes("'Forecast'") &&
    tv.includes("'News'") &&
    tv.includes("'Documents'") &&
    tv.includes("'Seasonals'") &&
    tv.includes("'Community'"),
  directNavigationMethod: tv.includes("method:'playwright-direct-public-symbol-page'"),
  fullPageScreenshot: tv.includes('fullPage: true'),
  canonicalDirectPageComment: tv.includes("Use TradingView's stable public symbol pages directly with\n  // Playwright"),
  uiArtifact: tv.includes('tradingview-ui-${surface}'),
  uiSummary: tv.includes("'ui-surfaces.json'"),
  configEnv: config.includes('TRADINGVIEW_UI_SURFACES'),
  doctorAuditDynamic: idx.includes('uiSurfaceNames'),
  standaloneCommand: idx.includes("case 'tradingview-ui'"),
  packSurface: aep.includes('tradingViewUiSurfaces'),
  inputsSurface: ai.includes('tradingViewUiSurfaces'),
};

const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ok, checks}, null, 2));
process.exitCode = ok ? 0 : 1;