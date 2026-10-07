import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';
import { readJson, numberValue, cleanText, getText, findLabeledNumber } from './canonical.js';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';

type ValueType = 'number'|'text';
type EvidenceRole = 'source_fact'|'calculated_metric';
export interface CanonicalField {
  id:string; evidenceRole:EvidenceRole; field:string; value:number|string|null; unit:string|null; period?:string|null;
  source:string; sourceArtifact:string|null; method:'source_extraction'|'deterministic_calculation'; verified:boolean;
  asOf:string|null; evidencePath:string|null; sourceUrl:string|null; confidence:'high'|'medium'|'low';
  notes?:string[];
}

function artifact(manifest:ResearchManifest, ids:string[]):SourceArtifact|undefined { return manifest.sourceArtifacts.find(a=>ids.includes(a.id)); }
function sourceField(args:Omit<CanonicalField,'method'|'verified'|'confidence'|'evidenceRole'> & {confidence?:CanonicalField['confidence'];notes?:string[]}):CanonicalField {
  return {...args, evidenceRole:'source_fact', method:'source_extraction', verified:args.value!==null, confidence:args.confidence??'high'};
}
function calculatedField(args:Omit<CanonicalField,'method'|'verified'|'confidence'|'evidenceRole'> & {confidence?:CanonicalField['confidence'];notes?:string[]}):CanonicalField {
  return {...args, evidenceRole:'calculated_metric', method:'deterministic_calculation', verified:args.value!==null, confidence:args.confidence??'high'};
}
function canonicalizeLabel(s:string){ return s.toLowerCase().replace(/₹/g,'rs').replace(/[()%.,:/_-]+/g,' ').replace(/\s+/g,' ').trim(); }
function extractFromTables(snapshot:any, labels:string[], valueType:ValueType='number'):{value:any;period?:string|null}|null {
  const wanted=labels.map(canonicalizeLabel);
  const tables=Array.isArray(snapshot?.tables)?snapshot.tables:[];
  for(const table of tables){
    const headers=Array.isArray(table?.headers)?table.headers.map((x:any)=>String(x??'').trim()):[];
    const rows=Array.isArray(table?.rows)?table.rows:[];
    for(const row of rows){
      const cells=Array.isArray(row)?row.map((x:any)=>String(x??'').trim()):[];
      for(let i=0;i<cells.length;i++){
        const c=canonicalizeLabel(cells[i]);
        if(!wanted.some(w=>c===w || c.includes(w))) continue;
        const next=cells.slice(i+1).filter(Boolean);
        for(const candidate of next){
          if(valueType==='number'){const n=numberValue(candidate); if(n!==null)return {value:n,period:headers[i+1]??null};}
          else return {value:candidate,period:headers[i+1]??null};
        }
      }
    }
    if(headers.length && rows[0]){
      const row=Array.isArray(rows[0])?rows[0].map((x:any)=>String(x??'').trim()):[];
      const idx=headers.findIndex((h:string)=>wanted.some(w=>canonicalizeLabel(h).includes(w)));
      if(idx>=0 && row[idx]) return {value:valueType==='number'?(numberValue(row[idx])??null):row[idx],period:null};
    }
  }
  const text=getText(snapshot);
  for(const label of labels){
    const n=findLabeledNumber(text,[label]);
    if(valueType==='number' && n!==null)return {value:n,period:null};
  }
  return null;
}

function push(out:CanonicalField[], manifest:ResearchManifest, a:SourceArtifact|undefined, field:string, value:any, unit:string|null, opts:{period?:string|null;confidence?:CanonicalField['confidence'];note?:string}={}){
  if(value===null||value===undefined||value==='') return;
  out.push(sourceField({id:`${a?.provider?.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'source'}-${field}-${out.length+1}`,field,value,unit,period:opts.period??null,source:a?.provider||'unknown',sourceArtifact:a?.id??null,asOf:a?.retrievedAt??null,evidencePath:a?.localPath??null,sourceUrl:a?.url??null,confidence:opts.confidence??'medium',notes:opts.note?[opts.note]:[]}));
}

function normalizePeriod(period:string|null|undefined):string|null{
  if(!period) return null;
  const p=period.replace(/\s+/g,' ').trim();
  if(!p)return null;
  return p;
}

async function readSnapshot(manifest:ResearchManifest, ids:string[]):Promise<{a?:SourceArtifact;d:any}> { const a=artifact(manifest,ids); return {a,d:a?.localPath?await readJson(a.localPath):null}; }

export async function buildCanonicalExtraction(researchDir:string, manifest:ResearchManifest){
  const facts:CanonicalField[]=[];
  const periods:CanonicalField[]=[];
  const sourceArtifacts=manifest.sourceArtifacts;

  const nq=await readSnapshot(manifest,['nse-api-quote-nextapi-fallback','nse-api-quote']);
  if(nq.d){
    const map:Array<[string,string[],string]>=[
      ['last_price',['lastPrice','lastTradedPrice','ltp','LTP','last'],'price'],['previous_close',['previousClose','prevClose'],'price'],['open',['open'],'price'],['day_high',['dayHigh','high'],'price'],['day_low',['dayLow','low'],'price'],['52w_high',['yearHigh','52WeekHigh','week52High'],'price'],['52w_low',['yearLow','52WeekLow','week52Low'],'price'],['volume',['totalTradedVolume','tradedVolume','volume'],'shares'],['p_change',['pChange','percentChange','percentageChange'],'%']
    ];
    for(const [field,keys,unit] of map){
      let v:number|null=null;
      for(const k of keys){
        const hit = findFirstNumericDeep(nq.d,[k]);
        if(hit!==null){v=hit;break;}
      }
      push(facts,manifest,nq.a,field,v,unit,{confidence:'high'});
    }
  }

  // NSE market-universe fallback: use exact target quote from a normalized index constituent when GetQuoteApi omits LTP.
  if(!facts.some(x=>x.field==='last_price')){
    const marketRoot=path.join(researchDir,'..','..','market-screens','nse','indices');
    const target=manifest.ticker.toUpperCase();
    try{
      const files=await (await import('node:fs/promises')).readdir(marketRoot);
      for(const f of files.filter(x=>x.endsWith('.normalized.json'))){
        const data=await readJson(path.join(marketRoot,f));
        const row=Array.isArray(data?.rows)?data.rows.find((r:any)=>String(r?.symbol||'').toUpperCase()===target && r?.isEquityUniverse):null;
        if(row?.lastPrice!==null && row?.lastPrice!==undefined){
          const synthetic:SourceArtifact={id:`nse-market-index-quote-${f}`,type:'market_data',provider:'NSE India API',title:`Index constituent quote fallback ${target}`,localPath:path.join(marketRoot,f),retrievedAt:new Date().toISOString(),status:'ok',method:'script'};
          push(facts,manifest,synthetic,'last_price',numberValue(row.lastPrice),'price',{confidence:'high',note:'Fallback from exact target constituent row in NSE getIndicesData response.'});
          break;
        }
      }
    }catch{}
  }

  const sr=await readSnapshot(manifest,['screener-fundamental-snapshot']);
  if(sr.d){
    const scalar:Array<[string,string[],string,ValueType]>=[
      ['company_name',['Company name','Company Name','Name'],'text','text'],['market_cap',['Market Cap','Mar Cap','Market Capitalization'],'INR crore','number'],['last_price',['Current Price','CMP','Current market price'],'price','number'],['pe_ratio',['Stock P/E','P/E','PE'],'x','number'],['book_value',['Book Value','Book Value per share'],'INR/share','number'],['dividend_yield',['Dividend Yield'],'%','number'],['roce',['ROCE','Return on capital employed'],'%','number'],['roe',['ROE','Return on equity'],'%','number'],['debt',['Debt'],'INR crore','number'],['sales_growth',['Sales growth'],'%','number'],['profit_growth',['Profit growth'],'%','number']
    ];
    for(const [field,labels,unit,type] of scalar){
      const r=extractFromTables(sr.d,labels,type); if(r){push(facts,manifest,sr.a,field,type==='number'?numberValue(r.value):cleanText(r.value),unit,{period:normalizePeriod(r.period),confidence:'high'});}
    }
    // Preserve period-aware tables as canonical rows, not just a blob.
    for(const t of (Array.isArray(sr.d?.tables)?sr.d.tables:[])){
      const caption=cleanText(t.caption)??'table'; const headers=Array.isArray(t.headers)?t.headers.map((x:any)=>cleanText(x)??''):[];
      for(const row of (Array.isArray(t.rows)?t.rows:[])){
        const cells=Array.isArray(row)?row.map((x:any)=>cleanText(x)??''):[];
        if(!cells.length)continue;
        for(let i=0;i<Math.min(headers.length,cells.length);i++){
          const n=numberValue(cells[i]);
          if(n!==null && /sales|revenue|profit|eps|cash|debt|assets|liabil|equity/i.test(`${headers[i]} ${caption}`)){
            periods.push(sourceField({id:`screener-period-${periods.length+1}`,field:canonicalizeLabel(headers[i]),value:n,unit:null,period:canonicalizeLabel(caption),source:sr.a?.provider||'Screener',sourceArtifact:sr.a?.id??null,method:'source_extraction',verified:true,asOf:sr.a?.retrievedAt??null,evidencePath:sr.a?.localPath??null,sourceUrl:sr.a?.url??null,confidence:'medium',notes:['Extracted from captured Screener table; original table remains in raw evidence.']}));
          }
        }
      }
    }
  }

  const tr=await readSnapshot(manifest,['tijori-financial-context']);
  if(tr.d){
    const scalar:Array<[string,string[],string]>=[['pe_ratio',['P/E','PE','P/E Ratio'],'x'],['roce',['ROCE'],'%'],['roe',['ROE'],'%'],['market_cap',['Market Cap','Market Capitalization'],'INR crore'],['last_price',['Current Price','CMP','Price','Last Price'],'price']];
    for(const [field,labels,unit] of scalar){const r=extractFromTables(tr.d,labels,'number'); if(r)push(facts,manifest,tr.a,field,numberValue(r.value),unit,{period:normalizePeriod(r.period),confidence:'medium'});}
    // Preserve financial-history-looking lines as period evidence where labels and dates coexist.
    const txt=getText(tr.d); const lines=txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines){ if(/20\d{2}|FY\d{2}|Q[1-4]/i.test(line) && /revenue|sales|profit|eps|cash|debt/i.test(line)){const n=numberValue(line); if(n!==null) periods.push(sourceField({id:`tijori-period-${periods.length+1}`,field:'financial_history_line',value:n,unit:null,period:normalizePeriod(line.match(/(FY\s*\d{2,4}|Q[1-4].{0,10}20\d{2}|20\d{2})/i)?.[1]??null),source:tr.a?.provider||'Tijori Finance',sourceArtifact:tr.a?.id??null,method:'source_extraction',verified:true,asOf:tr.a?.retrievedAt??null,evidencePath:tr.a?.localPath??null,sourceUrl:tr.a?.url??null,confidence:'low'}));}}
  }

  const tech=await readJson(path.join(researchDir,'raw','tradingview','technical-normalized.json'));
  if(tech?.latest){
    const synthetic:SourceArtifact={id:'tradingview-technical-normalized',provider:'NSE',type:'derived_data',title:'Canonical technical metrics',localPath:path.join(researchDir,'raw','tradingview','technical-normalized.json'),retrievedAt:tech.generatedAt??new Date().toISOString(),status:'ok',method:'script'};
    for(const [field,val,unit] of [['close',tech.latest.close,'price'],['ema50',tech.latest.ema50,'price'],['ema200',tech.latest.ema200,'price'],['rsi14',tech.latest.rsi14,'index'],['volume',tech.latest.volume,'shares']] as const){
      if(val===null||val===undefined) continue;
      facts.push(calculatedField({id:`nse-calculated-${field}`,evidenceRole:'calculated_metric',field,value:val,unit,source:'NSE',sourceArtifact:synthetic.id,asOf:tech.latest.date??tech.generatedAt??null,evidencePath:synthetic.localPath,sourceUrl:null,confidence:'high',notes:['Deterministically calculated from canonical NSE EQ historical data.']}));
    }
  }

  const out={schema_version:'1.1',ticker:manifest.ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,facts,periodValues:periods,summary:{facts:facts.filter(x=>x.evidenceRole==='source_fact').length,calculatedMetrics:facts.filter(x=>x.evidenceRole==='calculated_metric').length,periodValues:periods.length}};
  return out;
}

function findFirstNumericDeep(obj:any, keys:string[]):number|null{
  const wanted=new Set(keys.map(x=>x.toLowerCase()));
  const stack:any[]=[obj];
  while(stack.length){const cur=stack.pop(); if(cur==null)continue; if(Array.isArray(cur)){for(const x of cur)stack.push(x);continue;} if(typeof cur!=='object')continue;
    for(const [k,v] of Object.entries(cur)){ if(wanted.has(k.toLowerCase())){const n=numberValue(v); if(n!==null)return n;} if(v&&typeof v==='object')stack.push(v); }
  }
  return null;
}

export async function writeCanonicalExtraction(researchDir:string,manifest:ResearchManifest){const outDir=path.join(researchDir,'normalized');await ensureDir(outDir);const data=await buildCanonicalExtraction(researchDir,manifest);const out=path.join(outDir,'canonical-facts.json');await writeFile(out,JSON.stringify(data,null,2),'utf8');return {out,data};}

async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run canonical -- ITC');const dir=path.join(process.cwd(),'research',ticker);const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;const r=await writeCanonicalExtraction(dir,manifest);console.log(JSON.stringify({path:r.out,summary:r.data.summary},null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
