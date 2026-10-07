import { loadNseEquityUniverse, resolveNseSecurity } from '../src/lib/nse-securities.js';
const u = await loadNseEquityUniverse(process.cwd());
const itc = resolveNseSecurity('ITC', u);
const reliance = resolveNseSecurity('RELIANCE', u);
if (u.length < 2000) throw new Error(`Unexpected universe size: ${u.length}`);
if (!itc.record || itc.record.series !== 'EQ') throw new Error('ITC not resolved as EQ');
if (!reliance.record || reliance.record.series !== 'EQ') throw new Error('RELIANCE not resolved as EQ');
console.log(JSON.stringify({ ok: true, count: u.length, itc: itc.record, reliance: reliance.record }, null, 2));
