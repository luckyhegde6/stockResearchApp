import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

function clean(v:any){return String(v??'').replace(/\s+/g,' ').trim();}
function num(v:any){const s=clean(v).replace(/₹/g,'').replace(/,/g,'').replace(/%/g,'');if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null;}

export async function writeCanonicalFinancialTables(researchDir:string){
  const outDir=path.join(researchDir,'normalized');
  const screener=await readJson(path.join(researchDir,'raw','screener','fundamental-snapshot.json'));
  const tables=(screener?.tables||[]).map((t:any)=>({
    caption:clean(t.caption),
    headers:Array.isArray(t.headers)?t.headers.map(clean):[],
    rows:Array.isArray(t.rows)?t.rows.map((r:any[])=>r.map(clean)):[]
  })).filter((t:any)=>t.headers.length||t.rows.length);
  const normalized={schema_version:'1.0',ticker:path.basename(researchDir),source:'Screener',method:'deterministic_table_normalization',generatedAt:new Date().toISOString(),tables,notes:['Values are preserved from the captured source tables; no LLM inference.']};
  await writeFile(path.join(outDir,'screener-financial-tables.json'),JSON.stringify(normalized,null,2),'utf8');

  const tijori=await readJson(path.join(researchDir,'raw','tijori','financial-context.json'));
  const tijoriText=clean(tijori?.text);
  const tijoriNormalized={schema_version:'1.0',ticker:path.basename(researchDir),source:'Tijori',method:'deterministic_text_snapshot',generatedAt:new Date().toISOString(),text:tijoriText};
  await writeFile(path.join(outDir,'tijori-context.json'),JSON.stringify(tijoriNormalized,null,2),'utf8');

  return {screener:path.join(outDir,'screener-financial-tables.json'),tijori:path.join(outDir,'tijori-context.json')};
}
