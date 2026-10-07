import { precedenceFor, sourcePriority } from '../src/lib/source-precedence.js';

const checks = [
  { field:'last_price', preferred:'NSE', lower:'Screener' },
  { field:'pe_ratio', preferred:'Screener', lower:'Tijori' },
  { field:'symbol', preferred:'NSE Securities Master', lower:'NSE' },
  { field:'ema50', preferred:'NSE', lower:'TradingView' },
];
const results = checks.map(c => ({ ...c, ok: sourcePriority(c.preferred,c.field)>sourcePriority(c.lower,c.field), precedence: precedenceFor(c.field) }));
const ok = results.every(r=>r.ok);
console.log(JSON.stringify({ok, results}, null, 2));
if (!ok) process.exitCode=1;
