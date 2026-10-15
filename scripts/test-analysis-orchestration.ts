import fs from 'node:fs';
import path from 'node:path';

const idx=fs.readFileSync(path.join(process.cwd(),'src','index.ts'),'utf8');
const required = [
  "await acquire(ticker);",
  "const readiness = await ensureAnalysisPrepared(ticker);",
  "await runLlmAnalysis(skill, prompt, outputPath);",
  "process.env.LLM_BOUNDED_REASONING === '1'",
  "runBoundedReasoning({",
  "if (bounded.status !== 'complete'",
  "final investment analysis was not invoked",
  "reasoningMode: boundedReasoningEnabled",
  "boundedReasoningOutput: boundedReasoningEnabled"
];
// BSE is excluded from the production model via the source-classifier
// exclusion list, not by removing a BSE adapter array entry.
const forbiddenBse = /adapters.*\[['"]BSE['"]\]/;
const boundedCall = idx.indexOf('runBoundedReasoning({');
const readinessGate = idx.indexOf('if(!readiness.ready)');
const finalModelCall = idx.indexOf('result = await runLlmAnalysis(skill, prompt, outputPath);');
const ok = required.every(x=>idx.includes(x)) && !forbiddenBse.test(idx) && boundedCall > readinessGate && readinessGate > 0 && finalModelCall > boundedCall;
console.log(JSON.stringify({
  ok,
  acquireBeforePrepare: idx.indexOf("await acquire(ticker);") < idx.indexOf("const readiness = await ensureAnalysisPrepared(ticker);"),
  prepareBeforeLlm: idx.indexOf("const readiness = await ensureAnalysisPrepared(ticker);") < idx.indexOf("await runLlmAnalysis(skill, prompt, outputPath);"),
  boundedReasoningIsOptIn: idx.includes("process.env.LLM_BOUNDED_REASONING === '1'"),
  boundedReasoningAfterReadinessGate: boundedCall > readinessGate,
  finalModelCallAfterBoundedValidation: finalModelCall > boundedCall,
  bseProductionAdapterRemoved: !forbiddenBse.test(idx)
}, null, 2));
if(!ok) process.exitCode=1;
