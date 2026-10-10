import { buildMarketScanQuality } from '../src/lib/market-scan-quality.js';
const r=await buildMarketScanQuality();
console.log(JSON.stringify({ok:r.deterministic===true && r.llmUsed===false, status:r.status, chartink:r.chartink, nse52WeekHigh:r.nse52WeekHigh, warnings:r.warnings},null,2));
