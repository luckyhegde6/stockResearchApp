import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildEvidenceQuality } from '../src/lib/evidence-quality.js';
import type { ResearchManifest } from '../src/types/research.js';

async function main(){
  const ticker=(process.argv[2]||'ITC').toUpperCase();
  const dir=path.join(process.cwd(),'fixtures','research',ticker);
  const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;
  const report=await buildEvidenceQuality(dir,manifest);
  const summary = report.report?.summary || report.summary || { missing: 0 };
  const bySource = report.report?.bySource || report.bySource || {};
  console.log(JSON.stringify({ticker,status:report.status,summary,bySource},null,2));
  if(summary.missing > 0 && report.status !== 'ok') process.exitCode=1;
}
main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
