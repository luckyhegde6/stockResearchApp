import { CHARTINK_SCAN_REGISTRY, CHARTINK_SCAN_TYPES } from '../src/lib/chartink-scan-registry.js';

const expected = { fundamental: 13, candlestick: 13, 'range-breakouts': 26, bullish: 11, bearish: 15, intraday: 26, swing: 12 };
const counts = Object.fromEntries(CHARTINK_SCAN_TYPES.map(t => [t, CHARTINK_SCAN_REGISTRY.filter(s => s.scanType === t).length]));
const duplicateUrls = CHARTINK_SCAN_REGISTRY.map(s => s.url).filter((u,i,a)=>a.indexOf(u)!==i);
const badUrls = CHARTINK_SCAN_REGISTRY.filter(s => !/^https:\/\/chartink\.com\/(scanner|screener)\//.test(s.url));
const ok = CHARTINK_SCAN_REGISTRY.length === 116 && JSON.stringify(counts) === JSON.stringify(expected) && duplicateUrls.length === 0 && badUrls.length === 0;
console.log(JSON.stringify({ ok, total: CHARTINK_SCAN_REGISTRY.length, counts, duplicateUrls, badUrls }, null, 2));
if (!ok) process.exitCode = 1;
