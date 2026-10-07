import path from 'node:path';
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';
import { ensureDir, fileExists, writeText } from './fs.js';

async function readJson(file:string):Promise<any|null>{ try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;} }
async function walkFiles(dir:string):Promise<string[]> { const out:string[]=[]; if(!(await fileExists(dir))) return out; for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name); if(e.isDirectory()) out.push(...await walkFiles(p)); else out.push(p);} return out; }
function rel(root:string,p:string){return path.relative(root,p).replaceAll(path.sep,'/');}
function iso(v:any):string|null { const d=new Date(String(v)); return Number.isNaN(d.getTime())?null:d.toISOString(); }
function parseDateFromScanDir(name:string):string|null { const m=name.match(/(?:-|^)(\d{2})-(\d{2})-(\d{4})$/); if(!m)return null; return `${m[3]}-${m[2]}-${m[1]}`; }

export interface AnalysisEvidencePack {
  schema_version:'1.0';
  ticker:string;
  generatedAt:string;
  deterministic:true;
  llmUsed:false;
  identity:any;
  canonicalFacts:any[];
  calculatedMetrics:any[];
  financialPeriods:any;
  screening:any;
  catalysts:any;
  newsSentiment:any;
  tradingViewSymbolSnapshot:any;
  tradingViewUiSurfaces:any;
  valuation:any;
  ownership:any;
  technicals:any;
  fundamentals:any;
  reconciliation:any;
  quality:any;
  sourceHealth:any;
  marketScanQuality:any;
  sourceFreshness:any[];
  documents:any;
  visualEvidence:any;
  marketContext:any;
  files:any;
  readinessInputs:any;
}

async function latestMarketScan(projectRoot:string, ticker:string){
  const scansRoot=path.join(projectRoot,'scans');
  const families=['Fundamental','Candlestick','Range-Breakouts','Bullish','Bearish','Intraday'];
  const out:any={};
  let entries:string[]=[];
  try{entries=await readdir(scansRoot);}catch{return out;}
  for(const family of families){
    const candidates=entries.filter(x=>x.startsWith(`${family}-`) && parseDateFromScanDir(x)).sort((a,b)=>String(parseDateFromScanDir(b)).localeCompare(String(parseDateFromScanDir(a))));
    const latest=candidates[0]; if(!latest) continue;
    const root=path.join(scansRoot,latest);
    const dedupe=await readJson(path.join(root,'deduped-stocks.json'));
    const row=(Array.isArray(dedupe?.stocks)?dedupe.stocks:[]).find((r:any)=>String(r.symbol??'').toUpperCase()===ticker);
    const top20=await readJson(path.join(root,'top20.json'));
    const topHit=(Array.isArray(top20?.stocks)?top20.stocks:[]).find((r:any)=>String(r.symbol??'').toUpperCase()===ticker);
    out[family.toLowerCase()]={archiveDate:parseDateFromScanDir(latest),path:rel(projectRoot,root),membership:row??null,top20Membership:topHit??null};
  }
  return out;
}

async function buildDocumentIndex(researchDir:string, manifest:ResearchManifest){
  const markdownDir=path.join(researchDir,'markdown');
  const rawDir=path.join(researchDir,'raw');
  const mdFiles=await walkFiles(markdownDir);
  const docs=[] as any[];
  for(const file of mdFiles){
    if(!/\.md$/i.test(file) || /ALL_EVIDENCE|STRUCTURED_EVIDENCE|MDA_EVIDENCE|VISUAL_EVIDENCE|INGESTION_REPORT/i.test(path.basename(file))) continue;
    const text=await readFile(file,'utf8').catch(()=> '');
    const headings=text.split(/\r?\n/).filter(x=>/^#{1,4}\s+/.test(x)).slice(0,80).map(x=>x.replace(/^#{1,4}\s+/,'').trim());
    docs.push({path:rel(researchDir,file),bytes:Buffer.byteLength(text),headings,sourceArtifact:manifest.sourceArtifacts.find(a=>a.markdownPath===file)?.id??null});
  }
  const visual=await readJson(path.join(researchDir,'visual-evidence.json'));
  const ingestion=await readJson(path.join(markdownDir,'INGESTION_REPORT.json'));
  return {count:docs.length,documents:docs,ingestionReport:ingestion??null,visualSummary:visual??null};
}

async function buildSourceFreshness(manifest:ResearchManifest){
  return manifest.sourceArtifacts.map((a:SourceArtifact)=>({
    id:a.id, provider:a.provider, type:a.type, status:a.status, retrievedAt:a.retrievedAt, period:a.period??null,
    localPath:a.localPath??null, markdownPath:a.markdownPath??null, screenshotPath:a.screenshotPath??null,
    notes:a.notes??[]
  }));
}

async function buildMarketContext(researchDir:string, manifest:ResearchManifest){
  const projectRoot=path.resolve(researchDir,'..','..');
  const ticker=manifest.ticker.toUpperCase();
  const scans=await latestMarketScan(projectRoot,ticker);
  const five=await readJson(path.join(projectRoot,'scans','market-scan-quality.json'));
  return {scanArchives:scans,marketScanQuality:five};
}

export async function buildAnalysisEvidencePack(researchDir:string, manifest:ResearchManifest):Promise<AnalysisEvidencePack>{
  const normalized=path.join(researchDir,'normalized');
  const contract=await readJson(path.join(researchDir,'evidence-contract.json'));
  const bundle=await readJson(path.join(researchDir,'evidence-bundle.json'));
  const identity=await readJson(path.join(normalized,'identity.json'));
  const financialPeriods=await readJson(path.join(normalized,'financial-periods.json'));
  const screening=await readJson(path.join(normalized,'screening.json'));
  const catalysts=await readJson(path.join(normalized,'catalysts.json'));
  const newsSentiment=await readJson(path.join(normalized,'news-sentiment.json'));
  const tradingViewSymbolSnapshot=await readJson(path.join(researchDir,'raw','tradingview','symbol-scanner-normalized.json'));
  const tradingViewUiSurfaces=await readJson(path.join(researchDir,'raw','tradingview','ui-surfaces.json'));
  const valuation=await readJson(path.join(normalized,'valuation.json'));
  const ownership=await readJson(path.join(normalized,'ownership.json'));
  const technicals=await readJson(path.join(normalized,'technicals.json'));
  const fundamentals=await readJson(path.join(normalized,'financials.json'));
  const reconciliation=await readJson(path.join(normalized,'reconciliation.json'));
  const quality=await readJson(path.join(researchDir,'evidence-quality.json'));
  const sourceHealth=await readJson(path.join(researchDir,'source-health.json'));
  const analysisInputs=await readJson(path.join(normalized,'analysis-inputs.json'));
  const sourceFreshness=await buildSourceFreshness(manifest);
  const documents=await buildDocumentIndex(researchDir,manifest);
  const visualEvidence=await readJson(path.join(researchDir,'visual-evidence.json'));
  const marketContext=await buildMarketContext(researchDir,manifest);
  const facts=Array.isArray(contract?.sections?.FACTS)?contract.sections.FACTS:[];
  const calculatedMetrics=Array.isArray(contract?.sections?.CALCULATED_METRICS)?contract.sections.CALCULATED_METRICS:[];
  const out:AnalysisEvidencePack={
    schema_version:'1.0',ticker:manifest.ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,
    identity,
    canonicalFacts:facts,
    calculatedMetrics,
    financialPeriods,
    screening,
    catalysts,
    newsSentiment,
    tradingViewSymbolSnapshot,
    tradingViewUiSurfaces,
    valuation,
    ownership,
    technicals,
    fundamentals,
    reconciliation,
    quality,
    sourceHealth,
    marketScanQuality:marketContext.marketScanQuality,
    sourceFreshness,
    documents,
    visualEvidence,
    marketContext,
    files:{
      manifest:'manifest.json',contract:'evidence-contract.json',bundle:'evidence-bundle.json',analysisInputs:'normalized/analysis-inputs.json',
      identity:'normalized/identity.json',
      newsSentiment:'normalized/news-sentiment.json',
      tradingViewSymbolSnapshot:'raw/tradingview/symbol-scanner-normalized.json',
      tradingViewUiSurfaces:'raw/tradingview/ui-surfaces.json',market:'normalized/market.json',financials:'normalized/financials.json',financialPeriods:'normalized/financial-periods.json',ownership:'normalized/ownership.json',technicals:'normalized/technicals.json',screening:'normalized/screening.json',catalysts:'normalized/catalysts.json',canonicalValues:'normalized/canonical-values.json',reconciliation:'normalized/reconciliation.json',
      documents:'markdown/',visualEvidence:'visual-evidence.json'
    },
    readinessInputs:{manifestDataGaps:manifest.dataGaps??[],manifestWarnings:manifest.warnings??[],analysisInputsPresent:Boolean(analysisInputs),bundlePresent:Boolean(bundle)}
  };
  return out;
}

function markdownValue(v:any):string { if(v===null||v===undefined)return '—'; if(typeof v==='object') return JSON.stringify(v); return String(v); }
export async function writeAnalysisEvidencePack(researchDir:string,manifest:ResearchManifest){
  await ensureDir(path.join(researchDir,'normalized'));
  const pack=await buildAnalysisEvidencePack(researchDir,manifest);
  const jsonPath=path.join(researchDir,'normalized','analysis-evidence-pack.json');
  await writeFile(jsonPath,JSON.stringify(pack,null,2),'utf8');
  const lines=['# Analysis Evidence Pack','',`Ticker: ${pack.ticker}`,`Generated: ${pack.generatedAt}`,'','## Canonical Facts','',...pack.canonicalFacts.map(v=>`- **${v.field}**: ${markdownValue(v.value)} ${v.unit??''} — ${v.source} / ${v.sourceArtifact??'n/a'} / ${v.asOf??'n/a'}`),'','## Calculated Metrics','',...pack.calculatedMetrics.map(v=>`- **${v.field}**: ${markdownValue(v.value)} ${v.unit??''} — ${v.source} / ${v.sourceArtifact??'n/a'} / ${v.asOf??'n/a'}`),'','## Valuation','',JSON.stringify(pack.valuation,null,2),'','## Ownership','',JSON.stringify(pack.ownership,null,2),'','## Technicals','',JSON.stringify(pack.technicals,null,2),'','## Fundamentals','',JSON.stringify(pack.fundamentals,null,2),'','## Conflicts','',JSON.stringify(pack.reconciliation,null,2),'','## Screening','',JSON.stringify(pack.screening,null,2),'','## Catalysts','',JSON.stringify(pack.catalysts,null,2),'','## News & Sentiment','',JSON.stringify(pack.newsSentiment,null,2),'','## TradingView Symbol Snapshot','',JSON.stringify(pack.tradingViewSymbolSnapshot,null,2),'','## TradingView UI Surfaces','',JSON.stringify(pack.tradingViewUiSurfaces,null,2),'','## Document Index','',...pack.documents.documents.map((d:any)=>`- ${d.path} (${d.bytes} bytes)${d.headings.length?` — ${d.headings.slice(0,8).join(' | ')}`:''}`),'','## Visual Evidence','',...((pack.visualEvidence?.screenshots??[]).map((s:any)=>`- ${s.file}`)),'','## Source Freshness','',...pack.sourceFreshness.map(s=>`- ${s.provider} / ${s.id}: retrieved ${s.retrievedAt}${s.period?` / period ${s.period}`:''}`)];
  const mdPath=path.join(researchDir,'markdown','ANALYSIS_EVIDENCE_PACK.md');
  await writeText(mdPath,lines.join('\n'));
  return {jsonPath,mdPath,pack};
}

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`){
  const ticker=process.argv[2]?.toUpperCase(); if(!ticker) throw new Error('Usage: npm run evidence:pack -- ITC');
  const root=process.cwd(); const dir=path.join(root,'research',ticker); const manifest=await readJson(path.join(dir,'manifest.json')); if(!manifest) throw new Error(`Missing manifest: ${path.join(dir,'manifest.json')}`);
  const r=await writeAnalysisEvidencePack(dir,manifest); console.log(JSON.stringify({ticker,ok:true,json:r.jsonPath,markdown:r.mdPath,facts:r.pack.canonicalFacts.length,metrics:r.pack.calculatedMetrics.length,documents:r.pack.documents.count,conflicts:r.pack.reconciliation?.conflictCount??0},null,2));
}
