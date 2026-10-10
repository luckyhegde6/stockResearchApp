import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { writeIndividualStockEvidence } from '../src/lib/individual-stock-evidence.js';
import { writeEvidenceQuality } from '../src/lib/evidence-quality.js';

const ticker = (process.argv[2] || 'ITC').toUpperCase();
const dir = path.join(process.cwd(), 'fixtures', 'research', ticker);
const manifest = JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));
await writeIndividualStockEvidence(dir, manifest);
await writeEvidenceQuality(dir, manifest);
const [evidence, quality, inputs] = await Promise.all([
  readFile(path.join(dir,'normalized','individual-stock-evidence.json'),'utf8').then(JSON.parse).catch(()=>null),
  readFile(path.join(dir,'evidence-quality.json'),'utf8').then(JSON.parse).catch(()=>null),
  readFile(path.join(dir,'normalized','analysis-inputs.json'),'utf8').then(JSON.parse).catch(()=>null),
]);
const completeness = quality?.report?.coreCompleteness ?? quality?.coreCompleteness ?? null;
const domains = {
  identity: Boolean(evidence?.identity?.symbol && evidence?.identity?.isin && evidence?.identity?.series) || Boolean(evidence?.identity?.security?.symbol),
  fundamentals: Boolean((evidence?.financials?.nsePeriods?.some((r:any)=>Object.keys(r?.metrics??{}).length>0)) || evidence?.financials?.screener?.metrics && Object.keys(evidence.financials.screener.metrics).length),
  valuation: Object.values(evidence?.valuation?.metrics ?? {}).some((v:any)=>v?.value !== null && v?.value !== undefined),
  financialPeriods: Boolean(evidence?.financialPeriods?.nse?.rows?.some((r:any)=>Object.keys(r?.metrics??{}).length>0) || evidence?.financialPeriods?.screener?.some((r:any)=>Array.isArray(r?.rows)&&r.rows.length>0)),
  ownership: Object.values(evidence?.ownership?.metrics ?? {}).some((v:any)=>v !== null && v !== undefined && v !== ''),
  catalysts: Boolean(evidence?.catalysts?.items?.length),
  technicals: ['ema50','ema200','rsi14'].every(f=>Array.isArray(evidence?.technicals?.metrics) && evidence.technicals.metrics.some((m:any)=>m?.field===f)),
};
console.log(JSON.stringify({ok:Boolean(evidence&&quality&&inputs&&Object.values(domains).every(Boolean)),ticker,domains,coreCompleteness:completeness,analysisInputsPresent:Boolean(inputs)},null,2));
if (!(evidence && quality && inputs && Object.values(domains).every(Boolean))) process.exitCode=1;
