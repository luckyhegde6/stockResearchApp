import type { CanonicalValue } from './canonical.js';

export interface NseFinancialPeriod {
  fromDate: string | null;
  toDate: string | null;
  period: string | null;
  expenditure: number | null;
  totalIncome: number | null;
  ebit: number | null;
  profitBeforeTax: number | null;
  profitAfterTax: number | null;
  eps: number | null;
  audited: string | null;
  consolidated: string | null;
  cumulative: string | null;
  broadcastAt: string | null;
}

export interface NseOwnershipSnapshot {
  asOf: string | null;
  rows: any[];
  extracted: Record<string, number | null>;
}

export interface NsePeerRow {
  symbol: string | null;
  series: string | null;
  marketCap: number | null;
  value: number | null;
  volume: number | null;
  eps: number | null;
  ltp: number | null;
  pat: number | null;
  pe: number | null;
  debtEqRatio: number | null;
  promoterHolding: number | null;
  totalIncome: number | null;
  pChange: number | null;
}

function clean(v: unknown): string | null { const s = String(v ?? '').replace(/\s+/g,' ').trim(); return s || null; }
function num(v: unknown): number | null { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/,/g,'')); return Number.isFinite(n) ? n : null; }
function arr(v: unknown): any[] { return Array.isArray(v) ? v : []; }
function rootArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  for (const key of ['data','result','equityResponse','rows','results','items','records','events','shareholding','shareholdingData']) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  if (raw && typeof raw === 'object') {
    for (const value of Object.values(raw)) if (Array.isArray(value) && value.length && value.every(x => x == null || typeof x === 'object')) return value as any[];
  }
  return [];
}

export function normalizeFinancialRows(raw: any): NseFinancialPeriod[] {
  return rootArray(raw).map((r:any) => ({
    fromDate: clean(r.from_date ?? r.fromDate),
    toDate: clean(r.to_date ?? r.toDate),
    period: clean(r.to_date_MonYr ?? r.period),
    expenditure: num(r.expenditure),
    totalIncome: num(r.totalIncome ?? r.total_income),
    ebit: num(r.reProLossBefTax ?? r.ebit),
    profitBeforeTax: num(r.reProLossBefTax ?? r.profitBeforeTax),
    profitAfterTax: num(r.netProLossAftTax ?? r.profitAfterTax ?? r.pat),
    eps: num(r.eps),
    audited: clean(r.audited),
    consolidated: clean(r.consolidated),
    cumulative: clean(r.cumulative),
    broadcastAt: clean(r.re_broadcast_timestamp ?? r.broadcast_dttm),
  })).filter((r:any) => r.toDate || r.period || r.totalIncome !== null || r.eps !== null);
}

function flattenObjects(v:any, out:any[]=[]):any[] {
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { for (const x of v) flattenObjects(x,out); return out; }
  out.push(v); for (const x of Object.values(v)) flattenObjects(x,out); return out;
}

export function normalizeShareholding(raw:any): NseOwnershipSnapshot {
  const rows = flattenObjects(raw).filter(r => Object.keys(r).some(k => /promoter|public|fii|dii|holding|share/i.test(k)));
  const extracted:Record<string,number|null> = { promoterHolding:null, fiiHolding:null, diiHolding:null, publicHolding:null, promoterPledge:null };
  const patterns:Record<string,RegExp[]> = {
    promoterHolding:[/promoter.*holding/i,/promoter.*percentage/i,/promoterandpromotergroup/i],
    fiiHolding:[/fii.*holding/i,/foreign.*institutional/i],
    diiHolding:[/dii.*holding/i,/domestic.*institutional/i],
    publicHolding:[/public.*holding/i,/non.*promoter.*holding/i],
    promoterPledge:[/pledge/i,/encumbrance/i]
  };
  for (const row of rows) for (const [field, pats] of Object.entries(patterns)) if (extracted[field] === null) {
    const k = Object.keys(row).find(k => pats.some(re => re.test(k)));
    if (k) extracted[field] = num(row[k]);
  }
  const joined = JSON.stringify(raw);
  for (const [field,pats] of Object.entries(patterns)) if (extracted[field] === null) {
    const m = joined.match(new RegExp(`(?:${pats.map(x=>x.source).join('|')})[^0-9-]{0,80}(-?\\d+(?:\\.\\d+)?)`, 'i'));
    if (m) extracted[field] = num(m[1]);
  }
  return { asOf: clean((rows[0] as any)?.asOf ?? (rows[0] as any)?.date ?? (rows[0] as any)?.quarter), rows, extracted };
}

export function normalizePeers(raw:any): NsePeerRow[] {
  return rootArray(raw).map((r:any)=>({
    symbol:clean(r.symbol), series:clean(r.series), marketCap:num(r.marketCap), value:num(r.value), volume:num(r.volume), eps:num(r.eps), ltp:num(r.ltp), pat:num(r.pat), pe:num(r.pe), debtEqRatio:num(r.debtEqRatio), promoterHolding:num(r.promoterHolding), totalIncome:num(r.totalIncome), pChange:num(r.PChange ?? r.pChange)
  })).filter(r=>r.symbol);
}

export function normalizeAnnualReports(raw:any): any[] {
  return rootArray(raw).map((r:any)=>({
    companyName:clean(r.companyName), fromYear:clean(r.fromYr), toYear:clean(r.toYr), submissionType:clean(r.submission_type), broadcastAt:clean(r.broadcast_dttm), disseminationAt:clean(r.disseminationDateTime), fileName:clean(r.fileName), fileSize:clean(r.attFileSize ?? r.fileSize)
  })).filter(r=>r.fileName);
}

export function normalizeAnnouncements(raw:any): any[] {
  return rootArray(raw).map((r:any)=>({
    symbol:clean(r.symbol), subject:clean(r.desc ?? r.subject), date:clean(r.an_dt ?? r.sort_date ?? r.dt), text:clean(r.attchmntText ?? r.description), attachment:clean(r.attchmntFile ?? r.attachment), isin:clean(r.sm_isin ?? r.isin)
  })).filter(r=>r.subject || r.date || r.attachment);
}

export function normalizeBoardMeetings(raw:any): any[] {
  return rootArray(raw).map((r:any)=>({
    symbol:clean(r.bm_symbol ?? r.symbol), meetingDate:clean(r.bm_date ?? r.date ?? r.bm_dt), purpose:clean(r.bm_desc ?? r.bm_purpose ?? r.desc), announcedAt:clean(r.bm_timestamp_full ?? r.bm_timestamp), attachment:clean(r.bm_attachment ?? r.attachment), sequenceId:clean(r.bm_an_seq_id)
  })).filter(r=>r.meetingDate || r.purpose);
}

export function toFinancialFacts(rows:NseFinancialPeriod[], artifactId:string, retrievedAt:string): CanonicalValue[] {
  const facts:CanonicalValue[]=[];
  for(const r of rows) {
    const period=r.period ?? r.toDate;
    const fields:[string,number|null,string][] = [
      ['total_income',r.totalIncome,'INR lakh'],['expenditure',r.expenditure,'INR lakh'],['profit_before_tax',r.profitBeforeTax,'INR lakh'],['profit_after_tax',r.profitAfterTax,'INR lakh'],['eps',r.eps,'INR/share']
    ];
    for(const [field,value,unit] of fields) if(value!==null) facts.push({id:`nse-${field}-${period}`,evidenceRole:'source_fact',field,value,unit,period,source:'NSE India API',sourceArtifact:artifactId,method:'source_extraction',verified:true,asOf:r.broadcastAt??retrievedAt,evidencePath:null,sourceUrl:null,confidence:'high'});
  }
  return facts;
}
