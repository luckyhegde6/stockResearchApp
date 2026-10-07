import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from '../lib/fs.js';
import { webFetchText } from '../lib/webfetch.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';

const TV_NEWS_BASE = 'https://news-mediator.tradingview.com/public/news-flow/v2/news';
const GOOGLE_RSS = 'https://news.google.com/rss/search';

function tsMsFromSeconds(v:any){ const n=Number(v); return Number.isFinite(n)?n*1000:null; }
function clean(s:any){ return typeof s==='string'?s.replace(/\s+/g,' ').trim():''; }
function normalizeTitle(title:string){ return title.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
function titleSentiment(title:string){
  const t=normalizeTitle(title);
  const positive=['beats','beat expectations','surge','rises','gains','orders','order win','contract','approval','approval received','strong','growth','profit rises','profit jumps','revenue rises','bullish','upgrade','dividend','buyback','expansion','record','partnership','acquisition','positive','outperforms','outperformance','new high','wins','award','clearance','launch'];
  const negative=['misses','miss','falls','slips','decline','declines','drop','drops','loss','losses','cut','downgrade','warning','probe','investigation','fraud','delay','delayed','debt','default','resignation','penalty','weak','bearish','disappointing','lower guidance','deceleration','selloff','lawsuit','ban','recall','fire','accident','default'];
  let score=0;
  for(const k of positive) if(t.includes(k)) score += k.includes('strong')||k.includes('record')?0.16:0.10;
  for(const k of negative) if(t.includes(k)) score -= k.includes('fraud')||k.includes('default')||k.includes('investigation')?0.20:0.10;
  score=Math.max(-1,Math.min(1,score));
  const label=score>0.12?'positive':score<-0.12?'negative':'neutral';
  return {score,label};
}
function parseXmlItems(xml:string){
  const items:any[]=[];
  const blocks=xml.match(/<item[\s\S]*?<\/item>/gi)??[];
  for(const b of blocks){
    const get=(tag:string)=>{const m=new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i').exec(b); if(!m) return ''; return clean(m[1].replace(/<!\[CDATA\[|\]\]>/g,''));};
    const title=get('title'); const link=get('link'); const pub=get('pubDate'); const source=get('source');
    if(title) items.push({title,link,published:pub?new Date(pub).toISOString():null,source:source||'Google News'});
  }
  return items;
}
async function writeJson(file:string,data:any){ await ensureDir(path.dirname(file)); await writeFile(file,JSON.stringify(data,null,2),'utf8'); }

export async function runNewsSentiment(ctx:AdapterContext):Promise<AdapterResult>{
  const ticker=ctx.ticker.toUpperCase();
  const root=path.join(ctx.researchDir,'raw','news');
  await ensureDir(root);
  const artifacts:SourceArtifact[]=[]; const warnings:string[]=[]; const gaps:string[]=[];
  const all:any[]=[];

  // 1) TradingView News Flow — symbol-filtered and paginated by cursor.
  const tvItems:any[]=[]; let cursor=''; const maxPages=Math.max(1,Number(process.env.NEWS_TV_MAX_PAGES||3));
  try{
    for(let page=1;page<=maxPages;page++){
      const qs=new URLSearchParams({filter:'lang:en', 'client':'chart','user_prostatus':'non_pro'}); qs.append('filter',`symbol:NSE:${ticker}`); if(cursor) qs.set('cursor',cursor);
      const url=`${TV_NEWS_BASE}?${qs.toString()}`;
      const r=await webFetchText(url,{headers:{'Accept':'application/json'}});
      const data=JSON.parse(r.text||'{}');
      const items=Array.isArray(data?.items)?data.items:[];
      tvItems.push(...items);
      cursor=clean(data?.pagination?.cursor);
      if(!cursor || !items.length) break;
    }
    const file=path.join(root,'tradingview-news.json'); await writeJson(file,{source:'TradingView News Flow',ticker,items:tvItems,retrievedAt:new Date().toISOString(),pages:tvItems.length?Math.min(maxPages, Math.max(1, Math.ceil(tvItems.length/50))):1});
    artifacts.push({id:'tradingview-news-flow',type:'news',provider:'TradingView News Flow',title:`TradingView News Flow ${ticker}`,url:TV_NEWS_BASE,localPath:file,retrievedAt:new Date().toISOString(),status:'ok',method:'webfetch',notes:['Symbol-filtered news-flow metadata; article bodies are not copied.']});
    for(const x of tvItems){
      const related=(x.relatedSymbols??[]).map((s:any)=>String(s.symbol??''));
      if(related.includes(`NSE:${ticker}`)) all.push({source:'TradingView',provider:x.provider?.name??'TradingView News Flow',id:x.id,title:clean(x.title),url:x.link||null,publishedAt:tsMsFromSeconds(x.published),urgency:x.urgency??null,paywall:x.paywall??null,relatedSymbols:related,sentiment:titleSentiment(clean(x.title))});
    }
  }catch(e:any){ warnings.push(`News TradingView News Flow failed: ${e?.message||String(e)}`); }

  // 2) Google News RSS — broad company/ticker discovery cross-check.
  if(!/^(0|false|no|off)$/i.test(process.env.NEWS_ENABLE_GOOGLE_RSS??'true')){
    try{
      const q=`"${ctx.companyName||ticker}" ${ticker} stock`;
      const url=`${GOOGLE_RSS}?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const r=await webFetchText(url,{headers:{'Accept':'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8'}});
      const items=parseXmlItems(r.text||'').slice(0,Math.max(1,Number(process.env.NEWS_GOOGLE_MAX_ITEMS||40)));
      const file=path.join(root,'google-news-rss.xml'); await writeFile(file,r.body);
      const norm=path.join(root,'google-news-rss-normalized.json'); await writeJson(norm,{source:'Google News RSS',query:q,ticker,items,retrievedAt:new Date().toISOString()});
      artifacts.push({id:'google-news-rss',type:'news',provider:'Google News RSS',title:`Google News RSS ${ticker}`,url,localPath:file,retrievedAt:new Date().toISOString(),status:'ok',method:'webfetch',notes:['Headline metadata from public RSS; article bodies are not copied.']});
      artifacts.push({id:'google-news-rss-normalized',type:'derived_data',provider:'script',title:`Normalized Google News RSS ${ticker}`,url,localPath:norm,retrievedAt:new Date().toISOString(),status:'ok',method:'script',notes:['Deterministic headline parsing; no LLM sentiment.']});
      for(const x of items){
        all.push({source:'GoogleNews',provider:x.source||'Google News',id:null,title:x.title,url:x.link||null,publishedAt:x.published?Date.parse(x.published):null,urgency:null,paywall:null,relatedSymbols:[`NSE:${ticker}`],sentiment:titleSentiment(x.title)});
      }
    }catch(e:any){ warnings.push(`News Google News RSS failed: ${e?.message||String(e)}`); }
  }

  // 3) NSE corporate announcements already acquired by the NSE adapter.
  try{
    const candidates=[
      path.join(ctx.researchDir,'raw','nse-api','nextapi','corporate','corporate-announcements.json'),
      path.join(ctx.researchDir,'raw','nse-api','corporate-announcements-nextapi.json')
    ];
    let data:any=null, file:string='';
    for(const c of candidates){ try{data=JSON.parse(await readFile(c,'utf8')); file=c; break;}catch{} }
    if(data){
      const arr=Array.isArray(data)?data:(Array.isArray(data?.data)?data.data:[]);
      for(const x of arr.slice(0,Number(process.env.NEWS_NSE_MAX_ITEMS||200))){
        const title=clean(x.subject??x.desc??x.description??x.headline??x.attchmntText??x.title);
        if(!title) continue;
        all.push({source:'NSE',provider:'NSE Corporate Announcements',id:x.id??null,title,url:x.attchmntFile??x.attchmntUrl??x.link??null,publishedAt:x.broadcastDateTime?Date.parse(x.broadcastDateTime):null,urgency:null,paywall:false,relatedSymbols:[`NSE:${ticker}`],subject:x.subject??null,sentiment:titleSentiment(title)});
      }
    }
  }catch(e:any){ warnings.push(`News NSE announcement sentiment enrichment failed: ${e?.message||String(e)}`); }

  // Deduplicate by source+URL/title and compute aggregate deterministic headline sentiment.
  const seen=new Set<string>(); const news=all.filter(n=>{const k=`${n.source}|${n.url||''}|${normalizeTitle(n.title)}`; if(seen.has(k))return false; seen.add(k); return true;});
  const now=Date.now();
  let weightTotal=0, weighted=0; const counts={positive:0,negative:0,neutral:0};
  const providers=new Set<string>();
  for(const n of news){
    counts[n.sentiment.label as keyof typeof counts]++;
    providers.add(n.provider);
    const ageDays=n.publishedAt?Math.max(0,(now-Number(n.publishedAt))/86400000):30;
    const recency=Math.exp(-ageDays/30);
    const urgency=1+Math.min(2,Number(n.urgency||0)*0.15);
    const w=recency*urgency; weightTotal+=w; weighted+=n.sentiment.score*w;
  }
  const score=weightTotal?Math.max(-1,Math.min(1,weighted/weightTotal)):null;
  let label='INSUFFICIENT_DATA'; if(score!==null){ const imbalance=counts.positive-counts.negative; label=Math.abs(score)<0.08?'NEUTRAL':Math.abs(imbalance)<=1?'MIXED':score>0?'POSITIVE':'NEGATIVE'; }
  const themes=[...new Set(news.flatMap(n=>{const t=normalizeTitle(n.title); const hits:string[]=[]; for(const [theme,ks] of Object.entries({orders:['order','contract','booking'],earnings:['profit','revenue','earnings','results'],management:['ceo','director','appointment','resignation'],capital:['dividend','buyback','fundraising'],regulatory:['approval','drdo','government','regulator'],risk:['investigation','fraud','penalty','debt','delay','lawsuit'],market:['upgrade','downgrade','target','surge','falls','gains']})) if(ks.some(k=>t.includes(k))) hits.push(theme); return hits;}))].slice(0,8);
  const sentiment={schema_version:'1.0',ticker,generatedAt:new Date().toISOString(),deterministic:true,llmUsed:false,method:'headline_lexicon_with_recency_weighting',disclaimer:'Headline sentiment only; not article-body sentiment and not an investment recommendation.',summary:{headlineCount:news.length,sourceCount:providers.size,positive:counts.positive,negative:counts.negative,neutral:counts.neutral,weightedScore:score,label,dominantThemes:themes},headlines:news.slice(0,Math.max(1,Number(process.env.NEWS_MAX_STORED_HEADLINES||100)))};
  const out=path.join(ctx.researchDir,'normalized','news-sentiment.json'); await writeJson(out,sentiment);
  artifacts.push({id:'news-sentiment-normalized',type:'news',provider:'script',title:`Canonical news sentiment ${ticker}`,url:TV_NEWS_BASE,localPath:out,retrievedAt:new Date().toISOString(),status:'ok',method:'script',notes:['Deterministic headline sentiment from TradingView News Flow, Google News RSS and NSE corporate announcements when available.']});
  if(!news.length) warnings.push('No company-specific news headlines were captured from configured news sources.');
  return {artifacts,gaps,warnings};
}
