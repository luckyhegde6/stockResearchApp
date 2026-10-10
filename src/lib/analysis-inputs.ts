import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { SOURCE_PRECEDENCE } from './source-precedence.js';
import { RESEARCH_CONFIG } from './research-config.js';

async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

export async function writeAnalysisInputs(researchDir:string, manifest:any){
  const contract=await readJson(path.join(researchDir,'evidence-contract.json'));
  const evidence=await readJson(path.join(researchDir,'normalized','individual-stock-evidence.json'));
  const reconciliation=await readJson(path.join(researchDir,'normalized','reconciliation.json'));
  const quality=await readJson(path.join(researchDir,'evidence-quality.json'));
  const health=await readJson(path.join(researchDir,'source-health.json'));
  const marketScanQuality=await readJson(path.join(researchDir,'..','..','scans','market-scan-quality.json'));
  const ingestion=await readJson(path.join(researchDir,'markdown','INGESTION_REPORT.json'));
  const visualEvidence=await readJson(path.join(researchDir,'visual-evidence.json'));
  const newsSentiment=await readJson(path.join(researchDir,'normalized','news-sentiment.json'));
  const tvSnapshot=await readJson(path.join(researchDir,'raw','tradingview','symbol-scanner-normalized.json'));
  const tvUiSurfaces=await readJson(path.join(researchDir,'raw','tradingview','ui-surfaces.json'));
  const runContext=await readJson(path.join(researchDir,'run-context.json'));
  const pack={
    schema_version:'1.3', ticker:manifest.ticker, generatedAt:new Date().toISOString(), deterministic:true,llmUsed:false,
    identity:evidence?.identity??null,
    market:evidence?.market??null,
    fundamentals:evidence?.financials??null,
    financialPeriods:evidence?.financialPeriods??null,
    valuation:evidence?.valuation??null,
    ownership:evidence?.ownership??null,
    technicals:evidence?.technicals??null,
    screening:evidence?.screening??null,
    catalysts:evidence?.catalysts??null,
    newsSentiment,
    tradingViewSymbolSnapshot:tvSnapshot,
    tradingViewUiSurfaces:tvUiSurfaces,
    canonicalFacts:evidence?.canonicalValues?.facts??contract?.sections?.FACTS??[],
    calculatedMetrics:evidence?.canonicalValues?.calculatedMetrics??contract?.sections?.CALCULATED_METRICS??[],
    reconciliation:reconciliation??evidence?.reconciliation??null,
    evidenceQuality:quality,
    sourceHealth:health,
    marketScanQuality,
    documentEvidence:{ingestionReport:ingestion,visualEvidence},
    sourcePrecedence:SOURCE_PRECEDENCE,
    sourcePolicy:{core:['NSE','Screener','Tijori','TradingView'],supplementary:['News'],optional:['Chartink'],chartinkEnabled:RESEARCH_CONFIG.chartinkEnabled,excluded:['BSE']},
    runContext:runContext,
    dataGaps:manifest.dataGaps??[], warnings:manifest.warnings??[],
    completeness:{
      hasIdentity:Boolean(evidence?.identity?.security?.symbol && evidence?.identity?.security?.isin && evidence?.identity?.security?.series),
      hasMarket:Boolean(evidence?.market?.facts?.some((x:any)=>x?.value!==null&&x?.value!==undefined)),
      hasFinancialPeriods:Boolean((evidence?.financialPeriods?.nse?.rows?.some((r:any)=>Object.keys(r?.metrics??{}).length>0)) || evidence?.financialPeriods?.screener?.some((t:any)=>Array.isArray(t?.rows)&&t.rows.length>0)),
      hasValuation:Boolean(Object.values(evidence?.valuation?.metrics??{}).some((x:any)=>x?.value!==null&&x?.value!==undefined)),
      hasOwnership:Boolean(Object.values(evidence?.ownership?.metrics??{}).some((x:any)=>x!==null&&x!==undefined&&x!=='')),
      hasTechnicals:Boolean((evidence?.technicals?.metrics??[]).some((x:any)=>x?.field==='ema50') && (evidence?.technicals?.metrics??[]).some((x:any)=>x?.field==='ema200') && (evidence?.technicals?.metrics??[]).some((x:any)=>x?.field==='rsi14')),
      hasScreening:Boolean(evidence?.screening),
      hasCatalysts:Boolean(evidence?.catalysts?.items?.length),
      hasNewsSentiment:Boolean(newsSentiment?.summary?.headlineCount),
      conflicts:Number(evidence?.reconciliation?.conflictCount??0),
    },
    domainCounts:{
      canonicalFacts:Array.isArray(evidence?.canonicalValues?.facts)?evidence.canonicalValues.facts.length:0,
      calculatedMetrics:Array.isArray(evidence?.canonicalValues?.calculatedMetrics)?evidence.canonicalValues.calculatedMetrics.length:0,
      financialPeriodsNse:Array.isArray(evidence?.financialPeriods?.nse?.rows)?evidence.financialPeriods.nse.rows.length:0,
      financialPeriodsScreener:Array.isArray(evidence?.financialPeriods?.screener)?evidence.financialPeriods.screener.length:0,
      valuationValues:Object.values(evidence?.valuation?.metrics??{}).filter((x:any)=>x?.value!==null&&x?.value!==undefined).length,
      ownershipValues:Object.values(evidence?.ownership?.metrics??{}).filter((x:any)=>x!==null&&x!==undefined&&x!=='').length,
      catalystItems:Array.isArray(evidence?.catalysts?.items)?evidence.catalysts.items.length:0,
      newsHeadlines:Number(newsSentiment?.summary?.headlineCount??0),
      technicalMetrics:Array.isArray(evidence?.technicals?.metrics)?evidence.technicals.metrics.length:0,
    },
    files:{
      tradingViewUiSurfaces:'raw/tradingview/ui-surfaces.json',
      identity:'normalized/identity.json',market:'normalized/market.json',financials:'normalized/financials.json',financialPeriods:'normalized/financial-periods.json',valuation:'normalized/valuation.json',ownership:'normalized/ownership.json',technicals:'normalized/technicals.json',screening:'normalized/screening.json',catalysts:'normalized/catalysts.json',canonicalValues:'normalized/canonical-values.json',reconciliation:'normalized/reconciliation.json',individualStockEvidence:'normalized/individual-stock-evidence.json',analysisEvidencePack:'normalized/analysis-evidence-pack.json',evidenceContract:'evidence-contract.json',sourceHealth:'source-health.json',evidenceQuality:'evidence-quality.json',allEvidence:'markdown/ALL_EVIDENCE.md',structuredEvidence:'markdown/STRUCTURED_EVIDENCE.md',mdaEvidence:'markdown/MDA_EVIDENCE.md',visualEvidence:'markdown/VISUAL_EVIDENCE.md'
    },
    analysisRules:[
      'Use canonical facts and period-aware financial tables before raw text.',
      'Do not substitute a source-derived number with an inference.',
      'Use source precedence only for deterministic resolution; preserve conflicts.',
      'Technical metrics are deterministic calculations from NSE EQ historical data.',
      'TradingView screenshots are visual confirmation, not numeric truth.',
      'Chartink membership is point-in-time screening evidence, not a recommendation.',
      'NSE is the exchange-level source of record; BSE is excluded from production analysis.',
      'Missing evidence must remain explicit; never invent values.',
      'News sentiment is deterministic headline-level sentiment only; never treat it as article-body sentiment or as a recommendation.',
      'TradingView symbol snapshot values are source-derived point-in-time statistics; do not relabel them as deterministic calculations.',
      'TradingView UI surfaces are Playwright visual/audit evidence; do not infer numeric values from screenshots when structured data exists.',
    ]
  };
  const out=path.join(researchDir,'normalized','analysis-inputs.json'); await writeFile(out,JSON.stringify(pack,null,2),'utf8'); return {out,data:pack};
}
