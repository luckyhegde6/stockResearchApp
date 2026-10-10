import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir } from '../src/lib/fs.js';
import { NSE_EQUITY_SOURCE_CSV, writeUniverseSnapshot } from '../src/lib/nse-securities.js';

const ROOT = process.cwd();
const dataDir = path.join(ROOT, 'data');
await ensureDir(dataDir);
const res = await fetch(NSE_EQUITY_SOURCE_CSV, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/csv,*/*' } });
if (!res.ok) throw new Error(`NSE EQUITY_L.csv HTTP ${res.status}`);
const csv = await res.text();
await writeFile(path.join(dataDir, 'EQUITY_L.csv'), csv, 'utf8');
const snapshot = await writeUniverseSnapshot(ROOT);
console.log(JSON.stringify({ ok: true, source: NSE_EQUITY_SOURCE_CSV, count: snapshot.count, json: snapshot.jsonPath, meta: snapshot.metaPath }, null, 2));
