import path from 'node:path';
import { ensureDir } from '../lib/fs.js';
import { writeFile } from 'node:fs/promises';
import { webFetchText } from '../lib/webfetch.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

const FIELDS = [
  'price_52_week_high','price_52_week_low','sector','country','market','Low.1M','High.1M',
  'Perf.W','Perf.1M','Perf.3M','Perf.6M','Perf.Y','Perf.YTD','Recommend.All',
  'average_volume_10d_calc','average_volume_30d_calc','nav_discount_premium','open_interest',
  'country_code_fund','iv','underlying_symbol','delta','gamma','rho','theta','vega','theoPrice'
];
export async function runTradingViewSymbolSnapshot(ctx:AdapterContext):Promise<AdapterResult>{
  const ticker=ctx.ticker.toUpperCase(); const dir=path.join(ctx.researchDir,'raw','tradingview'); await ensureDir(dir);
  const fieldText=FIELDS.join('%2C');
  const url=`https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(`NSE:${ticker}`)}&fields=${fieldText}&no_404=true&label-product=symbol-search-button`;
  const raw=path.join(dir,'symbol-scanner.json'); const normalized=path.join(dir,'symbol-scanner-normalized.json');
  try{
    const r=await webFetchText(url,{headers:{'Accept':'application/json'}});
    await writeFile(raw, r.body);
    const data=JSON.parse(r.text||'null');
    const value=Array.isArray(data)?(data[0]??null):data;
    const clean:any={ticker,exchange:'NSE',symbol:`NSE:${ticker}`,retrievedAt:new Date().toISOString(),values:value};
    await import('node:fs/promises').then(fs=>fs.writeFile(normalized,JSON.stringify(clean,null,2),'utf8'));
    const a:SourceArtifact={id:'tradingview-symbol-scanner',type:'market_data',provider:'TradingView',title:`TradingView symbol scanner snapshot ${ticker}`,url,localPath:raw,retrievedAt:new Date().toISOString(),status:'ok',method:'webfetch',notes:['Deterministic scanner fields; raw response preserved. Field registry mirrored in config/tradingview-symbol-fields.json.']};
    const d:SourceArtifact={id:'tradingview-symbol-scanner-normalized',type:'derived_data',provider:'script',title:`Normalized TradingView symbol snapshot ${ticker}`,url,localPath:normalized,retrievedAt:new Date().toISOString(),status:'ok',method:'script'};
    return {artifacts:[a,d],gaps:[],warnings:[]};
  }catch(e:any){ return {artifacts:[],gaps:[],warnings:[`TradingView symbol snapshot failed: ${e?.message||String(e)}`]}; }
}
