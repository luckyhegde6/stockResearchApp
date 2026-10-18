import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export type HealthStatus='pass'|'warn'|'fail';
export interface HealthCheck { name:string; status:HealthStatus; detail:string }
export function summarizeHealthChecks(checks:HealthCheck[]) {
  const counts:Record<HealthStatus,number>={pass:0,warn:0,fail:0};
  for(const check of checks) counts[check.status]++;
  return {status:counts.fail?'fail':counts.warn?'warn':'pass',counts,checks} as const;
}
export function optionalPairCheck(name:string,a:boolean,b:boolean,firstLabel='first setting',secondLabel='second setting'):HealthCheck {
  if(a&&b) return {name,status:'pass',detail:'Both settings are configured; values were not displayed.'};
  if(!a&&!b) return {name,status:'warn',detail:'Not configured; this integration is optional and local research remains available.'};
  const detail = a
    ? `${firstLabel} is set but ${secondLabel} is missing. Configure both or remove ${firstLabel}.`
    : `${secondLabel} is set but ${firstLabel} is missing. Configure both or remove ${secondLabel}.`;
  return {name,status:'fail',detail};
}
export function parseTestSuitePaths(source:string):string[] {
  const paths=new Set<string>();
  for(const match of source.matchAll(/^\s*'(scripts\/test-[^']+\.ts)',?\s*$/gm)) paths.add(match[1]);
  return [...paths];
}
async function exists(file:string){try{await access(file);return true;}catch{return false;}}
function command(command:string,args:string[],timeoutMs=6000):Promise<{code:number|null;stdout:string;stderr:string}> {
  return new Promise(resolve=>{
    let stdout='',stderr='';
    const child=spawn(command,args,{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>child.kill(),timeoutMs);
    child.stdout.on('data',x=>stdout+=x.toString()); child.stderr.on('data',x=>stderr+=x.toString());
    child.on('error',e=>{clearTimeout(timer);resolve({code:null,stdout,stderr:stderr||e.message});});
    child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
}
async function markItDownCheck():Promise<HealthCheck>{
  const candidates:Array<{cmd:string;prefix:string[];label:string}>=[];
  if(process.env.VIRTUAL_ENV) candidates.push({cmd:path.join(process.env.VIRTUAL_ENV,process.platform==='win32'?'Scripts/python.exe':'bin/python'),prefix:[],label:'active virtual environment'});
  if(process.env.PYTHON) candidates.push({cmd:process.env.PYTHON,prefix:[],label:'PYTHON'});
  if(process.platform==='win32') candidates.push({cmd:'py',prefix:['-3.14'],label:'Python launcher 3.14'},{cmd:'python',prefix:[],label:'python'});
  else candidates.push({cmd:'python3',prefix:[],label:'python3'},{cmd:'python',prefix:[],label:'python'});
  for(const c of candidates){
    const r=await command(c.cmd,[...c.prefix,'-c','import importlib.metadata as m; print(m.version("markitdown"))']);
    if(r.code!==0) continue;
    const version=r.stdout.trim();
    return version==='0.1.8'
      ? {name:'MarkItDown',status:'pass',detail:'Pinned version 0.1.8 is importable via '+c.label+'.'}
      : {name:'MarkItDown',status:'fail',detail:'Found version '+(version||'(unknown)')+'; requirements-markitdown.txt pins 0.1.8.'};
  }
  return {name:'MarkItDown',status:'fail',detail:'Package not importable. Activate .venv or install requirements-markitdown.txt. No conversion was attempted.'};
}
async function testReadiness():Promise<HealthCheck>{
  try{
    const [pkgText,suites]=await Promise.all([readFile(path.join(ROOT,'package.json'),'utf8'),readFile(path.join(ROOT,'scripts/test-all.ts'),'utf8')]);
    const pkg=JSON.parse(pkgText), paths=parseTestSuitePaths(suites), missing:string[]=[];
    for(const file of paths) if(!(await exists(path.join(ROOT,file)))) missing.push(file);
    if(!pkg.scripts?.['test:all']||!pkg.scripts?.typecheck) return {name:'Test readiness',status:'fail',detail:'package.json must define test:all and typecheck.'};
    if(!paths.length) return {name:'Test readiness',status:'fail',detail:'No test suites discovered in scripts/test-all.ts.'};
    if(missing.length) return {name:'Test readiness',status:'fail',detail:'Missing test files: '+missing.join(', ')};
    return {name:'Test readiness',status:'pass',detail:paths.length+' registered test suites exist; test:all and typecheck are defined.'};
  }catch(e){return {name:'Test readiness',status:'fail',detail:String(e)};}
}
export async function runLocalHealthCheck(){
  const checks:HealthCheck[]=[];
  const major=Number(process.versions.node.split('.')[0]);
  checks.push(major>=20?{name:'Node.js',status:'pass',detail:process.version+'; requires >=20.'}:{name:'Node.js',status:'fail',detail:process.version+'; install Node.js >=20.'});
  checks.push(await exists(chromium.executablePath())?{name:'Playwright Chromium',status:'pass',detail:'Playwright and its configured Chromium executable are present.'}:{name:'Playwright Chromium',status:'fail',detail:'Chromium is missing; run npm run setup:playwright.'});
  checks.push(await markItDownCheck());
  const required=['package.json','.env.example','requirements-markitdown.txt','scripts/test-all.ts'],missing:string[]=[];
  for(const f of required) if(!(await exists(path.join(ROOT,f)))) missing.push(f);
  checks.push(missing.length?{name:'Repository configuration',status:'fail',detail:'Missing: '+missing.join(', ')}:{name:'Repository configuration',status:'pass',detail:'Required package, env template, dependency manifest and test runner files exist.'});
  checks.push(await testReadiness());
  checks.push(optionalPairCheck('LLM configuration (optional)',Boolean(process.env.LLM_ENDPOINT?.trim()),Boolean(process.env.LLM_API_KEY?.trim()||process.env.OPENROUTER_API_KEY?.trim()),'LLM_ENDPOINT','LLM_API_KEY or OPENROUTER_API_KEY'));
  checks.push(optionalPairCheck('Google Sheets publishing (optional)',Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim()),Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN?.trim()),'GOOGLE_SHEETS_WEBHOOK_URL','GOOGLE_SHEETS_WEBHOOK_TOKEN'));
  const summary=summarizeHealthChecks(checks);
  console.log(JSON.stringify({schema_version:'1.0',generatedAt:new Date().toISOString(),scope:'local-only; no stock acquisition, external navigation, model inference, research writes, or Google Sheets publishing',...summary},null,2));
  return summary.status==='fail'?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  runLocalHealthCheck().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e instanceof Error?e.stack:String(e));process.exitCode=1;});
}
