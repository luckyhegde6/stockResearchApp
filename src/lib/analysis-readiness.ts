
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ResearchManifest } from '../types/research.js';
import { RESEARCH_CONFIG } from './research-config.js';

async function json(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
async function exists(file:string){try{const fs=await import('node:fs/promises');const st=await fs.stat(file);return st.isFile() && st.size>0;}catch{return false;}}

function unique(xs:string[]){ return [...new Set(xs.filter(Boolean))]; }

function isAdvisoryGap(message:string){
  return /annual.?report.*(?:could not|not.*(?:found|downloaded|available))|(?:bse|bombay stock exchange)/i.test(message);
}

export async function buildAnalysisReadiness(researchDir:string, manifest:ResearchManifest){
  const contract=await json(path.join(researchDir,'evidence-contract.json'));
  const quality=await json(path.join(researchDir,'evidence-quality.json'));
  const health=await json(path.join(researchDir,'source-health.json'));
  const requiredFiles=[
    'evidence-contract.json','source-health.json','evidence-quality.json','evidence-bundle.json',
    'markdown/STRUCTURED_EVIDENCE.md','markdown/INGESTION_REPORT.json',
    'analysis-prompt.txt','normalized/analysis-evidence-pack.json','normalized/individual-stock-evidence.json','normalized/canonical-values.json','normalized/reconciliation.json','normalized/financial-periods.json','normalized/financials.json','normalized/valuation.json','normalized/ownership.json','normalized/technicals.json','normalized/screening.json','normalized/catalysts.json','normalized/analysis-inputs.json',
    'screenshots/tradingview-1d.png','screenshots/tradingview-fullchart-5y.png','screenshots/tradingview-fullchart-all.png'
  ];
  const advisoryFiles=[
    'markdown/ALL_EVIDENCE.md',
    'markdown/MDA_EVIDENCE.md'
  ];
  const alternativeFiles=[
    {id:'nse-historical-source',files:['raw/nse-api/historical-normalized.json','raw/nse-api/historical-validation.json']},
    {id:'screener-source',files:['raw/screener/fundamental-snapshot.json','normalized/screener-financial-tables.json']},
    {id:'tijori-source',files:['raw/tijori/financial-context.json','normalized/tijori-context.json']}
  ];
  const checks=await Promise.all(requiredFiles.map(async f=>({file:f,ok:await exists(path.join(researchDir,f))})));
  const advisoryChecks=await Promise.all(advisoryFiles.map(async f=>({file:f,ok:await exists(path.join(researchDir,f))})));
  const alternatives=await Promise.all(alternativeFiles.map(async g=>({id:g.id,options:g.files,ok:await Promise.all(g.files.map(f=>exists(path.join(researchDir,f)))).then(xs=>xs.some(Boolean))})));
  const missing=checks.filter(x=>!x.ok).map(x=>x.file).concat(alternatives.filter(x=>!x.ok).map(x=>x.id));
  const missingAdvisoryFiles=advisoryChecks.filter(x=>!x.ok).map(x=>x.file);
  const missingGroups = missing.reduce((acc:Record<string,string[]>, file)=>{ const group=file.split('/')[0]; (acc[group]??=[]).push(file); return acc; },{});

  // BSE is excluded from the production stock-analysis model and must never block readiness.
  const allManifestGaps=unique(manifest.dataGaps ?? []);
  const blockingGaps=allManifestGaps.filter(g=>!isAdvisoryGap(g));
  const advisoryGaps=allManifestGaps.filter(isAdvisoryGap);

  const actionableWarnings=unique(
    Object.values(health?.sources??{})
      .flatMap((s:any)=>s?.warningDetails??[])
      .filter((m:any)=>{
        const msg=String(m);
        if (/(fallback|delegat)/i.test(msg)) return false;
        if (/NSE API (?:quote|trade-info).*?(?:403|Forbidden)/i.test(msg)) return false;
        // Conference-call fetching is supplementary evidence. If the six core stock
        // domains are otherwise complete, failed optional transcript retrieval must
        // reduce confidence but must not block the reasoning stage.
        if (/Screener concall \d+: fetch failed/i.test(msg)) return false;
        if (/Tijori .*concall.*(?:fetch failed|failed)/i.test(msg)) return false;
        if (/^TradingView .*UI surface.*(?:not fully confirmed|screenshot could not be created)/i.test(msg)) return false;
        return true;
      })
  );

  const contractCount=
    (contract?.summary?.factCount??0)+
    (contract?.summary?.calculatedMetricCount??0)+
    (contract?.summary?.sourceEvidenceCount??0);

  const qualitySummary=quality?.report?.summary??quality?.summary??{};
  const qualityStatus=quality?.report?.status??quality?.status??'missing';
  const coreCompleteness=quality?.report?.coreCompleteness??quality?.coreCompleteness??null;

  const allowPartial=/^(1|true|yes)$/i.test(process.env.ANALYSIS_ALLOW_PARTIAL??'');

  // "partial" evidence is advisory unless it is caused by missing canonical core data.
  const coreMissing=missing.length>0;
  const qualityBlocking=qualityStatus==='missing' || Number(coreCompleteness?.missing??qualitySummary.missing??0)>0;
  const ready =
    (allowPartial || !coreMissing) &&
    contractCount>0 &&
    (allowPartial || !qualityBlocking) &&
    (allowPartial || actionableWarnings.length===0) &&
    (allowPartial || blockingGaps.length===0);

  return {
    schema_version:'1.1',
    ticker:manifest.ticker,
    generatedAt:new Date().toISOString(),
    ready,
    blockingReasons:[
      ...(missing.length?['missing-required-files']:[]),
      ...(blockingGaps.length?['manifest-data-gaps']:[]),
      ...(qualityBlocking?['evidence-quality-partial']:[]),
      ...(actionableWarnings.length?['actionable-source-warnings']:[]),
      ...(contractCount===0?['empty-evidence-contract']:[])
    ],
    advisoryReasons:[...advisoryGaps, ...(missingAdvisoryFiles.length?['optional-markdown-aggregate-files-missing']:[])],
    requiredFiles:checks,
    advisoryFiles:advisoryChecks,
    alternativeRequiredFiles:alternatives,
    missingFiles:missing,
    missingFilesByGroup:missingGroups,
    missingAdvisoryFiles,
    sourcePolicy:{core:['NSE','Screener','Tijori','TradingView'],optional:['Chartink'],chartinkEnabled:RESEARCH_CONFIG.chartinkEnabled},
    allowPartial,
    contractEntries:contractCount,
    qualitySummary,
    qualityStatus,
    coreCompleteness,
    actionableWarnings,
    sourceHealthStatus:health?.overall?.status??health?.overallStatus??health?.status??null,
    deterministic:true,
    llmUsed:false
  };
}

export async function writeAnalysisReadiness(researchDir:string,manifest:ResearchManifest){
  const report=await buildAnalysisReadiness(researchDir,manifest);
  const out=path.join(researchDir,'analysis-readiness.json');
  await import('node:fs/promises').then(fs=>fs.writeFile(out,JSON.stringify(report,null,2),'utf8'));
  return {out,report};
}

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`){
  const ticker=process.argv[2]?.toUpperCase(); if(!ticker) throw new Error('Usage: npm run test:analysis-readiness -- RELIANCE');
  const dir=path.join(process.cwd(),'research',ticker); const manifest=await json(path.join(dir,'manifest.json')) as ResearchManifest; console.log(JSON.stringify(await buildAnalysisReadiness(dir,manifest),null,2));
}
