import { readFile } from 'node:fs/promises';
import path from 'node:path';
const f=await readFile(path.join(process.cwd(),'src/lib/analysis-readiness.ts'),'utf8');
const checks={
  screenerConcallAdvisory:/Screener concall \\d\+: fetch failed/.test(f),
  tijoriConcallAdvisory:/Tijori .*concall.*\(\?:fetch failed\|failed\)/.test(f),
  nse403Ignored:/NSE API \(\?:quote\|trade-info\).*\(\?:403\|Forbidden\)/.test(f),
  bseExcluded:/BSE is excluded|excluded/.test(f),
};
console.log(JSON.stringify({ok:Object.values(checks).every(Boolean),checks},null,2));
if(!Object.values(checks).every(Boolean)) process.exit(1);
