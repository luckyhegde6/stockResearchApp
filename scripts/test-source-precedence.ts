import { sourcePriority, precedenceFor } from '../src/lib/source-precedence.js';

const cases = [
  ['last_price','NSE','Screener'],
  ['pe_ratio','Screener','Tijori'],
  ['symbol','NSE Securities Master','NSE'],
  ['ema50','NSE','TradingView'],
] as const;
const results = cases.map(([field,a,b])=>({field,a,b,ok:sourcePriority(a,field)>sourcePriority(b,field),order:precedenceFor(field)}));
const ok=results.every(x=>x.ok);
console.log(JSON.stringify({ok,results},null,2));
if(!ok)process.exitCode=1;
