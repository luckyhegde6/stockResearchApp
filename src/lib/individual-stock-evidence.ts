import path from 'node:path';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';
import { loadNseEquityUniverse, resolveNseSecurity } from './nse-securities.js';
import { readJson, numberValue, cleanText, findKeyDeep, type CanonicalValue } from './canonical.js';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';
import { sourcePriority } from './source-precedence.js';
import { addNseNextApiEvidence } from './nse-nextapi-evidence.js';
import { RESEARCH_CONFIG } from './research-config.js';

function exists(file: string) { return stat(file).then(s => s.isFile() && s.size > 0).catch(() => false); }
function arr(v:any): any[] { return Array.isArray(v) ? v : []; }
function text(v:any): string { return typeof v === 'string' ? v.replace(/\s+/g,' ').trim() : String(v ?? '').replace(/\s+/g,' ').trim(); }
function num(v:any): number|null { return numberValue(v); }
function uniq<T>(xs:T[]):T[]{ return [...new Set(xs)]; }
function slug(s:string){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function normalizeSymbol(v:any): string|null { const s=text(v).toUpperCase(); return s || null; }

function parseDate(v:any): string|null {
  const s=text(v); if(!s) return null;
  let m=s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{4})/i);
  if(m){ const d=new Date(`${m[2]} ${m[1]}, ${m[3]}`); if(!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10); }
  m=s.match(/^(\d{1,2})[-\/]([0-9]{1,2})[-\/](\d{4})/);
  if(m){ const d=new Date(Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]))); if(!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10); }
  const d=new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

function artifact(manifest:ResearchManifest, ids:string[], predicate?:(a:SourceArtifact)=>boolean){
  return manifest.sourceArtifacts.find(a=>ids.includes(a.id)) ?? manifest.sourceArtifacts.find(a=>predicate?.(a) ?? false);
}

function sourceFact(id:string, field:string, value:any, source:string, a:SourceArtifact|undefined, period?:string|null, unit?:string|null, note?:string):CanonicalValue{
  return { id, evidenceRole:'source_fact', field, value, unit:unit??null, period:period??null, source, sourceArtifact:a?.id, method:'source_extraction', verified:true, asOf:a?.retrievedAt??null, evidencePath:a?.localPath??null, sourceUrl:a?.url??null, confidence:'high', note };
}

function syntheticMasterArtifact(researchDir:string):SourceArtifact {
  return { id:'nse-equity-universe', type:'derived_data', provider:'NSE Securities Master', title:'Official NSE Equity Securities Master', url:'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', localPath:path.join(researchDir,'..','..','data','nse-equity-universe.json'), retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:['Official NSE EQUITY_L-derived security master.'] };
}
function calc(id:string, field:string, value:any, source:string, a:SourceArtifact|undefined, asOf:string|null, unit:string|null, note?:string):CanonicalValue{
  return { id, evidenceRole:'calculated_metric', field, value, unit, source, sourceArtifact:a?.id, method:'deterministic_calculation', verified:true, asOf, evidencePath:a?.localPath??null, sourceUrl:a?.url??null, confidence:'high', note };
}

function pickKey(obj:any, keys:string[]):any {
  return findKeyDeep(obj, keys);
}

function findNumberInObject(obj:any, keys:string[]):number|null {
  const v=pickKey(obj,keys); return num(v);
}

function recursiveObjects(root:any, limit=500):any[]{
  const out:any[]=[]; const seen=new Set<any>();
  const walk=(v:any)=>{
    if(out.length>=limit || v==null || typeof v!=='object' || seen.has(v)) return;
    seen.add(v); out.push(v);
    if(Array.isArray(v)) for(const x of v) walk(x); else for(const x of Object.values(v)) walk(x);
  };
  walk(root); return out;
}

function recursiveArrays(root:any, limit=2000):any[][]{
  const out:any[][]=[]; const seen=new Set<any>();
  const walk=(v:any)=>{
    if(out.length>=limit || v==null || typeof v!=='object' || seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)) out.push(v);
    if(Array.isArray(v)) for(const x of v) walk(x); else for(const x of Object.values(v)) walk(x);
  };
  walk(root); return out;
}

function flattenRecords(root:any):any[]{
  const out:any[]=[];
  for(const a of recursiveArrays(root,4000)){
    for(const item of a){ if(item && typeof item==='object' && !Array.isArray(item)) out.push(item); }
  }
  return out;
}

function firstNumericNearText(raw:string, labels:RegExp[]):number|null{
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(!labels.some(re=>re.test(lines[i]))) continue;
    const window=lines.slice(i,Math.min(lines.length,i+3)).join(' | ');
    const m=window.match(/(-?\d[\d,]*(?:\.\d+)?)(?:\s*%|\s*(?:Cr|crore|lac|lakh))?/i);
    if(m){ const n=num(m[1]); if(n!==null) return n; }
  }
  return null;
}

function findScalarBySemanticKeys(root:any, keyPatterns:RegExp[]):number|null{
  for(const obj of recursiveObjects(root,4000)){
    if(Array.isArray(obj)) continue;
    for(const [k,v] of Object.entries(obj)){
      if(keyPatterns.some(re=>re.test(k))){ const n=num(v); if(n!==null) return n; }
    }
  }
  return null;
}

function rowLabel(row:any[]):string { return text(row?.[0] ?? row?.[1] ?? ''); }
function headerPeriods(headers:string[], row:any[]):string[]{
  const vals=[...headers,...(Array.isArray(row)?row.slice(0,Math.min(row.length,headers.length+2)).map(text):[])];
  return vals.filter(v=>/^(Mar|Jun|Sep|Dec)\s+\d{4}|FY\s*\d{4}|Q[1-4]\s*FY?\s*\d{2,4}|[12]\d{3}$|TTM|Dec \d{4}/i.test(v));
}

function normalizeScreenerTables(snapshot:any, artifactRef:SourceArtifact|undefined){
  const tables=arr(snapshot?.tables);
  if(!tables.length && Array.isArray(snapshot?.financialTables)) snapshot.tables=snapshot.financialTables;
  const normalized:any[]=[]; const periods:any[]=[]; const scalarMap:any={};
  for(const table of tables){
    const caption=text(table?.caption); const headers=arr(table?.headers).map(text); const rows=arr(table?.rows).map((r:any)=>arr(r).map(text));
    if(!caption && !headers.length && !rows.length) continue;
    const periodHeaders=headerPeriods(headers, rows[0] ?? []);
    const tableOut={caption,headers,rows,rowCount:rows.length,periodHeaders};
    normalized.push(tableOut);
    if(periodHeaders.length) periods.push({caption,headers,rows,periods:periodHeaders,source:'Screener',sourceArtifact:artifactRef?.id,asOf:snapshot?.capturedAt??artifactRef?.retrievedAt??null});
    for(const row of rows){
      const label=rowLabel(row).toLowerCase(); if(!label) continue;
      const values=row.slice(1).map(num);
      const firstNum=values.find(v=>v!==null);
      if(firstNum!==undefined) scalarMap[label]=firstNum;
    }
  }
  return {normalized,periods,scalarMap};
}

function screenerMetric(snapshot:any, labels:string[]):{value:number|string|null,period:string|null,sourceRow:any[]|null}{
  const tables=arr(snapshot?.tables);
  if(!tables.length && Array.isArray(snapshot?.financialTables)) snapshot.tables=snapshot.financialTables;
  const wanted=labels.map(slug);
  for(const t of tables){
    const headers=arr(t?.headers).map(text); const rows=arr(t?.rows);
    for(const r of rows){
      const cells=arr(r).map(text); const label=slug(cells[0] ?? cells[1] ?? '');
      if(wanted.some(w=>label===w || label.includes(w))){
        for(let i=1;i<cells.length;i++){ const n=num(cells[i]); if(n!==null) return {value:n,period:headers[i]?text(headers[i]):null,sourceRow:cells}; }
        const raw=cells.slice(1).find(Boolean); if(raw) return {value:raw,period:null,sourceRow:cells};
      }
    }
    if(headers.length && rows[0]){
      for(const w of wanted){ const idx=headers.findIndex((h:string)=>slug(h).includes(w)); if(idx>=0){ const v=text(rows[0][idx]); const n=num(v); return {value:n??(v||null),period:headers[idx]??null,sourceRow:rows[0].map(text)}; } }
    }
  }
  const raw=text(snapshot?.text);
  for(const l of labels){
    const re=new RegExp(`${l.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*[:\\-]?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`,'i');
    const m=re.exec(raw); if(m) return {value:num(m[1]),period:null,sourceRow:null};
  }
  return {value:null,period:null,sourceRow:null};
}

async function extractScreener(researchDir:string, manifest:ResearchManifest, facts:CanonicalValue[], valuation:any, fundamentals:any){
  const a=artifact(manifest,['screener-fundamental-snapshot','screener-company']);
  const snap=a?.localPath?await readJson(a.localPath):null;
  if(!snap) return;
  const primarySnap = snap.tables ? snap : (snap?.text || snap?.links || snap?.url ? { ...snap, tables: snap.tables ?? [] } : snap);
  const normalized=normalizeScreenerTables(primarySnap,a);
  fundamentals.tables=normalized.normalized;
  fundamentals.periodTables=normalized.periods;
  fundamentals.snapshotCapturedAt=primarySnap.capturedAt??a?.retrievedAt??null;
  const definitions:Array<[string,string[],string,string]>=[
    ['market_cap',['Market Cap','Market capitalization','Mkt Cap'],'INR crore','valuation'],
    ['pe_ratio',['Stock P/E','P/E','PE','Price to Earnings'],'x','valuation'],
    ['price_to_book',['Price to Book','P/B','P/B Ratio'],'x','valuation'],
    ['book_value',['Book Value','Book Value Per Share'],'INR/share','valuation'],
    ['dividend_yield',['Dividend Yield','Dividend'],'%','valuation'],
    ['roce',['ROCE','Return on Capital Employed'],'%','fundamental'],
    ['roe',['ROE','Return on Equity'],'%','fundamental'],
    ['debt',['Debt','Total Debt'],'INR crore','fundamental'],
    ['sales_growth',['Sales Growth','Sales Growth %'],'%','growth'],
    ['profit_growth',['Profit Growth','Profit Growth %'],'%','growth'],
    ['current_price',['Current Price','CMP'],'price','market'],
  ];
  for(const [field,labels,unit,domain] of definitions){
    const r=screenerMetric(primarySnap,labels); if(r.value===null) continue;
    const fact=sourceFact(`screener-${field}`,field,r.value,'Screener',a,r.period,unit==='price'?'price':unit);
    facts.push(fact);
    if(domain==='valuation') valuation[field]={value:r.value,unit,period:r.period,source:'Screener',artifact:a?.id};
    if(domain==='fundamental'||domain==='growth') fundamentals.metrics[field]={value:r.value,unit,period:r.period,source:'Screener',artifact:a?.id};
  }
  // Text fallback for common Screener header cards that are not represented as table rows.
  const rawText=String(primarySnap?.text ?? '');
  const textFallbacks:Array<[string,string[],string,string]>=[
    ['market_cap',['Market Cap','Market capitalization'],'INR crore','valuation'],
    ['pe_ratio',['Stock P/E','P/E'],'x','valuation'],
    ['book_value',['Book Value'],'INR/share','valuation'],
    ['dividend_yield',['Dividend Yield'],'%','valuation'],
    ['roce',['ROCE'],'%','fundamental'],
    ['roe',['ROE'],'%','fundamental'],
    ['debt',['Debt'],'INR crore','fundamental'],
  ];
  for(const [field,labels,unit,domain] of textFallbacks){
    if(facts.some(f=>f.field===field && f.source==='Screener')) continue;
    const r=screenerMetric({text:rawText,tables:[]},labels);
    if(r.value!==null){
      const fact=sourceFact(`screener-${field}`,field,r.value,'Screener',a,r.period,unit==='price'?'price':unit,'Extracted from captured Screener page text.'); facts.push(fact);
      if(domain==='valuation') valuation[field]={value:r.value,unit,period:r.period,source:'Screener',artifact:a?.id};
      if(domain==='fundamental') fundamentals.metrics[field]={value:r.value,unit,period:r.period,source:'Screener',artifact:a?.id};
    }
  }
  const company=cleanText(pickKey(primarySnap,['companyName','company_name','name'])) ?? text(primarySnap?.text).split('\n').find((x:string)=>x.trim() && !/screener/i.test(x)) ?? null;
  if(company) facts.push(sourceFact('screener-company-name','company_name',company,'Screener',a,null,null));
  fundamentals.companyName=company;
}

async function extractNseFinancialPeriods(researchDir:string, manifest:ResearchManifest, facts:CanonicalValue[]){
  const a=artifact(manifest,['nse-api-financial-results']);
  const data=a?.localPath?await readJson(a.localPath):null;
  const rows=arr(data?.resCmpData);
  const periodRows:any[]=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    const period=text(pickKey(row,['period','Period','quarter','Quarter','date','Date','timestamp','mTIMESTAMP'])) || `row_${i+1}`;
    const normalized:any={period,raw:row,metrics:{}};
    const keys:Array<[string,string[],string]>=[
      ['revenue',['revenue','sales','totalIncome','income'],'INR'],
      ['operating_profit',['operatingProfit','operatingIncome'],'INR'],
      ['profit_after_tax',['profitAfterTax','netProfit','profit','PAT'],'INR'],
      ['eps',['eps','earningsPerShare'],'INR/share'],
      ['ebitda',['ebitda'],'INR'],
    ];
    for(const [field,k,u] of keys){ const v=findNumberInObject(row,k) ?? findScalarBySemanticKeys(row, k.map(x=>new RegExp(x,'i'))); if(v!==null){normalized.metrics[field]=v; facts.push(sourceFact(`nse-fin-${field}-${i+1}`,field,v,'NSE',a,period,u));} }
    periodRows.push(normalized);
  }
  return {sourceArtifact:a?.id??null,asOf:a?.retrievedAt??null,rows:periodRows};
}

function flattenKeyMetrics(root:any, patterns:Record<string,RegExp[]>):Record<string,number|string|null>{
  const out:Record<string,number|string|null>={};
  for(const obj of recursiveObjects(root,1000)){
    if(Array.isArray(obj)) continue;
    for(const [field,res] of Object.entries(patterns)){
      if(out[field]!==undefined && out[field]!==null) continue;
      for(const [k,v] of Object.entries(obj)){
        if(res.some(re=>re.test(k))){ const n=num(v); if(n!==null){out[field]=n;break;} const s=text(v); if(s) {out[field]=s;break;} }
      }
    }
  }
  return out;
}

async function extractOwnership(researchDir:string, manifest:ResearchManifest, facts:CanonicalValue[]){
  const a=artifact(manifest,['nse-nextapi-shareholding-pattern'],x=>x.type==='shareholding' && /nse/i.test(x.provider) && ['ok','ok_with_fallback','partial'].includes(x.status));
  const data=a?.localPath?await readJson(a.localPath):null;
  if(!data) return {available:false,sourceArtifact:null,asOf:null,metrics:{},raw:null};

  const metrics:Record<string,number|null>={};
  const semantic:Record<string,RegExp[]>={
    promoter_holding:[/promoter.*holding/i,/promoter.*percentage/i,/promoter.*%/i,/promoterAndPromoterGroup/i],
    fii_holding:[/fii.*holding/i,/fii.*percentage/i,/foreign.*institutional.*holding/i,/foreign.*%/i],
    dii_holding:[/dii.*holding/i,/dii.*percentage/i,/domestic.*institutional.*holding/i],
    public_holding:[/public.*holding/i,/public.*percentage/i,/non.*promoter.*holding/i],
    promoter_pledge:[/pledge/i,/encumber/i],
    total_shares:[/total.*shares/i,/number.*shares/i,/totalShare/i]
  };
  for(const [field,patterns] of Object.entries(semantic)) metrics[field]=findScalarBySemanticKeys(data,patterns);

  // Some NSE shareholding payloads encode category names as values and percentages beside them.
  const records=flattenRecords(data);
  for(const rec of records){
    const s=JSON.stringify(rec);
    for(const [field,patterns] of Object.entries(semantic)){
      if(metrics[field]!==null) continue;
      if(!patterns.some(re=>re.test(s))) continue;
      const pctKey=Object.keys(rec).find(k=>/(percentage|percent|holding|shareholding|share.*%)|%/i.test(k));
      if(pctKey){ const n=num(rec[pctKey]); if(n!==null){metrics[field]=n;continue;} }
      const n=findScalarBySemanticKeys(rec,[/value|percentage|percent|holding|shareholding|shares/i]);
      if(n!==null) metrics[field]=n;
    }
  }

  // Last resort: deterministic line-neighbour extraction from captured JSON text.
  const rawText=text(JSON.stringify(data));
  const linePatterns:Record<string,RegExp[]>={
    promoter_holding:[/promoter(?: and promoter group)?/i],
    fii_holding:[/fii|foreign institutional investor/i],
    dii_holding:[/dii|domestic institutional investor/i],
    public_holding:[/public(?: shareholders| holding)?/i],
    promoter_pledge:[/pledge|encumber/i]
  };
  for(const [field,patterns] of Object.entries(linePatterns)) if(metrics[field]===null) metrics[field]=firstNumericNearText(rawText,patterns);

  for(const [field,value] of Object.entries(metrics)) if(value!==null && value!==undefined) facts.push(sourceFact(`nse-shareholding-${field}`,field,value,'NSE',a,null,field.includes('holding')||field.includes('pledge')?'%':'shares'));
  const populated=Object.values(metrics).some(v=>v!==null);
  return {available:true,sourceArtifact:a?.id??null,asOf:a?.retrievedAt??null,metrics,raw:data,populated};
}

async function extractTijori(researchDir:string, manifest:ResearchManifest, facts:CanonicalValue[], fundamentals:any, valuation:any){
  const a=artifact(manifest,['tijori-financial-context']); const d=a?.localPath?await readJson(a.localPath):null; if(!d) return {available:false,text:''};
  const raw=text(d.text); fundamentals.tijoriText=raw; fundamentals.tijoriCapturedAt=d.capturedAt??a?.retrievedAt??null;
  const defs:Array<[string,RegExp[],string]>=[
    ['pe_ratio',[/P\/?E/i,/PE ratio/i],'x'],['market_cap',[/market cap/i,/market capitalization/i],'INR crore'],['roe',[/ROE/i],'%'],['roce',[/ROCE/i],'%'],['sales_growth',[/sales growth/i],'%'],['profit_growth',[/profit growth/i],'%']
  ];
  for(const [field,patterns,unit] of defs){
    let value:null|number=null;
    for(const p of patterns){ const m=p.exec(raw); if(m){ const tail=raw.slice((m.index??0)+m[0].length, (m.index??0)+m[0].length+100); const n=/(-?\d[\d,]*(?:\.\d+)?)/.exec(tail); if(n){value=num(n[1]);break;} } }
    if(value!==null){ facts.push(sourceFact(`tijori-${field}`,field,value,'Tijori',a,null,unit)); if(['pe_ratio','market_cap'].includes(field)) valuation[`tijori_${field}`]={value,unit,source:'Tijori',artifact:a?.id}; }
  }
  fundamentals.tijoriAvailable=true; return {available:true,text:raw};
}

async function loadLatestMarketSignals(ticker:string, projectRoot:string){
  const out:any={};
  const scanRoot=path.join(projectRoot,'scans');
  try{
    const dirs=(await readdir(scanRoot,{withFileTypes:true})).filter(e=>e.isDirectory());
    const dateKey=(n:string)=>{const m=n.match(/(\d{2})-(\d{2})-(\d{4})$/);return m?Number(`${m[3]}${m[2]}${m[1]}`):0;};
    for(const type of ['Fundamental','Candlestick','Range-Breakouts','Bullish','Bearish','Intraday']){
      const candidates=dirs.filter(e=>e.name.startsWith(`${type}-`)).map(e=>e.name).sort((a,b)=>dateKey(b)-dateKey(a));
      const d=candidates[0]; if(!d) continue;
      const files=await collectJsonFiles(path.join(scanRoot,d));
      const hits:string[]=[];
      for(const f of files){ const j=await readJson(f); const s=JSON.stringify(j??''); if(new RegExp(`"symbol"\\s*:\\s*"${ticker}"`,'i').test(s) || new RegExp(`\\b${ticker}\\b`,'i').test(s) && /stocks|symbols|results/i.test(s)) hits.push(path.relative(projectRoot,f).replaceAll(path.sep,'/')); }
      out[type]={archive:d,hits:uniq(hits).slice(0,20),present:hits.length>0};
    }
  }catch{}
  return out;
}

async function collectJsonFiles(dir:string):Promise<string[]>{
  const out:string[]=[]; if(!(await exists(dir))) return out; 
  for(const e of await readdir(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) out.push(...await collectJsonFiles(p)); else if(/\.json$/i.test(e.name)) out.push(p); }
  return out;
}

async function latest52WeekHigh(ticker:string, projectRoot:string){
  try{
    const roots=(await readdir(path.join(projectRoot,'scans'),{withFileTypes:true})).filter(e=>e.isDirectory()&&e.name.startsWith('52-Week-High-')).map(e=>e.name).sort().reverse();
    for(const d of roots){ const candidates=[path.join(projectRoot,'scans',d,'52-week-high','52-week-high.normalized.json'),path.join(projectRoot,'scans',d,'52-week-high.normalized.json')]; for(const p of candidates){const j=await readJson(p); if(!j) continue; const row=arr(j.rows).find((r:any)=>normalizeSymbol(r.symbol)===ticker); if(row) return {archive:d,path:p,row,sourceAsOf:j.timestamp??j.freshness?.sourceAsOf??null,retrievedAt:j.retrievedAt??j.freshness?.retrievedAt??null};}}
  }catch{}
  return null;
}

async function chartinkMembership(ticker:string, researchDir:string){
  return await readJson(path.join(researchDir,'raw','chartink','membership.json'));
}

function latestTechnicalMetrics(tech:any, technicalArtifact:SourceArtifact|undefined){
  const latest=tech?.latest; if(!latest) return {metrics:[],latest:null};
  const metrics:CanonicalValue[]=[]; for(const [field,value,unit] of [['close',latest.close,'price'],['ema50',latest.ema50,'price'],['ema200',latest.ema200,'price'],['rsi14',latest.rsi14,'index'],['volume',latest.volume,'shares']] as const){ if(value!==null&&value!==undefined) metrics.push(calc(`technical-${field}`,field,value,'NSE',technicalArtifact,latest.date,unit,'Deterministically calculated from acquired NSE EQ historical OHLCV.')); }
  return {metrics,latest};
}

async function normalizeNextAnnouncements(raw:any){ const data=raw; return (Array.isArray(data)?data:Array.isArray(data?.data)?data.data:[]).map((r:any)=>({type:'announcement',date:parseDate(r?.an_dt??r?.sort_date??r?.dt),title:text(r?.desc??r?.subject??r?.attchmntText),raw:r})).filter((x:any)=>x.title||x.date); }
function normalizeNextBoardMeetings(raw:any){ return (Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[]).map((r:any)=>({type:'board_meeting',date:parseDate(r?.bm_date??r?.bm_dt),title:text(r?.bm_desc??r?.bm_purpose??r?.bm_desc),raw:r})).filter((x:any)=>x.title||x.date); }
function normalizeNextActions(raw:any){ return (Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[]).map((r:any)=>({type:'corporate_action',date:parseDate(r?.exDate??r?.recDate??r?.date),title:text(r?.subject??r?.purpose),raw:r})).filter((x:any)=>x.title||x.date); }
function normalizeNextCalendar(raw:any){ return (Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:[]).map((r:any)=>({type:'corporate_event',date:parseDate(r?.date??r?.eventDate??r?.event_date),title:text(r?.event??r?.title??r?.purpose??r?.description),raw:r})).filter((x:any)=>x.title||x.date); }

export async function buildIndividualStockEvidence(researchDir:string, manifest:ResearchManifest){
  const projectRoot=path.resolve(researchDir,'..','..');
  const universe=await loadNseEquityUniverse(projectRoot); const resolved=resolveNseSecurity(manifest.ticker,universe); const security=resolved.record;
  const facts:CanonicalValue[]=[]; const metrics:CanonicalValue[]=[];
  const fundamentals:any={metrics:{},tables:[],periodTables:[],nsePeriods:[],tijoriAvailable:false}; const valuation:any={};
  if(security){
    const masterPath=path.join(projectRoot,'data','nse-equity-universe.json'); const masterUrl='https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
    const masterArtifact=syntheticMasterArtifact(researchDir);
    facts.push(sourceFact('identity-symbol','symbol',security.symbol,'NSE Securities Master',masterArtifact,null,null));
    facts.push(sourceFact('identity-company','company_name',security.companyName,'NSE Securities Master',masterArtifact,null,null));
    facts.push(sourceFact('identity-isin','isin',security.isin,'NSE Securities Master',masterArtifact,null,null));
    facts.push(sourceFact('identity-series','series',security.series,'NSE Securities Master',masterArtifact,null,null));
    if(security.dateOfListing) facts.push(sourceFact('identity-listing-date','listing_date',security.dateOfListing,'NSE Securities Master',masterArtifact,null,'date')); 
  }

  const quoteArtifact=artifact(manifest,['nse-api-symbol-data','nse-api-quote-nextapi-fallback','nse-api-quote-live-market-nextapi-fallback','nse-api-quote']);
  const quoteNormalized=await readJson(path.join(researchDir,'raw','nse-api','quote-normalized.json'));
  const quote=quoteNormalized ?? (quoteArtifact?.localPath?await readJson(quoteArtifact.localPath):null);
  const qObj=quoteNormalized ?? recursiveObjects(quote,400).find(o=>!Array.isArray(o)&&normalizeSymbol(o.symbol??o.tradingSymbol)===manifest.ticker) ?? recursiveObjects(quote,200).find(o=>!Array.isArray(o)&&(['lastPrice','ltp','previousClose','prevClose'].some(k=>o[k]!==undefined)));
  const qFields:Array<[string,string[],string]>= [['last_price',['lastPrice','ltp','lastTradedPrice','last','closePrice','value'],'price'],['previous_close',['previousClose','prevClose','basePrice','preClose'],'price'],['open',['open','openPrice'],'price'],['day_high',['dayHigh','high','dayHighPrice'],'price'],['day_low',['dayLow','low','dayLowPrice'],'price'],['average_price',['averagePrice','vwap'],'price'],['percent_change',['pChange','percentChange'],'%'],['volume',['totalTradedVolume','tradedQuantity','quantity','volume'],'shares'],['turnover',['totalTradedValue','turnover'],'INR'],['market_cap',['totalMarketCap','marketCap'],'INR'],['52_week_high',['yearHigh','week52High','high52'],'price'],['52_week_low',['yearLow','week52Low','low52'],'price'],['delivery_percent',['deliveryPercent','deliveryToTradedQuantity'],'%']];
  for(const [field,keys,unit] of qFields){ const value=findNumberInObject(qObj,keys); if(value!==null) facts.push(sourceFact(`nse-${field}`,field,value,'NSE India API',quoteArtifact,null,unit,quoteArtifact?.status==='ok_with_fallback'?'Recovered through canonical NSE NextApi GetQuoteApi.': 'Canonical NSE NextApi source.')); }

  const symbolMetaArtifact=artifact(manifest,['nse-api-symbol-metadata']);
  const symbolMeta=await readJson(path.join(researchDir,'raw','nse-api','symbol-metadata-normalized.json'));
  const symbolNameArtifact=artifact(manifest,['nse-api-symbol-name']);
  const symbolName=await readJson(path.join(researchDir,'raw','nse-api','symbol-name-normalized.json'));
  if(symbolMeta){
    for(const [field,value] of [['active_series',symbolMeta.activeSeries],['market_type',symbolMeta.marketType],['parent_symbol',symbolMeta.parentSymbol],['is_fno_security',symbolMeta.isFNOSec],['is_slb_security',symbolMeta.isSLBSec],['is_suspended',symbolMeta.isSuspended],['is_etf_security',symbolMeta.isETFSec],['is_delisted',symbolMeta.isDelisted]] as const){ if(value!==null&&value!==undefined&&!(Array.isArray(value)&&!value.length)) facts.push(sourceFact(`nse-metadata-${field}`,field,value,'NSE India API',symbolMetaArtifact,null,Array.isArray(value)?'list':null)); }
  }
  if(symbolName?.companyName){ facts.push(sourceFact('nse-symbol-name-company','company_name',symbolName.companyName,'NSE India API',symbolNameArtifact,null,null)); }
  if(quoteNormalized){
    for(const [field,value,unit] of [['sector','sector','text'],['macro','macro','text'],['industry','industry','text'],['basicIndustry','basic_industry','text'],['index','primary_index','text'],['indexList','index_membership','list']] as const){ const v=(quoteNormalized as any)[field]; if(v!==null&&v!==undefined&&!(Array.isArray(v)&&!v.length)) facts.push(sourceFact(`nse-secinfo-${field}`,value as string,v,'NSE India API',quoteArtifact,null,unit==='text'?null:'list')); }
  }

  await addNseNextApiEvidence(researchDir, manifest, facts);

  // Promote canonical NextApi financial periods into the period-aware financial package.
  const nextFinancialStatus=await readJson(path.join(researchDir,'raw','nse-api','nextapi','financials','financial-status.json'));
  const nextFinancialResult=await readJson(path.join(researchDir,'raw','nse-api','nextapi','financials','financial-result-data.json'));
  const nextStatusRows=Array.isArray(nextFinancialStatus)?nextFinancialStatus:[];
  const nextResultRows=Array.isArray(nextFinancialResult)?nextFinancialResult:[];
  fundamentals.nextApiFinancialStatusRows=nextStatusRows;
  fundamentals.nextApiFinancialResultRows=nextResultRows;
  if(nextStatusRows.length) fundamentals.periodTables.push({caption:'NSE NextApi Financial Status',headers:['Period','Total Income','PBT','PAT','EPS'],rows:nextStatusRows.map((r:any)=>[r?.to_date_MonYr??r?.to_date,r?.totalIncome,r?.reProLossBefTax,r?.netProLossAftTax,r?.eps].map(text)),periods:nextStatusRows.map((r:any)=>r?.to_date_MonYr??r?.to_date).filter(Boolean),source:'NSE India API',sourceArtifact:'nse-nextapi-financial-status',asOf:artifact(manifest,'nse-nextapi-financial-status')?.retrievedAt??null});

  if(quoteNormalized?.pdSymbolPe!==null && quoteNormalized?.pdSymbolPe!==undefined) valuation.pe_ratio={value:quoteNormalized.pdSymbolPe,unit:'x',period:null,source:'NSE India API',artifact:quoteArtifact?.id??'nse-api-symbol-data'};
  if(quoteNormalized?.totalMarketCap!==null && quoteNormalized?.totalMarketCap!==undefined && !valuation.market_cap) valuation.market_cap={value:quoteNormalized.totalMarketCap,unit:'INR',period:null,source:'NSE India API',artifact:quoteArtifact?.id??'nse-api-symbol-data'};

  const yearwiseArtifact=artifact(manifest,['nse-api-yearwise']);
  const yearwise=await readJson(path.join(researchDir,'raw','nse-api','yearwise-normalized.json'));
  const yearwiseRows=arr(yearwise);
  for(const row of yearwiseRows){
    if(row?.stockChangePct!==null&&row?.stockChangePct!==undefined) facts.push(sourceFact(`nse-yearwise-stock-${row.period}`,`return_${row.period}`,row.stockChangePct,'NSE India API',yearwiseArtifact,row.period,'%'));
    if(row?.indexChangePct!==null&&row?.indexChangePct!==undefined) facts.push(sourceFact(`nse-yearwise-index-${row.period}`,`benchmark_return_${row.period}`,row.indexChangePct,'NSE India API',yearwiseArtifact,row.period,'%')); 
  }

  const chartArtifact=artifact(manifest,['nse-api-symbol-chart-1d']);
  const chart1d=await readJson(path.join(researchDir,'raw','nse-api','symbol-chart-1d-normalized.json'));

  const nsePeriods=await extractNseFinancialPeriods(researchDir,manifest,facts); fundamentals.nsePeriods=nsePeriods.rows; fundamentals.nseFinancialAsOf=nsePeriods.asOf;
  await extractScreener(researchDir,manifest,facts,valuation,fundamentals);
  await extractTijori(researchDir,manifest,facts,fundamentals,valuation);

  const technicalArtifact=artifact(manifest,['tradingview-technical-normalized']);
  const techPath=path.join(researchDir,'raw','tradingview','technical-normalized.json'); const tech=await readJson(techPath);
  const t=latestTechnicalMetrics(tech,technicalArtifact); metrics.push(...t.metrics);
  const latest52=await latest52WeekHigh(manifest.ticker,projectRoot);
  if(latest52){ facts.push(sourceFact('nse-52wh-membership','52_week_high_membership',true,'NSE India API',undefined, null,'boolean','Target appears in the latest stored NSE 52-week-high dataset.')); if(latest52.row?.new52WHL!==undefined) facts.push(sourceFact('nse-52wh-price','52_week_high_price',num(latest52.row.new52WHL),'NSE India API',undefined,null,'price')); }

  const ownership=await extractOwnership(researchDir,manifest,facts);
  const screening:any={
    chartink: RESEARCH_CONFIG.chartinkEnabled
      ? await chartinkMembership(manifest.ticker,researchDir)
      : { enabled:false, reason:'RESEARCH_INCLUDE_CHARTINK=false', strategies:[], marketScanContext: await loadLatestMarketSignals(manifest.ticker,projectRoot) },
    marketScreens:await loadLatestMarketSignals(manifest.ticker,projectRoot),
    nse52WeekHigh:latest52
  };
  const announcementsA=artifact(manifest,['nse-api-corporate-announcements']); const announcements=announcementsA?.localPath?await readJson(announcementsA.localPath):null;
  const actionsA=artifact(manifest,['nse-api-corporate-actions']); const actions=actionsA?.localPath?await readJson(actionsA.localPath):null;
  const catalystItems=[] as any[];
  for(const r of flattenRecords(announcements).slice(0,500)){ const d=parseDate(r?.date ?? r?.sortDate ?? r?.timestamp ?? r?.an_dt ?? r?.an_dt_tm ?? r?.dt ?? r?.annDate); const title=text(r?.subject ?? r?.desc ?? r?.details ?? r?.headline ?? r?.attchmntFile ?? r?.attachment ?? r?.description ?? r?.purpose); if(title || d) catalystItems.push({type:'announcement',date:d,title:title||'NSE corporate announcement',raw:r}); }
  for(const r of flattenRecords(actions).slice(0,250)){ const d=parseDate(r?.exDate ?? r?.date ?? r?.recordDate ?? r?.ex_date ?? r?.record_date ?? r?.exDateTime); const title=text(r?.purpose ?? r?.subject ?? r?.series ?? r?.description ?? r?.purposeName ?? r?.faceValue); if(title || d) catalystItems.push({type:'corporate_action',date:d,title:title||'NSE corporate action',raw:r}); }
  const tijoriMarket=screening.tijoriMarket??{}; for(const r of arr(tijoriMarket.upcomingEvents)) catalystItems.push({type:'tijori_upcoming_event',date:parseDate(r?.date),title:text(r?.company ?? r?.event ?? r?.name),raw:r});
  for(const r of arr(tijoriMarket.ideas)) if(new RegExp(`\\b${manifest.ticker}\\b`,'i').test(JSON.stringify(r))) catalystItems.push({type:'tijori_idea',date:null,title:text(r?.title ?? r?.category ?? r?.company),raw:r});
  catalystItems.sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')));

  const marketFacts=facts.filter(f=>['last_price','previous_close','open','day_high','day_low','percent_change','volume','52_week_high_price'].includes(f.field));
  const technicalSignals={latest:t.latest, priceVsEma50: t.latest?.close!=null&&t.latest?.ema50!=null ? Number(t.latest.close)>=Number(t.latest.ema50) : null, priceVsEma200:t.latest?.close!=null&&t.latest?.ema200!=null ? Number(t.latest.close)>=Number(t.latest.ema200) : null, ema50VsEma200:t.latest?.ema50!=null&&t.latest?.ema200!=null ? Number(t.latest.ema50)>=Number(t.latest.ema200) : null, rsi14:t.latest?.rsi14??null, rsiState:t.latest?.rsi14==null?null:Number(t.latest.rsi14)<30?'oversold':Number(t.latest.rsi14)>70?'overbought':'neutral'};

  const financialPeriods={schema_version:'1.2',ticker:manifest.ticker,nse:nsePeriods,screener:fundamentals.periodTables,tijori:{capturedAt:fundamentals.tijoriCapturedAt??null,text:fundamentals.tijoriText??null},nextApi:{financialStatusPath:'raw/nse-api/nextapi/financials/financial-status.json',financialResultDataPath:'raw/nse-api/nextapi/financials/financial-result-data.json'},deterministic:true,llmUsed:false};
  const canonicalValues={schema_version:'1.2',ticker:manifest.ticker,generatedAt:new Date().toISOString(),facts,calculatedMetrics:metrics,deterministic:true,llmUsed:false};
  const valuationOut={schema_version:'1.1',ticker:manifest.ticker,metrics:valuation,derived:{priceEarnings:null,priceToBook:null},deterministic:true};
  const financialOut={schema_version:'1.3',ticker:manifest.ticker,nsePeriods:nsePeriods.rows,nextApi:{financialStatus:fundamentals.nextApiFinancialStatusRows??[],financialResultData:fundamentals.nextApiFinancialResultRows??[]},screener:{metrics:fundamentals.metrics,tableCount:fundamentals.tables.length,periodTableCount:fundamentals.periodTables.length},tijori:{available:fundamentals.tijoriAvailable,capturedAt:fundamentals.tijoriCapturedAt??null},deterministic:true};
  const marketOut={schema_version:'1.2',ticker:manifest.ticker,facts:marketFacts,quote:quoteNormalized??qObj??null,yearwisePerformance:yearwiseRows,intradayChart1D:{sourceArtifact:chartArtifact?.id??null,pointCount:yearwiseRows.length?Array.isArray(chart1d)?chart1d.length:0:Array.isArray(chart1d)?chart1d.length:0,points:Array.isArray(chart1d)?chart1d:[]},latest52WeekHigh:latest52,deterministic:true};
  const ownershipOut={schema_version:'1.1',ticker:manifest.ticker,available:ownership.available,metrics:ownership.metrics,sourceArtifact:ownership.sourceArtifact,asOf:ownership.asOf,rawPath: ownership.available ? (artifact(manifest,[],x=>x.type==='shareholding' && /nse/i.test(x.provider))?.localPath ?? null) : null,deterministic:true};
  const technicalsOut={schema_version:'1.1',ticker:manifest.ticker,metrics,signals:technicalSignals,tradingView:{oneD:'screenshots/tradingview-1d.png',fiveY:'screenshots/tradingview-fullchart-5y.png',all:'screenshots/tradingview-fullchart-all.png',technicals:'screenshots/tradingview-technicals.png'},deterministic:true};
  const screeningOut={schema_version:'1.1',ticker:manifest.ticker,chartink:screening.chartink,marketScreens:screening.marketScreens,nse52WeekHigh:latest52,tijoriMarket:tijoriMarket,deterministic:true};
  const nextBase=path.join(researchDir,'raw','nse-api','nextapi');
  const nextAnn=await readJson(path.join(nextBase,'corporate','corporate-announcements-nextapi.json'));
  const nextBoard=await readJson(path.join(nextBase,'corporate','board-meetings.json'));
  const nextActions=await readJson(path.join(nextBase,'corporate','corporate-actions-nextapi.json'));
  const nextCalendar=await readJson(path.join(nextBase,'corporate','event-calendar.json'));
  for(const r of await normalizeNextAnnouncements(nextAnn)) catalystItems.push(r);
  for(const r of normalizeNextBoardMeetings(nextBoard)) catalystItems.push(r);
  for(const r of normalizeNextActions(nextActions)) catalystItems.push(r);
  for(const r of normalizeNextCalendar(nextCalendar)) catalystItems.push(r);
  const dedupCatalysts=new Map<string,any>();
  for(const item of catalystItems){ const key=`${item.type}|${item.date??''}|${item.title??''}|${item.raw?.attchmntFile??item.raw?.attachment??item.raw?.bm_attachment??''}`; if(!dedupCatalysts.has(key)) dedupCatalysts.set(key,item); }
  const finalCatalysts=[...dedupCatalysts.values()].sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')));
  const catalystsOut={schema_version:'1.2',ticker:manifest.ticker,items:finalCatalysts.slice(0,150),counts:{announcements:finalCatalysts.filter(x=>x.type==='announcement').length,corporateActions:finalCatalysts.filter(x=>x.type==='corporate_action').length,boardMeetings:finalCatalysts.filter(x=>x.type==='board_meeting').length,events:finalCatalysts.filter(x=>x.type==='corporate_event').length,tijoriUpcoming:finalCatalysts.filter(x=>x.type==='tijori_upcoming_event').length,tijoriIdeas:finalCatalysts.filter(x=>x.type==='tijori_idea').length},deterministic:true};

  const all=[...facts,...metrics];
  const groups=new Map<string,CanonicalValue[]>(); for(const v of all){ const key=['last_price','current_price'].includes(v.field)?'current_price':v.field; const list=groups.get(key)??[]; list.push(v); groups.set(key,list); }
  const reconciliation:any={schema_version:'1.2',ticker:manifest.ticker,generatedAt:new Date().toISOString(),conflicts:[],resolved:{}};
  for(const [field,vals] of groups){ const nums=vals.filter(v=>typeof v.value==='number'); if(nums.length<2) continue; const min=Math.min(...nums.map(v=>Number(v.value))), max=Math.max(...nums.map(v=>Number(v.value))); const spread=min===0?Infinity:Math.abs((max-min)/min)*100; if(spread<=Number(process.env.EVIDENCE_CONFLICT_THRESHOLD_PCT||1.5)){ const best=[...vals].sort((a,b)=>sourcePriority(b.source,b.field)-sourcePriority(a.source,a.field))[0]; reconciliation.resolved[field]=best; } else { reconciliation.conflicts.push({field,values:nums,spreadPct:spread,resolution:'unresolved'}); }}
  reconciliation.conflictCount=reconciliation.conflicts.length;

  const evidence={schema_version:'1.2',ticker:manifest.ticker,generatedAt:new Date().toISOString(),identity:security,market:marketOut,financials:financialOut,financialPeriods,ownership:ownershipOut,technicals:technicalsOut,screening:screeningOut,catalysts:catalystsOut,valuation:valuationOut,canonicalValues,reconciliation,deterministic:true,llmUsed:false};

  const outDir=path.join(researchDir,'normalized'); await ensureDir(outDir);
  await Promise.all([
    writeFile(path.join(outDir,'identity.json'),JSON.stringify({schema_version:'1.2',ticker:manifest.ticker,security,deterministic:true,llmUsed:false},null,2)),
    writeFile(path.join(outDir,'market.json'),JSON.stringify(marketOut,null,2)),
    writeFile(path.join(outDir,'financials.json'),JSON.stringify(financialOut,null,2)),
    writeFile(path.join(outDir,'financial-periods.json'),JSON.stringify(financialPeriods,null,2)),
    writeFile(path.join(outDir,'ownership.json'),JSON.stringify(ownershipOut,null,2)),
    writeFile(path.join(outDir,'technicals.json'),JSON.stringify(technicalsOut,null,2)),
    writeFile(path.join(outDir,'screening.json'),JSON.stringify(screeningOut,null,2)),
    writeFile(path.join(outDir,'catalysts.json'),JSON.stringify(catalystsOut,null,2)),
    writeFile(path.join(outDir,'valuation.json'),JSON.stringify(valuationOut,null,2)),
    writeFile(path.join(outDir,'canonical-values.json'),JSON.stringify(canonicalValues,null,2)),
    writeFile(path.join(outDir,'reconciliation.json'),JSON.stringify(reconciliation,null,2)),
    writeFile(path.join(outDir,'individual-stock-evidence.json'),JSON.stringify(evidence,null,2)),
  ]);
  return {evidence,facts,metrics,reconciliation,security,financialPeriods,valuation,ownership,catalysts:catalystsOut,technicals:technicalsOut,screening:screeningOut};
}

export async function writeIndividualStockEvidence(researchDir:string,manifest:ResearchManifest){ return buildIndividualStockEvidence(researchDir,manifest); }

if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`){
  const ticker=process.argv[2]?.toUpperCase(); if(!ticker) throw new Error('Usage: npm run stock:evidence -- ITC');
  const dir=path.join(process.cwd(),'research',ticker); const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;
  buildIndividualStockEvidence(dir,manifest).then(r=>console.log(JSON.stringify({ticker,security:r.security,facts:r.facts.length,calculatedMetrics:r.metrics.length,financialPeriods:r.financialPeriods.nse.rows.length,screenerPeriodTables:r.financialPeriods.screener.length,ownership:r.ownership.available,catalysts:r.catalysts.items.length,conflicts:r.reconciliation.conflictCount},null,2))).catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
}
