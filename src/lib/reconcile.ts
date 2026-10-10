import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { readJson } from './canonical.js';
import type { ResearchManifest } from '../types/research.js';

function pct(a:number,b:number){return Math.abs(a-b)/(Math.abs(b)||1)*100;}

export async function buildReconciliation(researchDir:string,manifest:ResearchManifest){
  const canonical=await readJson(path.join(researchDir,'normalized','canonical-facts.json'));
  const facts=Array.isArray(canonical?.facts)?canonical.facts:[];
  const byField=new Map<string,any[]>();
  for(const f of facts){ if(typeof f.value!=='number') continue; const arr=byField.get(f.field)??[]; arr.push(f); byField.set(f.field,arr); }
  const comparisons:any[]=[];
  for(const [field,vals] of byField){
    const uniqueSources=[...new Set(vals.map(x=>x.source))];
    if(uniqueSources.length<2)continue;
    const min=Math.min(...vals.map(x=>Number(x.value))); const max=Math.max(...vals.map(x=>Number(x.value)));
    const spread=max-min; const spreadPercent=pct(max,min||1);
    comparisons.push({field,values:vals.map((x:any)=>({source:x.source,value:x.value,asOf:x.asOf,evidencePath:x.evidencePath,sourceArtifact:x.sourceArtifact??null})),sourceCount:uniqueSources.length,min,max,numericSpread:spread,spreadPercent,resolution:spreadPercent<=1?'consistent':spreadPercent<=5?'minor_difference':'material_difference',silentResolutionAllowed:false});
  }
  const out={schema_version:'1.0',ticker:manifest.ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,comparisons,summary:{fieldsCompared:comparisons.length,consistent:comparisons.filter(x=>x.resolution==='consistent').length,minorDifferences:comparisons.filter(x=>x.resolution==='minor_difference').length,materialDifferences:comparisons.filter(x=>x.resolution==='material_difference').length},rules:{noSilentResolution:true,priceDifferenceThresholdPercent:1,minorDifferencePercent:5,materialDifferenceAbovePercent:5,commonAliases:['last_price','market_cap','pe_ratio','roce','roe','last_price','book_value','debt','sales_growth','profit_growth']}};
  await writeFile(path.join(researchDir,'normalized','cross-source-reconciliation.json'),JSON.stringify(out,null,2),'utf8');
  return out;
}

async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run reconcile -- ITC');const dir=path.join(process.cwd(),'research',ticker);const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;console.log(JSON.stringify(await buildReconciliation(dir,manifest),null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
