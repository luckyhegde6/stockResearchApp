import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';
import type { ResearchManifest } from '../types/research.js';
import { writeTechnicalNormalized } from './technical-normalizer.js';
import { writeEvidenceContract } from './evidence-contract.js';
import { writeEvidenceBundle } from './evidence-bundle.js';
import { writeSourceHealth } from './source-health.js';
import { writeEvidenceQuality } from './evidence-quality.js';

export async function runNormalization(researchDir:string, manifest:ResearchManifest){
  const derived=[] as any[];
  const technicalPath=await writeTechnicalNormalized(researchDir);
  derived.push({id:'tradingview-technical-normalized',type:'derived_data',provider:'script',title:'Canonical deterministic 1D technical dataset',localPath:technicalPath,retrievedAt:new Date().toISOString(),status:'ok',method:'script',notes:['Derived from canonical NSE EQ history.']});
  manifest.sourceArtifacts=[...manifest.sourceArtifacts,...derived];
  const health=await writeSourceHealth(researchDir,manifest);
  const quality=await writeEvidenceQuality(researchDir,manifest);
  manifest.sourceArtifacts.push({id:'source-health',type:'derived_data',provider:'script',title:'Deterministic source health report',localPath:health,retrievedAt:new Date().toISOString(),status:'ok',method:'script',notes:[]});
  manifest.sourceArtifacts.push({id:'evidence-quality',type:'derived_data',provider:'script',title:'Deterministic evidence quality report',localPath:quality.out,retrievedAt:new Date().toISOString(),status:quality.report.status==='ok'?'ok':'partial',method:'script',notes:[]});
  await writeFile(path.join(researchDir,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');
  const contract=await writeEvidenceContract(researchDir,manifest);
  const bundle=await writeEvidenceBundle(researchDir,manifest);
  return {technicalPath,sourceHealth:health,evidenceQuality:quality.out,evidenceContract:contract.out,evidenceBundle:bundle};
}

async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run normalize -- RELIANCE');const dir=path.join(process.cwd(),'research',ticker);const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;console.log(JSON.stringify(await runNormalization(dir,m),null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
