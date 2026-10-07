import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildIndividualStockEvidence } from '../src/lib/individual-stock-evidence.js';
const ticker=process.argv[2]?.toUpperCase() || 'ITC';
const dir=path.join(process.cwd(),'research',ticker);
const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
const r=await buildIndividualStockEvidence(dir,manifest);
console.log(JSON.stringify({ok:Boolean(r.security)&&r.facts.length>0,ticker,security:r.security,facts:r.facts.length,calculatedMetrics:r.metrics.length,conflicts:r.reconciliation.conflictCount},null,2));
