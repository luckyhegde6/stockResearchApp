import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { normalizeSymbolInput } from './research-config.js';

const raw = process.argv[2] || '';
const ticker = normalizeSymbolInput(raw);
if (!ticker) {
  console.error('Usage: npm run debug:show -- SYMBOL');
  process.exit(1);
}
const root = process.cwd();
const debugRoot = path.join(root, 'research', ticker, 'debug');
async function json(name:string){ try { return JSON.parse(await readFile(path.join(debugRoot,name),'utf8')); } catch { return null; } }
const [run, artifactIndex, context] = await Promise.all([
  json('acquisition-debug.json'),
  json('artifact-index.json'),
  (async()=>{try{return JSON.parse(await readFile(path.join(root,'research',ticker,'run-context.json'),'utf8'));}catch{return null;}})()
]);
const sourceDir=path.join(debugRoot,'sources');
let sourceFiles:string[]=[];
try { sourceFiles=(await (await import('node:fs/promises')).readdir(sourceDir)).filter(x=>x.endsWith('.json')).map(x=>path.join(sourceDir,x)); } catch {}
const sources:any[]=[];
for(const f of sourceFiles){ try { sources.push(JSON.parse(await readFile(f,'utf8'))); } catch {} }
console.log(JSON.stringify({
  ticker,
  rawInput: raw,
  runContext: context,
  sourceSummary: sources.sort((a,b)=>String(a.source).localeCompare(String(b.source))),
  artifactIndex: artifactIndex ? {
    runId: artifactIndex.runId,
    counts: artifactIndex.counts,
    sourcePolicy: artifactIndex.sourcePolicy,
  } : null,
  debug: run,
}, null, 2));
