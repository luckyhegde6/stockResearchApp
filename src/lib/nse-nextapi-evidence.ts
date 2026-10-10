import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';
import type { CanonicalValue } from './canonical.js';
import { normalizeAnnualReports, normalizeAnnouncements, normalizeBoardMeetings, normalizeFinancialRows, normalizePeers, normalizeShareholding, toFinancialFacts } from './nse-nextapi-normalizers.js';

async function readJson(file:string){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}
function arr(v:any){return Array.isArray(v)?v:[];}
function text(v:any){return String(v??'').replace(/\s+/g,' ').trim();}
function num(v:any){if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;}
function artifact(manifest:ResearchManifest, id:string){return manifest.sourceArtifacts.find(a=>a.id===id);}
function fact(id:string,field:string,value:any,unit:string|null,period:string|null,sourceArtifact:SourceArtifact|undefined,note?:string):CanonicalValue{return {id,evidenceRole:'source_fact',field,value,unit,period,source:'NSE India API',sourceArtifact:sourceArtifact?.id,method:'source_extraction',verified:true,asOf:sourceArtifact?.retrievedAt??null,evidencePath:sourceArtifact?.localPath??null,sourceUrl:sourceArtifact?.url??null,confidence:'high',note};}

export async function addNseNextApiEvidence(researchDir:string,manifest:ResearchManifest,facts:CanonicalValue[]) {
  const base=path.join(researchDir,'raw','nse-api','nextapi');
  const summary:any={financialPeriods:0,announcements:0,boardMeetings:0,corporateActions:0,eventCalendar:0,shareholdingValues:0,peerRows:0,annualReports:0};
  const finSpecs=[['financial-status','financial-status.json'],['financial-result-data','financial-result-data.json']] as const;
  for(const [id,file] of finSpecs){
    const raw=await readJson(path.join(base,'financials',file)); if(!raw) continue;
    const rows=normalizeFinancialRows(raw); summary.financialPeriods += rows.length;
    facts.push(...toFinancialFacts(rows,`nse-nextapi-${id}`,new Date().toISOString()));
  }
  const finStatus=await readJson(path.join(base,'financials','financial-status.json')); const finStatusRows=normalizeFinancialRows(finStatus);
  const finArtifact=artifact(manifest,'nse-nextapi-financial-status');
  for(const r of finStatusRows){ const p=r.period??r.toDate; const data:[string,any,string][]=[['total_income',r.totalIncome,'INR lakh'],['expenditure',r.expenditure,'INR lakh'],['profit_before_tax',r.profitBeforeTax,'INR lakh'],['profit_after_tax',r.profitAfterTax,'INR lakh'],['eps',r.eps,'INR/share']]; for(const [f,v,u] of data) if(v!==null) facts.push(fact(`nse-financial-status-${f}-${p}`,f,v,u,p,finArtifact)); }

  const results=await readJson(path.join(base,'financials','financial-result-data.json')); const resultRows=normalizeFinancialRows(results); const resultArtifact=artifact(manifest,'nse-nextapi-financial-result-data');
  for(const r of resultRows){ const p=r.period??r.toDate; if(r.eps!==null) facts.push(fact(`nse-financial-result-eps-${p}`,'eps',r.eps,'INR/share',p,resultArtifact)); }

  const ann=await readJson(path.join(base,'corporate','corporate-announcements-nextapi.json')); const annRows=normalizeAnnouncements(ann); const annArtifact=artifact(manifest,'nse-nextapi-corporate-announcements'); summary.announcements=annRows.length;
  for(const r of annRows.slice(0,250)) facts.push(fact(`nse-announcement-${r.date||'na'}-${summary.announcements}`,'corporate_announcement',{subject:r.subject,date:r.date,text:r.text,attachment:r.attachment},null,r.date,annArtifact));

  const board=await readJson(path.join(base,'corporate','board-meetings.json')); const boardRows=normalizeBoardMeetings(board); const boardArtifact=artifact(manifest,'nse-nextapi-board-meetings'); summary.boardMeetings=boardRows.length;
  for(const r of boardRows.slice(0,100)) facts.push(fact(`nse-board-meeting-${r.meetingDate||'na'}-${r.sequenceId||summary.boardMeetings}`,'board_meeting',{meetingDate:r.meetingDate,purpose:r.purpose,announcedAt:r.announcedAt,attachment:r.attachment},null,r.meetingDate,boardArtifact));

  const actions=await readJson(path.join(base,'corporate','corporate-actions-nextapi.json')); const actionRows=Array.isArray(actions)?actions:arr(actions?.data); const actionArtifact=artifact(manifest,'nse-nextapi-corporate-actions'); summary.corporateActions=actionRows.length;
  for(const r of actionRows.slice(0,100)) facts.push(fact(`nse-corp-action-${text(r?.exDate)||'na'}-${text(r?.subject)||'na'}`,'corporate_action',{subject:text(r?.subject),exDate:text(r?.exDate),recDate:text(r?.recDate),faceValue:num(r?.faceVal),symbol:text(r?.symbol)},null,text(r?.exDate),actionArtifact));

  const calendar=await readJson(path.join(base,'corporate','event-calendar.json')); const calRows=arr(calendar?.data ?? calendar); const calArtifact=artifact(manifest,'nse-nextapi-event-calendar'); summary.eventCalendar=calRows.length;
  for(const r of calRows.slice(0,100)) facts.push(fact(`nse-event-${text(r?.date||r?.eventDate)||'na'}-${text(r?.event||r?.title||r?.purpose)||'na'}`,'corporate_event',{date:r?.date??r?.eventDate,event:r?.event??r?.title??r?.purpose,raw:r},null,text(r?.date||r?.eventDate),calArtifact));

  const sh=await readJson(path.join(base,'ownership','shareholding-pattern-nextapi.json')); const shNorm=sh?normalizeShareholding(sh):null; const shArtifact=artifact(manifest,'nse-nextapi-shareholding-pattern');
  if(shNorm){ for(const [k,v] of Object.entries(shNorm.extracted)) if(v!==null) { facts.push(fact(`nse-nextapi-${k}`,k,v,'%',shNorm.asOf,shArtifact,'Extracted from NSE NextApi shareholding pattern.')); summary.shareholdingValues++; } }

  const annual=await readJson(path.join(base,'annual_reports','annual-reports-index.json')); const annualRows=normalizeAnnualReports(annual); const annualArtifact=artifact(manifest,'nse-nextapi-annual-reports-index'); summary.annualReports=annualRows.length;
  for(const r of annualRows.slice(0,10)) facts.push(fact(`nse-annual-report-${r.fromYear}-${r.toYear}`,'annual_report',{fromYear:r.fromYear,toYear:r.toYear,fileName:r.fileName,fileSize:r.fileSize,broadcastAt:r.broadcastAt},null,r.toYear,annualArtifact));

  const peers=await readJson(path.join(base,'peers','peer-comparison.json')); const peerRows=normalizePeers(peers); const peerArtifact=artifact(manifest,'nse-nextapi-peer-comparison'); summary.peerRows=peerRows.length;
  for(const r of peerRows.slice(0,50)) { if(r.symbol===manifest.ticker){ for(const [f,v,u] of [['peer_market_cap',r.marketCap,'INR'],['peer_ltp',r.ltp,'price'],['peer_eps',r.eps,'INR/share'],['peer_pe',r.pe,'x'],['peer_pat',r.pat,'INR lakh'],['peer_total_income',r.totalIncome,'INR lakh'],['peer_promoter_holding',r.promoterHolding,'%'],['peer_pchange',r.pChange,'%']] as const) if(v!==null) facts.push(fact(`nse-peer-${f}`,f,v,u,null,peerArtifact)); } }

  return summary;
}
