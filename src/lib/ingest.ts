import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { ensureDir, fileExists, readText, writeText } from './fs.js';
import { runMarkItDown } from './cli.js';
import { writeVisualEvidence } from './visual-evidence.js';
import type { SourceArtifact } from '../types/research.js';

const SUPPORTED = /\.(pdf|docx|xlsx|xls|pptx|ppt|html?|txt|csv)$/i;

async function walk(dir:string):Promise<string[]> {
  const out:string[]=[];
  if(!(await fileExists(dir))) return out;
  for(const ent of await readdir(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) out.push(...await walk(p));
    else if(SUPPORTED.test(ent.name)) out.push(p);
  }
  return out;
}

export async function ingestResearch(researchDir:string, artifacts:SourceArtifact[]) {
  const markdownDir=path.join(researchDir,'markdown'); await ensureDir(markdownDir);
  const files=await walk(path.join(researchDir,'raw'));
  const results:{input:string,output:string,status:'ok'|'error',error?:string}[]=[];
  for(const file of files){
    const rel=path.relative(path.join(researchDir,'raw'),file).replaceAll(path.sep,'/');
    const output=path.join(markdownDir,rel.replace(/\.(pdf|docx|xlsx|xls|pptx|ppt|html?)$/i,'.md').replace(/\.txt$/i,'.md'));
    try{
      const r=await runMarkItDown(file,output,process.cwd(),120000);
      if(r.code!==0) throw new Error((r.stderr||r.stdout).slice(-2000));
      results.push({input:file,output,status:'ok'});
    }catch(e:any){ results.push({input:file,output,status:'error',error:e.message}); }
  }

  const visual=await writeVisualEvidence(researchDir);
  const mdFiles=await walk(markdownDir);
  const combined:string[]=[];
  for(const file of mdFiles){
    const txt=await readText(file).catch(()=> '');
    if(!txt) continue;
    const rel=path.relative(markdownDir,file).replaceAll(path.sep,'/');
    combined.push(`\n\n# SOURCE DOCUMENT: ${rel}\n\n${txt}`);
  }
  await writeText(path.join(markdownDir,'ALL_EVIDENCE.md'),combined.join('\n'));

  // Deterministic structured evidence pack for JSON/TXT/HTML source captures that are not converted by MarkItDown.
  const structured:string[]=[];
  await writeText(path.join(markdownDir,'INGESTION_REPORT.json'),JSON.stringify({schema_version:'1.0',generatedAt:new Date().toISOString(),results,counts:{total:results.length,ok:results.filter(r=>r.status==='ok').length,error:results.filter(r=>r.status==='error').length},deterministic:true,llmUsed:false},null,2));

  for(const a of artifacts){
    if(!a.localPath || a.markdownPath) continue;
    if(!/\.(json|txt|html?|csv|xml)$/i.test(a.localPath)) continue;
    const txt=await readText(a.localPath).catch(()=> '');
    if(!txt.trim()) continue;
    structured.push(`\n\n# STRUCTURED SOURCE: ${a.id} | ${a.provider} | ${a.type}\n\nSource URL: ${a.url||'N/A'}\nAcquisition method: ${a.method||'script'}\n\n${txt}`);
  }
  await writeText(path.join(markdownDir,'STRUCTURED_EVIDENCE.md'),structured.join('\n'));

  // Extract MDA-like sections into a dedicated analyst input. This is deliberately heuristic.
  const mdaSections:string[]=[];
  for(const file of mdFiles){
    const txt=await readText(file).catch(()=> '');
    const lines=txt.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      if(/management discussion|management discussion & analysis|management discussion and analysis|md&a|business review/i.test(lines[i])){
        mdaSections.push(`\n# MDA EVIDENCE: ${path.relative(markdownDir,file)}\n\n${lines.slice(Math.max(0,i-3),Math.min(lines.length,i+220)).join('\n')}`);
        break;
      }
    }
  }
  await writeText(path.join(markdownDir,'MDA_EVIDENCE.md'),mdaSections.join('\n'));

  for(const a of artifacts){
    if(!a.localPath) continue;
    const abs=a.localPath;
    const rel=path.relative(path.join(researchDir,'raw'),abs).replaceAll(path.sep,'/');
    const md=path.join(markdownDir,rel.replace(/\.(pdf|docx|xlsx|xls|pptx|ppt|html?)$/i,'.md').replace(/\.txt$/i,'.md'));
    const matching=results.find(x=>x.input===abs && x.status==='ok');
    if(matching) a.markdownPath=md;
  }
  return {results,visualEvidence:visual,allEvidence:path.join(markdownDir,'ALL_EVIDENCE.md'),structuredEvidence:path.join(markdownDir,'STRUCTURED_EVIDENCE.md'),mdaEvidence:path.join(markdownDir,'MDA_EVIDENCE.md')};
}
