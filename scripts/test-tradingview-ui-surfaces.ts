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
  directPublicSymbolPage: tv.includes('tradingViewSurfaceUrl') && tv.includes('in.tradingview.com/symbols/NSE-'),
  surfacePaths: tv.includes('forecast-price-target') &&
    tv.includes('news:\'news\'') &&
    tv.includes('documents:\'documents\'') &&
    tv.includes('seasonals:\'seasonals\'') &&
    tv.includes('community:\'community\''),
  surfaceLabels: tv.includes("'Forecast'") &&
    tv.includes("'News'") &&
    tv.includes("'Documents'") &&
    tv.includes("'Seasonals'") &&
    tv.includes("'Community'"),
  directNavigationMethod: tv.includes("method:'playwright-direct-public-symbol-page'"),
  fullPageScreenshot: tv.includes('fullPage: true'),
  noMetricsLauncher: tv.includes('No Metrics launcher interaction is required for these surfaces.'),
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