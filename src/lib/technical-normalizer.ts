import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function n(v: any) { const x = Number(String(v ?? '').replace(/[,₹%]/g, '').trim()); return Number.isFinite(x) ? x : null; }
function val(obj: any, keys: string[]) { for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== '') return obj[k]; return null; }
function dmy(v: any) { if (typeof v !== 'string') return null; const m = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10); }
function ema(xs:number[], p:number) { if (xs.length < p) return null; let e = xs.slice(0,p).reduce((a,b)=>a+b,0)/p; const k=2/(p+1); for(let i=p;i<xs.length;i++) e=xs[i]*k+e*(1-k); return e; }
function rsi(xs:number[], p=14) { if (xs.length <= p) return null; let g=0,l=0; for(let i=1;i<=p;i++){const x=xs[i]-xs[i-1]; if(x>=0)g+=x;else l-=x;} let ag=g/p, al=l/p; for(let i=p+1;i<xs.length;i++){const x=xs[i]-xs[i-1]; ag=(ag*(p-1)+Math.max(x,0))/p; al=(al*(p-1)+Math.max(-x,0))/p;} return al===0?100:100-(100/(1+ag/al)); }

export async function writeTechnicalNormalized(researchDir: string) {
  const src=path.join(researchDir,'raw','nse-api','historical-normalized.json');
  const payload=JSON.parse(await readFile(src,'utf8'));
  const input=Array.isArray(payload)?payload:(payload?.rows||[]);
  const seen=new Set<string>();
  const rows=input.map((r:any)=>({
    date:dmy(val(r,['timestamp','Date','date','DATE','CH_TIMESTAMP','mTIMESTAMP'])),
    open:n(val(r,['open','OPEN','CH_OPENING_PRICE'])), high:n(val(r,['high','HIGH','CH_TRADE_HIGH_PRICE'])), low:n(val(r,['low','LOW','CH_TRADE_LOW_PRICE'])), close:n(val(r,['close','CLOSE','CH_CLOSING_PRICE'])), volume:n(val(r,['volume','VOLUME','CH_TOT_TRADED_QTY']))
  })).filter((r:any)=>r.date && r.close!=null).sort((a:any,b:any)=>a.date.localeCompare(b.date)).filter((r:any)=>{if(seen.has(r.date!))return false;seen.add(r.date!);return true;});
  const closes=rows.map((r:any)=>r.close as number);
  const latest=rows.at(-1)??null;
  const out={
    schema_version:'1.1',
    ticker:path.basename(researchDir),
    timeframe:'1D',
    source:'NSE EQ historical',
    sourceType:'deterministic_derived',
    generatedAt:new Date().toISOString(),
    rowCount:rows.length,
    indicatorMethod:{ema50:'standard EMA, seeded with first 50-period SMA',ema200:'standard EMA, seeded with first 200-period SMA',rsi14:'Wilder-style RSI14'},
    latest:latest?{...latest,ema50:ema(closes,50),ema200:ema(closes,200),rsi14:rsi(closes,14)}:null,
    notes:['Derived without LLM.','This is the canonical technical dataset for analysis.','TradingView remains the independent visual/audit source.']
  };
  const outPath=path.join(researchDir,'raw','tradingview','technical-normalized.json');
  await writeFile(outPath,JSON.stringify(out,null,2),'utf8');
  return outPath;
}
