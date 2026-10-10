import { readFile } from 'node:fs/promises';
import { flattenNseIndexCatalog } from '../src/data/nse-index-catalog.js';
import { normalizeIndexListPayload, transformIndexDataPayload } from '../src/lib/nse-market-transformers.js';

const raw = JSON.parse(await readFile(new URL('../fixtures/nse-getIndicesData-nifty50.sample.json', import.meta.url), 'utf8'));
const catalog = flattenNseIndexCatalog();
const nifty = catalog.find(x => x.displayName === 'NIFTY 50');
if (!nifty) throw new Error('NIFTY 50 missing from catalog');
const normalized = transformIndexDataPayload(nifty, raw);
if (normalized.rowCount !== 51) throw new Error(`Expected 51 sample rows, got ${normalized.rowCount}`);
if (!normalized.symbols.includes('ITC')) throw new Error('ITC not found in NIFTY 50 transformer output');
const list = normalizeIndexListPayload({ data: { 'Broad Market Indices': { 'NIFTY 500': 'NIFTY 500' } } });
if (!list.entries.some(x => x.displayName === 'NIFTY 500' && x.apiSymbol === 'NIFTY 500')) throw new Error('Index-list transformer failed');
console.log(JSON.stringify({ ok: true, catalogCount: catalog.length, sampleRows: normalized.rowCount, sampleSymbols: normalized.symbols.length, containsITC: normalized.symbols.includes('ITC') }, null, 2));
