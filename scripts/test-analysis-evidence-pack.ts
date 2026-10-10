import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildAnalysisEvidencePack } from '../src/lib/analysis-evidence-pack.js';
import type { ResearchManifest } from '../src/types/research.js';

const ticker = (process.argv[2] || 'ITC').toUpperCase();
const dir = path.join(process.cwd(),'fixtures','research',ticker);
const manifest = JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;
const pack = await buildAnalysisEvidencePack(dir,manifest);
const ok = pack.deterministic === true && pack.llmUsed === false && pack.ticker === ticker && Array.isArray(pack.canonicalFacts) && Array.isArray(pack.calculatedMetrics) && !!pack.identity && !!pack.sourceHealth && !!pack.quality;
console.log(JSON.stringify({ok,ticker,facts:pack.canonicalFacts.length,calculatedMetrics:pack.calculatedMetrics.length,documents:pack.documents.count,visualScreenshots:pack.visualEvidence?.screenshots?.length ?? 0,conflicts:pack.reconciliation?.conflictCount ?? 0},null,2));
if(!ok) process.exitCode=1;
