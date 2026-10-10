import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResearchManifest } from '../types/research.js';
import { RESEARCH_CONFIG } from './research-config.js';

async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
async function exists(file:string){try{const s=await (await import('node:fs/promises')).stat(file);return s.isFile()&&s.size>0;}catch{return false;}}
function flat(v:any){return typeof v==='string'?v:JSON.stringify(v??'');}
function uniq(xs:string[]){return [...new Set(xs.filter(Boolean))];}
function statusFromBoolean(ok:boolean, opts:{missing?:boolean}={}){return ok?'present':(opts.missing?'missing':'warning') as any;}
function hasNonEmpty(v:any){ if(v==null)return false; if(typeof v==='string')return v.trim().length>0; if(Array.isArray(v))return v.length>0; if(typeof v==='object')return Object.keys(v).length>0; return true; }

interface Check{ id:string; source:string; field:string; status:'present'|'missing'|'warning'|'not_applicable'; evidence?:string; value?:unknown; note?:string; }

async function sourceChecks(dir:string,m:ResearchManifest):Promise<Check[]> {
  const q=await readJson(path.join(dir,'raw','nse-api','historical-quality.json'));
  const h=await readJson(path.join(dir,'raw','nse-api','historical-validation.json'));
  const quote=await readJson(path.join(dir,'raw','nse-api','quote-nextapi.json'));
  const annual=m.sourceArtifacts.filter(a=>a.type==='annual_report'&&/nse/i.test(a.provider)&&a.status==='ok');
  const checks:Check[]=[
    {id:'nse-quote',source:'NSE',field:'quote',status:quote?'present':'warning',evidence:quote?path.join(dir,'raw','nse-api','quote-nextapi.json'):undefined,note:'Quote may be recovered through GetQuoteApi fallback.'},
    {id:'nse-financial-results',source:'NSE',field:'financial results',status:m.sourceArtifacts.some(a=>a.id==='nse-api-financial-results'&&a.status==='ok')?'present':'missing'},
    {id:'nse-announcements',source:'NSE',field:'corporate announcements',status:m.sourceArtifacts.some(a=>a.id==='nse-api-corporate-announcements'&&a.status==='ok')?'present':'missing'},
    {id:'nse-actions',source:'NSE',field:'corporate actions',status:m.sourceArtifacts.some(a=>a.id==='nse-api-corporate-actions'&&a.status==='ok')?'present':'missing'},
    {id:'nse-history',source:'NSE',field:'3Y historical',status:h&&Number(h.coverageRatio)>=.9?'present':'warning',evidence:h?path.join(dir,'raw','nse-api','historical-validation.json'):undefined,value:h?.coverageRatio},
    {id:'nse-annual-reports',source:'NSE',field:'annual reports',status:annual.length>=1?'present':'warning',value:annual.length,note:'Advisory document evidence; structured NSE results remain primary.'},
    {id:'nse-shareholding',source:'NSE',field:'shareholding',status:m.sourceArtifacts.some(a=>a.type==='shareholding'&&/nse/i.test(a.provider)&&['ok','ok_with_fallback'].includes(a.status))?'present':'missing'},
    {id:'nse-history-quality',source:'NSE',field:'historical data quality',status:q?.qualityStatus==='ok'?'present':'warning',evidence:q?path.join(dir,'raw','nse-api','historical-quality.json'):undefined,value:q?.qualityStatus}
  ];
  return checks;
}

async function stockDomainChecks(dir:string,m:ResearchManifest):Promise<Check[]> {
  const evidence=await readJson(path.join(dir,'normalized','individual-stock-evidence.json'));
  const canonical=await readJson(path.join(dir,'normalized','canonical-values.json'));
  const financial=await readJson(path.join(dir,'normalized','financial-periods.json'));
  const valuation=await readJson(path.join(dir,'normalized','valuation.json'));
  const ownership=await readJson(path.join(dir,'normalized','ownership.json'));
  const tech=await readJson(path.join(dir,'normalized','technicals.json'));
  const screening=await readJson(path.join(dir,'normalized','screening.json'));
  const catalysts=await readJson(path.join(dir,'normalized','catalysts.json'));
  const identity=await readJson(path.join(dir,'normalized','identity.json'));
  const facts=Array.isArray(canonical?.facts)?canonical.facts:[];
  const factFields = new Set<string>(facts.filter((f:any)=>f?.value!==null&&f?.value!==undefined&&f?.value!=='').map((f:any)=>String(f.field)));
  const financialRows=Array.isArray(financial?.nse?.rows)?financial.nse.rows:[];
  const screenerPeriods=Array.isArray(financial?.screener)?financial.screener:[];
  const hasFinancialValue=financialRows.some((r:any)=>r && Object.keys(r?.metrics??{}).length>0) || screenerPeriods.some((r:any)=>Array.isArray(r?.rows)&&r.rows.length>0);
  const valuationValues=Object.entries(valuation?.metrics??{}).filter(([,v]:any)=>v?.value!==null&&v?.value!==undefined&&v?.value!=='');
  const ownershipValues=Object.entries(ownership?.metrics??{}).filter(([,v]:any)=>v!==null&&v!==undefined&&v!=='');
  const catalystItems=Array.isArray(catalysts?.items)?catalysts.items:[];
  const techMetricFields=new Set((Array.isArray(tech?.metrics)?tech.metrics:[]).map((m:any)=>m.field));
  const required = [
    {id:'stock-identity-complete',field:'instrument identity',ok:hasNonEmpty(identity?.security?.symbol)&&hasNonEmpty(identity?.security?.isin)&&hasNonEmpty(identity?.security?.series),evidence:'normalized/identity.json'},
    {id:'stock-fundamentals-complete',field:'fundamentals with actual values',ok:hasFinancialValue || ['revenue','operating_profit','profit_after_tax','eps','roce','roe','debt','sales_growth','profit_growth'].some(x=>factFields.has(x)),evidence:'normalized/financials.json'},
    {id:'stock-valuation-complete',field:'valuation with actual values',ok:valuationValues.length>0 || ['market_cap','pe_ratio','price_to_book','book_value','dividend_yield'].some(x=>factFields.has(x)),evidence:'normalized/valuation.json'},
    {id:'stock-financial-periods-complete',field:'period-aware financial tables',ok:financialRows.length>0 && hasFinancialValue || screenerPeriods.length>0,evidence:'normalized/financial-periods.json'},
    {id:'stock-ownership-complete',field:'ownership/shareholding detail',ok:ownershipValues.length>0 || [...factFields].some((x: string) => /promoter|fii|dii|public|pledge|ownership/i.test(x)),evidence:'normalized/ownership.json'},
    {id:'stock-catalysts-complete',field:'catalyst/event evidence',ok:catalystItems.length>0,evidence:'normalized/catalysts.json'},
    {id:'stock-technicals-complete',field:'technical dataset',ok:techMetricFields.has('ema50')&&techMetricFields.has('ema200')&&techMetricFields.has('rsi14'),evidence:'normalized/technicals.json'},
    {id:'stock-screening-complete',field:'screening context',ok:hasNonEmpty(screening),evidence:'normalized/screening.json'},
    {id:'stock-visual-chart-5y',field:'TradingView 5Y visual evidence',ok:await exists(path.join(dir,'screenshots','tradingview-fullchart-5y.png')),evidence:'screenshots/tradingview-fullchart-5y.png'},
    {id:'stock-visual-chart-all',field:'TradingView All visual evidence',ok:await exists(path.join(dir,'screenshots','tradingview-fullchart-all.png')),evidence:'screenshots/tradingview-fullchart-all.png'},
  ];
  return required.map(x=>({id:x.id,source:'Individual Stock',field:x.field,status:x.ok?'present':'missing',evidence:x.ok?path.join(dir,x.evidence):undefined,note:x.ok?'Deterministic canonical stock evidence is available.':'Required stock evidence domain is not populated with actual data.'}));
}

async function screenerChecks(dir:string):Promise<Check[]>{
  const d=await readJson(path.join(dir,'normalized','screener-financial-tables.json'));
  const tables=Array.isArray(d?.tables)?d.tables:[];
  const captions=tables.map((t:any)=>String(t.caption||'').toLowerCase());
  const text=flat(d).toLowerCase();
  const domains:[string,string,boolean][]=[
    ['screener-quarterly','quarterly results',captions.some(x=>/quarter|profit.?loss|p&l/i.test(x))||/quarterly results/.test(text)],
    ['screener-pl','profit & loss',captions.some(x=>/profit|p&l|loss/i.test(x))],
    ['screener-balance-sheet','balance sheet',captions.some(x=>/balance/i.test(x))],
    ['screener-cash-flow','cash flow',captions.some(x=>/cash/i.test(x))],
    ['screener-ratios','ratios / valuation',captions.some(x=>/ratio|valuation|share/i.test(x))||/P\/E|ROCE|ROE/i.test(text)],
  ];
  return domains.map(([id,field,ok])=>({id,source:'Screener',field,status:ok?'present':'warning',evidence:d?path.join(dir,'normalized','screener-financial-tables.json'):undefined}));
}

async function tijoriChecks(dir:string):Promise<Check[]>{
  const d=await readJson(path.join(dir,'normalized','tijori-context.json'));
  const t=flat(d?.text).toLowerCase();
  const checks:[string,string,RegExp[]][]=[
    ['tijori-financial-history','financial history',[/revenue|sales/i,/profit|earnings/i]],
    ['tijori-segments','segment information',[/segment/i]],
    ['tijori-ownership','ownership',[/promoter|shareholding|ownership/i]],
    ['tijori-concalls','conference calls',[/conference call|concall|earnings call/i]],
    ['tijori-ratios','key ratios',[/ratio|roce|roe|p\/e/i]],
    ['tijori-business','business context',[/business|industry|company profile/i]]
  ];
  return checks.map(([id,field,patterns])=>({id,source:'Tijori',field,status:patterns.every(p=>p.test(t))?'present':'warning',evidence:d?path.join(dir,'normalized','tijori-context.json'):undefined}));
}

async function chartinkChecks(dir:string):Promise<Check[]>{
  const root=path.join(dir,'raw','chartink');
  if(!RESEARCH_CONFIG.chartinkEnabled){
    return [
      {id:'chartink-catalog',source:'Chartink',field:'strategy catalog',status:'not_applicable',note:'Chartink is disabled for individual-stock research by RESEARCH_INCLUDE_CHARTINK=false.'},
      {id:'chartink-results',source:'Chartink',field:'strategy scan results',status:'not_applicable',note:'Market-wide Chartink scans are maintained separately under scans/.'},
      {id:'chartink-csv',source:'Chartink',field:'CSV-backed scan evidence',status:'not_applicable',note:'No Chartink stock-level acquisition requested.'}
    ];
  }
  const summary=await readJson(path.join(root,'chartink-summary.json'));
  const strategies=await readJson(path.join(root,'strategies.json'));
  return [
    {id:'chartink-catalog',source:'Chartink',field:'strategy catalog',status:summary?.strategyCount?'present':'warning',evidence:path.join(root,'chartink-summary.json'),value:summary?.strategyCount},
    {id:'chartink-results',source:'Chartink',field:'strategy scan results',status:strategies?.results?.length?'present':'warning',evidence:path.join(root,'strategies.json'),value:strategies?.results?.length??0},
    {id:'chartink-csv',source:'Chartink',field:'CSV-backed scan evidence',status:strategies?.results?.some((r:any)=>r.csvCaptured&&Number(r.csvBytes)>0)?'present':'warning',evidence:path.join(root,'csv')}
  ];
}

export async function buildEvidenceQuality(dir:string,m:ResearchManifest){
  const checks=[...(await sourceChecks(dir,m)),...(await stockDomainChecks(dir,m)),...(await screenerChecks(dir)),...(await tijoriChecks(dir)),...(await chartinkChecks(dir))];
  const summary={total:checks.length,present:checks.filter(x=>x.status==='present').length,missing:checks.filter(x=>x.status==='missing').length,warnings:checks.filter(x=>x.status==='warning').length,notApplicable:checks.filter(x=>x.status==='not_applicable').length};
  const bySource:Record<string,any>={};
  for(const c of checks){bySource[c.source]??={total:0,present:0,missing:0,warnings:0,fields:{}}; bySource[c.source].total++; bySource[c.source].fields[c.field]=c.status; if(c.status==='present')bySource[c.source].present++; if(c.status==='missing')bySource[c.source].missing++; if(c.status==='warning')bySource[c.source].warnings++;}
  const core=['stock-fundamentals-complete','stock-valuation-complete','stock-financial-periods-complete','stock-ownership-complete','stock-catalysts-complete','stock-technicals-complete'];
  const coreMissing=checks.filter(c=>core.includes(c.id)&&c.status!=='present').map(c=>c.id);
  return {schema_version:'1.2',ticker:m.ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,status:coreMissing.length===0?'ok':'partial',report:{status:coreMissing.length===0?'ok':'partial',summary,checks,bySource,coreCompleteness:{required:core,present:core.filter(id=>checks.some(c=>c.id===id&&c.status==='present')).length,missing:coreMissing.length,missingChecks:coreMissing}},rules:{zeroRowsDoNotMeanSuccess:true,warningDoesNotMeanMissing:true,noInventedValues:true,bseExcludedFromProduction:true,coreIndividualStockEvidenceRequired:core,chartinkNoResultsAreInformational:true,chartinkOptionalForIndividualResearch:!RESEARCH_CONFIG.chartinkEnabled,chartinkFeatureFlag:'RESEARCH_INCLUDE_CHARTINK'}};
}

export async function writeEvidenceQuality(dir:string,m:ResearchManifest){const out=path.join(dir,'evidence-quality.json'); const report=await buildEvidenceQuality(dir,m); await writeFile(out,JSON.stringify(report,null,2),'utf8'); return {out,report};}

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run evidence:quality -- ITC');const dir=path.join(process.cwd(),'research',ticker);const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8'));writeEvidenceQuality(dir,m).then(r=>console.log(JSON.stringify(r.report,null,2))).catch(e=>{console.error(e?.stack||e);process.exitCode=1;});}
