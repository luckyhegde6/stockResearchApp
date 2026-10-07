import fs from 'node:fs';
import path from 'node:path';

const idx=fs.readFileSync(path.join(process.cwd(),'src','index.ts'),'utf8');
const required = [
  "await acquire(ticker);",
  "const readiness = await ensureAnalysisPrepared(ticker);",
  "await runLlmAnalysis(skill, prompt, outputPath);"
];
// BSE is excluded from the production model via the source-classifier
// exclusion list, not by removing a BSE adapter array entry.
const forbiddenBse = /adapters.*\[['"]BSE['"]\]/;
const ok = required.every(x=>idx.includes(x)) && !forbiddenBse.test(idx);
console.log(JSON.stringify({
  ok,
  acquireBeforePrepare: idx.indexOf("await acquire(ticker);") < idx.indexOf("const readiness = await ensureAnalysisPrepared(ticker);"),
  prepareBeforeLlm: idx.indexOf("const readiness = await ensureAnalysisPrepared(ticker);") < idx.indexOf("await runLlmAnalysis(skill, prompt, outputPath);"),
  bseProductionAdapterRemoved: !forbiddenBse.test(idx)
}, null, 2));
if(!ok) process.exitCode=1;
