import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';

export type HealthStatus = 'ok' | 'ok_with_fallback' | 'partial' | 'not_found' | 'blocked' | 'error';
const SOURCE_KEYS = ['NSE','Screener','Tijori','TradingView','News','Chartink'] as const;

function providerMatches(provider:string, source:string){
  const p=provider.toLowerCase();
  if(source==='NSE') return p.includes('nse');
  if(source==='Screener') return p.includes('screener');
  if(source==='Tijori') return p.includes('tijori');
  if(source==='TradingView') return p.includes('tradingview') && !p.includes('news flow');
  if(source==='News') return p.includes('news') || p.includes('headline');
  if(source==='Chartink') return p.includes('chartink');
  return false;
}
function warningBelongs(message:string, source:string){
  if(source==='NSE') return /^NSE\b/i.test(message);
  if(source==='Screener') return /^Screener\b/i.test(message);
  if(source==='Tijori') return /^Tijori\b/i.test(message);
  if(source==='TradingView') return /^TradingView\b/i.test(message);
  if(source==='News') return /^News|^TradingView News Flow|^Google News|^NSE announcement sentiment/i.test(message);
  if(source==='Chartink') return /^Chartink\b/i.test(message);
  return false;
}
function unique(xs:string[]){return [...new Set(xs.filter(Boolean))];}
function isAdvisoryGap(message:string){
  return /annual.?report.*(?:could not|not.*(?:found|downloaded|available))|(?:bse|bombay stock exchange)/i.test(message);
}
function classifyWarnings(source:string,warnings:string[]){
  const all=unique(warnings);
  const delegated=[] as string[];
  const fallbackInfo=source==='NSE'?all.filter(w=>/NSE API (?:quote(?:-equity)?|trade-info).*?(?:403|forbidden)/i.test(w) || /quote(?:-equity)?[^:]*:.*403/i.test(w)):[];
  const actionable=all.filter(w=>!delegated.includes(w)&&!fallbackInfo.includes(w));
  return {all,delegated,fallbackInfo,actionable};
}
function deriveStatus(artifacts:SourceArtifact[],gaps:string[],actionableWarnings:string[]):HealthStatus{
  // TradingView More-menu UI captures are supplementary visual evidence. They must
  // never downgrade the core TradingView source health when a UI surface is
  // unavailable or its SPA navigation cannot be confirmed.
  const healthArtifacts=artifacts.filter(a=>!String(a.id||'').startsWith('tradingview-ui-'));
  const hard=healthArtifacts.filter(a=>['blocked','error'].includes(a.status)).length;
  const fallback=healthArtifacts.filter(a=>a.status==='ok_with_fallback').length;
  if(!healthArtifacts.length&&gaps.length)return 'error';
  if(hard||gaps.length)return healthArtifacts.length?'partial':'error';
  if(fallback)return 'ok_with_fallback';
  if(actionableWarnings.length)return 'ok_with_fallback';
  return 'ok';
}

export function buildSourceHealth(manifest:ResearchManifest){
  const sources:Record<string,any>={};
  for(const source of SOURCE_KEYS){
    const artifacts=manifest.sourceArtifacts.filter(a=>providerMatches(a.provider,source));
    const warnings=unique(manifest.warnings.filter(w=>warningBelongs(w,source)));
    const gaps=unique(manifest.dataGaps.filter(g=>warningBelongs(g,source)).filter(g=>!isAdvisoryGap(g)));
    const c=classifyWarnings(source,warnings);
    let status=deriveStatus(artifacts,gaps,c.actionable);
    sources[source]={
      status,
      artifacts:artifacts.length,
      supplementaryArtifacts:artifacts.filter(a=>String(a.id||'').startsWith('tradingview-ui-')).length,
      successfulArtifacts:artifacts.filter(a=>a.status==='ok').length,
      fallbackArtifacts:artifacts.filter(a=>a.status==='ok_with_fallback').length,
      partialArtifacts:artifacts.filter(a=>a.status==='partial').length,
      blockedArtifacts:artifacts.filter(a=>a.status==='blocked').length,
      errorArtifacts:artifacts.filter(a=>a.status==='error').length,
      dataGaps:gaps.length,
      warnings:c.actionable.length,
      informationalWarnings:c.fallbackInfo.length+c.delegated.length,
      providers:[...new Set(artifacts.map(a=>a.provider))],
      warningDetails:c.actionable,
      fallbackDetails:c.fallbackInfo,
      delegatedWarningDetails:c.delegated,
      gapDetails:gaps,
      delegatedEvidence:false,
    };
  }
  const actionable=unique(SOURCE_KEYS.flatMap(s=>sources[s].warningDetails));
  const fallback=unique(SOURCE_KEYS.flatMap(s=>sources[s].fallbackDetails));
  const delegated=unique(SOURCE_KEYS.flatMap(s=>sources[s].delegatedWarningDetails));
  const all=unique(manifest.warnings);
  return {
    schema_version:'1.2',ticker:manifest.ticker,generatedAt:new Date().toISOString(),
    overall:{
      status:deriveStatus(manifest.sourceArtifacts,unique(manifest.dataGaps.filter(g=>!isAdvisoryGap(g))),actionable),
      artifacts:manifest.sourceArtifacts.length,
      dataGaps:unique(manifest.dataGaps.filter(g=>!isAdvisoryGap(g))).length,
      warnings:{total:all.length,unique:all.length,actionable:actionable.length,informational:unique([...fallback,...delegated]).length,fallback:fallback.length,delegated:delegated.length}
    },
    sources,
    rules:{
      ok_with_fallback:'Primary route failed but deterministic fallback produced usable evidence.',
      warningDoesNotMeanMissing:true,
      delegatedEvidenceDoesNotMeanMissing:true,
      fallbackWarningsAreInformational:true,
      warningBelongsToSourceByPrefix:true,
      llmUsed:false,
      advisoryGaps:unique(manifest.dataGaps.filter(isAdvisoryGap)),
    }
  };
}
export async function writeSourceHealth(researchDir:string,manifest:ResearchManifest){const out=path.join(researchDir,'source-health.json');await writeFile(out,JSON.stringify(buildSourceHealth(manifest),null,2));return out;}
async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run source:health -- RELIANCE');const dir=path.join(process.cwd(),'research',ticker);const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;const r=buildSourceHealth(m);await writeFile(path.join(dir,'source-health.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
