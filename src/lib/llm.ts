import { readFile } from 'node:fs/promises';
import type { ResearchManifest } from '../types/research.js';
import { writeText } from './fs.js';

export async function runLlmAnalysis(systemPrompt:string, userPrompt:string, outPath:string){
  const endpoint=process.env.LLM_ENDPOINT;
  const apiKey=process.env.LLM_API_KEY;
  const model=process.env.LLM_MODEL;
  if(!endpoint || !apiKey || !model){
    throw new Error('LLM analysis is not configured. Set LLM_ENDPOINT, LLM_API_KEY and LLM_MODEL. The research artifacts and analysis-prompt.txt were still generated.');
  }
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),Number(process.env.LLM_TIMEOUT_MS||120000));
  try{
    const body={model,messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],temperature:0.15};
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(body),signal:controller.signal});
    const text=await r.text();
    if(!r.ok) throw new Error(`LLM HTTP ${r.status}: ${text.slice(0,2000)}`);
    const data=JSON.parse(text);
    const content=data?.choices?.[0]?.message?.content;
    if(typeof content!=='string') throw new Error('LLM response did not contain choices[0].message.content');
    const clean=content.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    JSON.parse(clean);
    await writeText(outPath,clean);
    return clean;
  }finally{clearTimeout(timeout);}
}
