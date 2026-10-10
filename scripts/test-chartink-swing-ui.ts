import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CHARTINK_SCAN_REGISTRY, CHARTINK_SCAN_TYPES, getScansByType } from '../src/lib/chartink-scan-registry.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const [html, server] = await Promise.all([
  readFile(path.join(root, 'public', 'index.html'), 'utf8'),
  readFile(path.join(root, 'src', 'server.ts'), 'utf8'),
]);

const swingScans = getScansByType('swing');
const swingUrls = swingScans.map(scan => scan.url);
assert(CHARTINK_SCAN_TYPES.includes('swing'), 'Chartink scan registry must include the swing category');
assert(swingScans.length >= 10, 'Provide a useful list of Chartink swing screeners');
assert(new Set(swingUrls).size === swingUrls.length, 'Swing screener URLs must be unique');
assert(swingScans.every(scan => /^https:\/\/chartink\.com\/screener\//.test(scan.url)), 'Swing scans must link to Chartink public screener pages');
assert(swingScans.some(scan => /BTST/i.test(scan.name)), 'Include a swing/BTST screener');
assert(swingScans.some(scan => /SuperTrend.*RSI/i.test(scan.name)), 'Include a SuperTrend + RSI swing screener');
assert(swingScans.some(scan => /Nifty 500/i.test(scan.name)), 'Include a Nifty 500 swing screener');

assert(server.includes("pathname === '/api/chartink/scans'"), 'Dashboard must expose the Chartink scan catalog');
assert(server.includes("pathname === '/api/securities/search'"), 'Dashboard must expose NSE symbol search');
assert(html.includes('id="launch-symbol-suggestions"'), 'Launcher must render its autocomplete list');
assert(html.includes('onLaunchSymbolSearchInput(this.value)'), 'Launcher input must request symbol suggestions while typing');
assert(html.includes('handleLaunchSymbolKeydown(event)'), 'Launcher autocomplete must support keyboard navigation');
assert(html.includes('id="swing-scan-dropdown"'), 'Market Scans must include the separate Swing Scans dropdown');
assert(html.includes('/api/chartink/scans?type=swing'), 'Swing dropdown must load the curated server-side registry');
assert(html.includes('Open Selected Screener on Chartink'), 'Swing dropdown must provide a direct Chartink link');

console.log(JSON.stringify({
  ok: true,
  swingScanCount: swingScans.length,
  totalChartinkScans: CHARTINK_SCAN_REGISTRY.length,
  symbolAutocomplete: true,
  swingDropdown: true,
}, null, 2));
