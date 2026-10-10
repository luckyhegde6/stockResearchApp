import { loadNseEquityUniverse, resolveNseSecurity } from '../src/lib/nse-securities.js';
const q = process.argv.slice(2).join(' ').trim();
const universe = await loadNseEquityUniverse(process.cwd());
if (!q) { console.log(JSON.stringify({ count: universe.length, sample: universe.slice(0, 20) }, null, 2)); process.exit(0); }
const r = resolveNseSecurity(q, universe);
console.log(JSON.stringify({ query: q, ...r }, null, 2));
if (!r.record) process.exitCode = 2;
