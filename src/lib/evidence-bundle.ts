import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { writeText } from './fs.js';
import type { ResearchManifest } from '../types/research.js';

async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

export async function writeEvidenceBundle(researchDir:string, manifest:ResearchManifest){
  const contract=await readJson(path.join(researchDir,'evidence-contract.json'));
  const health=await readJson(path.join(researchDir,'source-health.json'));
  const quality=await readJson(path.join(researchDir,'evidence-quality.json'));
  const readiness=await readJson(path.join(researchDir,'analysis-readiness.json'));
  const analysisEvidencePack=await readJson(path.join(researchDir,'normalized','analysis-evidence-pack.json'));
  const bundle={
    schema_version:'1.1',ticker:manifest.ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,
    handoffPriority:['evidence-contract.json','source-health.json','evidence-quality.json','normalized/','markdown/'],
    manifest:{companyName:manifest.companyName,isin:manifest.isin,artifactCount:manifest.sourceArtifacts.length,dataGaps:manifest.dataGaps,warnings:manifest.warnings},
    evidenceContract:contract,
    analysisEvidencePack,
    sourceHealth:health,
    evidenceQuality:quality,
    analysisReadiness:readiness,
    canonicalFiles:{
      technicals:'raw/tradingview/technical-normalized.json',
      historicalQuality:'raw/nse-api/historical-quality.json',
      screenerFundamentals:'raw/screener/fundamental-snapshot.json',
      tijoriContext:'raw/tijori/financial-context.json',
      chartinkSummary:'raw/chartink/chartink-summary.json',
      chartinkStrategies:'raw/chartink/strategies.json',
      chartinkLong:'raw/chartink/stocks-long.json',
      chartinkShort:'raw/chartink/stocks-short.json',
      chartinkIntraday:'raw/chartink/stocks-intraday.json',
      chartinkSwing:'raw/chartink/stocks-swing.json',
      chartinkSearch:'raw/chartink/strategy-search.json',
      chartinkCsv:'raw/chartink/csv/',
      individualStockEvidence:'normalized/individual-stock-evidence.json',
      canonicalValues:'normalized/canonical-values.json',
      reconciliation:'normalized/reconciliation.json',
      analysisInputs:'normalized/analysis-inputs.json',
      analysisEvidencePack:'normalized/analysis-evidence-pack.json',
      financialPeriods:'normalized/financial-periods.json',
    },
    documents:{allEvidence:'markdown/ALL_EVIDENCE.md',structuredEvidence:'markdown/STRUCTURED_EVIDENCE.md',mdaEvidence:'markdown/MDA_EVIDENCE.md',visualEvidence:'markdown/VISUAL_EVIDENCE.md'},
    rules:['The evidence contract is the canonical index of important facts and calculated metrics.','A canonical value must retain source, artifact, method, provenance and as-of metadata when deterministically available.','Raw and Markdown files remain the detailed evidence record.','Warnings are classified as actionable, fallback/informational, or delegated.','No LLM inference is used in acquisition, normalization, validation, or bundle generation.']
  };
  const out=path.join(researchDir,'evidence-bundle.json');await writeText(out,JSON.stringify(bundle,null,2));return out;
}
async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run bundle -- RELIANCE');const dir=path.join(process.cwd(),'research',ticker);const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;const out=await writeEvidenceBundle(dir,manifest);console.log(JSON.stringify({path:out},null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
