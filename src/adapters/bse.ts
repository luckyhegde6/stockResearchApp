import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { browserRunCode, closeBrowserSession } from '../lib/browser.js';
import { ensureDir, writeText, slugify } from '../lib/fs.js';
import { downloadFile } from '../lib/download.js';
import { webFetchText } from '../lib/webfetch.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

const bseUrl = (slug:string,ticker:string,scrip:string) => `https://www.bseindia.com/stock-share-price/${slug}/${ticker.toLowerCase()}/${scrip}/`;

async function loadScrip(ticker:string) {
  const file = process.env.BSE_SCRIPTS_JSON || './config/bse-scripts.json';
  try { const data = JSON.parse(await readFile(file,'utf8')) as Record<string,string>; return data[ticker.toUpperCase()] || process.env.BSE_SCRIP_CODE; } catch { return process.env.BSE_SCRIP_CODE; }
}

export async function runBse(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[]=[]; const gaps:string[]=[]; const warnings:string[]=[];
  const scrip=ctx.bseScrip || await loadScrip(ctx.ticker);
  if(!scrip) return {artifacts,gaps:[`BSE scrip code is unknown for ${ctx.ticker}. Provide BSE_SCRIP_CODE or config/bse-scripts.json.`],warnings};
  ctx.bseScrip=scrip;
  const base=bseUrl(slugify(ctx.companyName || `${ctx.ticker} industries limited`),ctx.ticker,scrip);
  const raw=path.join(ctx.researchDir,'raw','bse'); const screens=path.join(ctx.researchDir,'screenshots');
  await Promise.all([ensureDir(raw),ensureDir(screens),ensureDir(path.join(raw,'annual-reports'))]);
  try { const r=await webFetchText(base,{headers:{Referer:'https://www.bseindia.com/'}},Number(process.env.SOURCE_TIMEOUT_MS||90000)); await writeText(path.join(raw,'quote-page.html'),r.text||''); artifacts.push({id:'bse-quote-http',type:'source_page',provider:'BSE India',title:'BSE quote HTTP page',url:r.finalUrl||base,localPath:path.join(raw,'quote-page.html'),retrievedAt:new Date().toISOString(),status:'ok',method:'webfetch',notes:[]}); } catch(e:any){warnings.push(`BSE direct fetch: ${e?.message||String(e)}`)}
  const session=`${process.env.PLAYWRIGHT_SESSION_PREFIX||'stock-research'}-${ctx.ticker}-bse`;
  try {
    const result=await browserRunCode(session,async page=>{await page.waitForTimeout(2500);const links=await page.locator('a').evaluateAll((els:any[])=>els.map(a=>({text:(a.innerText||a.textContent||'').trim(),href:a.href})).filter(x=>x.href));return{url:page.url(),title:await page.title(),text:await page.locator('body').innerText().catch(()=>''),links};},{url:base,timeoutMs:Number(process.env.SOURCE_TIMEOUT_MS||90000),screenshotPath:path.join(screens,'bse-quote.png')});
    const jsonPath=path.join(raw,'quote-page.json'); await writeText(jsonPath,JSON.stringify(result,null,2));
    artifacts.push({id:'bse-quote',type:'market_data',provider:'BSE India',title:'BSE quote page',url:result.url||base,localPath:jsonPath,screenshotPath:path.join(screens,'bse-quote.png'),retrievedAt:new Date().toISOString(),status:result.text?'ok':'partial',method:'playwright',notes:[]});
    const links=(result.links||[]).filter((x:any)=>/\.pdf(?:$|\?)/i.test(x.href)&&/annual.?report/i.test(`${x.text} ${x.href}`)).slice(0,3);
    for(let i=0;i<links.length;i++){const out=path.join(raw,'annual-reports',`bse-annual-${i+1}.pdf`);try{const d=await downloadFile(links[i].href,out,{Referer:base});artifacts.push({id:`bse-annual-${i+1}`,type:'annual_report',provider:'BSE India',title:links[i].text||`BSE Annual Report ${i+1}`,url:links[i].href,localPath:out,retrievedAt:new Date().toISOString(),status:'ok',method:'webfetch',notes:[`bytes=${d.bytes}`]});}catch(e:any){warnings.push(`BSE annual report: ${e?.message||String(e)}`)}}
    if(!links.length) warnings.push('BSE annual-report PDF links were not found on the quote page. NSE annual reports remain the primary evidence.');
  } catch(e:any){warnings.push(`BSE Playwright: ${e?.message||String(e)}`)}
  finally{await closeBrowserSession(session).catch(()=>{})}
  return {artifacts,gaps,warnings};
}
