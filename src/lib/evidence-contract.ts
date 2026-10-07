import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { writeText } from './fs.js';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';
import { artifactById, cleanText, findKeyDeep, findLabeledNumber, findLabelValue, getText, numberValue, readJson, type CanonicalValue } from './canonical.js';

function add(list: CanonicalValue[], item: CanonicalValue | null) {
  if (!item) return;
  if (item.value === null || item.value === undefined || item.value === '' || item.value === 'not_verified') return;
  list.push(item);
}

function sourceMeta(manifest: ResearchManifest, ids: string[]): SourceArtifact | undefined {
  return artifactById(manifest, ids);
}

function sourceFact(args: Omit<CanonicalValue, 'evidenceRole'|'method'|'confidence'> & {method?: 'source_extraction'; confidence?: CanonicalValue['confidence']}): CanonicalValue {
  return { ...args, evidenceRole: 'source_fact', method: args.method ?? 'source_extraction', confidence: args.confidence ?? 'high' } as CanonicalValue;
}

function calculated(args: Omit<CanonicalValue, 'evidenceRole'|'method'|'confidence'> & {confidence?: CanonicalValue['confidence']}): CanonicalValue {
  return { ...args, evidenceRole: 'calculated_metric', method: 'deterministic_calculation', confidence: args.confidence ?? 'high' } as CanonicalValue;
}

function getScreenerTables(snapshot: any): any[] {
  return Array.isArray(snapshot?.tables) ? snapshot.tables : [];
}

function extractScreenerMetric(snapshot: any, labels: string[]): number | string | null {
  const tables = getScreenerTables(snapshot);
  const normalized = labels.map(x => x.toLowerCase());
  for (const table of tables) {
    const headers: string[] = Array.isArray(table?.headers) ? table.headers.map((x: any) => String(x).trim()) : [];
    for (const row of Array.isArray(table?.rows) ? table.rows : []) {
      const cells = row.map((x: any) => String(x ?? '').trim());
      for (let i = 0; i < Math.min(2, cells.length); i++) {
        const cell = cells[i].toLowerCase();
        if (normalized.some(label => cell === label || cell.includes(label))) {
          const candidates = cells.slice(i + 1);
          for (const candidate of candidates) {
            const n = numberValue(candidate);
            if (n !== null) return n;
            if (candidate) return candidate;
          }
        }
      }
    }
    // Some snapshots expose headers and a single data row.
    if (headers.length && Array.isArray(table?.rows?.[0])) {
      const row = table.rows[0].map((x: any) => String(x ?? '').trim());
      for (const label of normalized) {
        const idx = headers.findIndex((h: string) => h.toLowerCase().includes(label));
        if (idx >= 0 && row[idx]) return numberValue(row[idx]) ?? row[idx];
      }
    }
  }
  const text = getText(snapshot);
  for (const label of labels) {
    const n = findLabeledNumber(text, [label]);
    if (n !== null) return n;
    const t = findLabelValue(text, [label]);
    if (t) return t;
  }
  return null;
}

function extractScreenerCompany(snapshot: any): string | null {
  const title = cleanText(snapshot?.text?.split(/\n/)[0]) ?? cleanText(snapshot?.title);
  if (title && !/screener|screeners/i.test(title)) return title;
  return cleanText(findKeyDeep(snapshot, ['companyName', 'company_name', 'name'])) as string | null;
}

function extractTijoriMetric(snapshot: any, labels: string[]): number | string | null {
  const text = getText(snapshot);
  for (const label of labels) {
    const n = findLabeledNumber(text, [label]);
    if (n !== null) return n;
    const t = findLabelValue(text, [label]);
    if (t) return t;
  }
  const v = findKeyDeep(snapshot, labels);
  return numberValue(v) ?? cleanText(v);
}

function extractBseMetric(snapshot: any, labels: string[]): number | string | null {
  const text = getText(snapshot);
  for (const label of labels) {
    const n = findLabeledNumber(text, [label]);
    if (n !== null) return n;
    const t = findLabelValue(text, [label]);
    if (t) return t;
  }
  const v = findKeyDeep(snapshot, labels);
  return numberValue(v) ?? cleanText(v);
}

function parseDate(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  let m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function getHistoricalQualityPath(researchDir: string) {
  return path.join(researchDir, 'raw', 'nse-api', 'historical-quality.json');
}

async function buildContract(researchDir: string, manifest: ResearchManifest) {
  const facts: CanonicalValue[] = [];
  const metrics: CanonicalValue[] = [];
  const sourceEvidence: CanonicalValue[] = [];
  const quality: CanonicalValue[] = [];
  const conflicts: any[] = [];
  const warnings: any[] = [];

  // NSE quote facts
  const quote = sourceMeta(manifest, ['nse-api-symbol-data', 'nse-api-quote-nextapi-fallback', 'nse-api-quote']);
  const quoteData = quote?.localPath ? await readJson(quote.localPath) : null;
  const quoteFields: Array<[string,string[],string]> = [
    ['last_price',['lastPrice','lastprice','LTP','ltp','last','closePrice'],'price'],
    ['previous_close',['previousClose','prevClose','PREV_CLOSE','basePrice'],'price'],
    ['open',['open','OPEN'],'price'],
    ['day_high',['dayHigh','HIGH','high'],'price'],
    ['day_low',['dayLow','LOW','low'],'price'],
    ['52w_high',['52WeekHigh','week52High','high52','52W_High'],'price'],
    ['52w_low',['52WeekLow','week52Low','low52','52W_Low'],'price'],
    ['volume',['tradedVolume','volume','VOLUME','totalTradedVolume','quantitytraded'],'shares'],
  ];
  for (const [field, keys, unit] of quoteFields) {
    const value = numberValue(findKeyDeep(quoteData, keys));
    add(facts, value === null ? null : sourceFact({id:`nse-${field}`,field,value,unit,source:'NSE',sourceArtifact:quote?.id,evidencePath:quote?.localPath,sourceUrl:quote?.url,verified:true,asOf:quote?.retrievedAt ?? null,note:quote?.status==='ok_with_fallback'?'Primary quote route unavailable; fallback supplied this value.':undefined}));
  }

  // Canonical NSE NextApi symbol-data/meta/yearwise/chart evidence.
  const symbolDataArtifact = sourceMeta(manifest, ['nse-api-symbol-data']);
  const symbolData = symbolDataArtifact?.localPath ? await readJson(symbolDataArtifact.localPath) : null;
  if (symbolData) {
    const root = symbolData?.equityResponse?.[0] ?? symbolData;
    const meta = root?.metaData ?? root?.metadata ?? {};
    const trade = root?.tradeInfo ?? {};
    const price = root?.priceInfo ?? {};
    const sec = root?.secInfo ?? {};
    const nextFields: Array<[string, any, string]> = [
      ['average_price', meta.averagePrice, 'price'], ['percent_change', meta.pChange, '%'],
      ['turnover', trade.totalTradedValue, 'INR'], ['market_cap', trade.totalMarketCap, 'INR'],
      ['delivery_quantity', trade.deliveryquantity, 'shares'], ['delivery_percent', trade.deliveryToTradedQuantity, '%'],
      ['52w_high', price.yearHigh, 'price'], ['52w_low', price.yearLow, 'price'],
      ['sector_pe', sec.pdSectorPe, 'x'], ['symbol_pe', sec.pdSymbolPe, 'x'],
    ];
    for (const [field,value,unit] of nextFields) { const n=numberValue(value); add(facts, n===null?null:sourceFact({id:`nse-nextapi-${field}`,field,value:n,unit,source:'NSE',sourceArtifact:symbolDataArtifact?.id,evidencePath:symbolDataArtifact?.localPath,sourceUrl:symbolDataArtifact?.url,verified:true,asOf:symbolDataArtifact?.retrievedAt??null})); }
    for (const [field,value] of [['sector',sec.sector],['macro',sec.macro],['industry',sec.industryInfo],['basic_industry',sec.basicIndustry],['index',sec.index]] as const) add(facts, !value?null:sourceFact({id:`nse-sec-${field}`,field,value:String(value).trim(),unit:null,source:'NSE',sourceArtifact:symbolDataArtifact?.id,evidencePath:symbolDataArtifact?.localPath,sourceUrl:symbolDataArtifact?.url,verified:true,asOf:symbolDataArtifact?.retrievedAt??null}));
  }

  const yearwiseArtifact = sourceMeta(manifest, ['nse-api-yearwise']);
  const yearwise = yearwiseArtifact?.localPath ? await readJson(yearwiseArtifact.localPath) : null;
  for (const row of Array.isArray(yearwise)?yearwise:[]) {
    if (typeof row?.stockChangePct === 'number') add(facts, sourceFact({id:`nse-return-${row.period}`,field:`return_${row.period}`,value:row.stockChangePct,unit:'%',period:row.period,source:'NSE',sourceArtifact:yearwiseArtifact?.id,evidencePath:yearwiseArtifact?.localPath,sourceUrl:yearwiseArtifact?.url,verified:true,asOf:yearwiseArtifact?.retrievedAt??null}));
    if (typeof row?.indexChangePct === 'number') add(facts, sourceFact({id:`nse-benchmark-${row.period}`,field:`benchmark_return_${row.period}`,value:row.indexChangePct,unit:'%',period:row.period,source:'NSE',sourceArtifact:yearwiseArtifact?.id,evidencePath:yearwiseArtifact?.localPath,sourceUrl:yearwiseArtifact?.url,verified:true,asOf:yearwiseArtifact?.retrievedAt??null}));
  }
  const chartArtifact = sourceMeta(manifest, ['nse-api-symbol-chart-1d']);
  const chartData = chartArtifact?.localPath ? await readJson(chartArtifact.localPath) : null;
  const chartRows = Array.isArray(chartData)?chartData:[];
  if(chartRows.length){ add(facts, sourceFact({id:'nse-chart-1d-points',field:'intraday_1d_point_count',value:chartRows.length,unit:'points',source:'NSE',sourceArtifact:chartArtifact?.id,evidencePath:chartArtifact?.localPath,sourceUrl:chartArtifact?.url,verified:true,asOf:chartArtifact?.retrievedAt??null})); }

  // NSE financial-results: preserve useful numeric cells by period when possible.
  const financial = sourceMeta(manifest, ['nse-api-financial-results']);
  const financialData = financial?.localPath ? await readJson(financial.localPath) : null;
  const resultRows = Array.isArray(financialData?.resCmpData) ? financialData.resCmpData : [];
  for (let i=0; i<resultRows.length; i++) {
    const row = resultRows[i];
    const period = cleanText(findKeyDeep(row, ['period','Period','date','Date','quarter','Quarter'])) ?? `row_${i+1}`;
    for (const [field, keys, unit] of [
      ['revenue',['revenue','sales','totalIncome','income'],'INR'],
      ['profit',['profit','netProfit','PAT','profitAfterTax'],'INR'],
      ['eps',['eps','EPS','earningsPerShare'],'INR/share'],
    ] as const) {
      const value = numberValue(findKeyDeep(row, keys));
      if (value !== null) add(facts, sourceFact({id:`nse-financial-${field}-${i+1}`,field,value,unit,period,source:'NSE',sourceArtifact:financial?.id,evidencePath:financial?.localPath,sourceUrl:financial?.url,verified:true,asOf:financial?.retrievedAt ?? null,confidence:'medium'}));
    }
  }

  // Screener actual scalar values.
  const screenerArtifact = sourceMeta(manifest, ['screener-fundamental-snapshot']);
  const screener = screenerArtifact?.localPath ? await readJson(screenerArtifact.localPath) : null;
  const screenerFields: Array<[string,string[],string]> = [
    ['company_name',['company name','companyName','name'],'text'],
    ['market_cap',['market cap','market capitalization'],'INR crore'],
    ['current_price',['current price','price'],'price'],
    ['pe_ratio',['P/E','PE','price to earnings'],'x'],
    ['book_value',['book value','BV'],'INR/share'],
    ['dividend_yield',['dividend yield','dividend'],'%'],
    ['roce',['ROCE','return on capital employed'],'%'],
    ['roe',['ROE','return on equity'],'%'],
    ['debt',['debt','total debt'],'INR crore'],
    ['sales_growth',['sales growth','sales growth %'],'%'],
    ['profit_growth',['profit growth','profit growth %'],'%'],
  ];
  for (const [field, labels, unit] of screenerFields) {
    let value = extractScreenerMetric(screener, labels);
    if (field === 'company_name' && (value === null || typeof value === 'number')) value = extractScreenerCompany(screener);
    add(facts, value === null ? null : sourceFact({id:`screener-${field}`,field,value,unit:unit==='text'?null:unit,source:'Screener',sourceArtifact:screenerArtifact?.id,evidencePath:screenerArtifact?.localPath,sourceUrl:screenerArtifact?.url,verified:true,asOf:screener?.capturedAt ?? screenerArtifact?.retrievedAt ?? null,confidence:'high'}));
  }

  // Tijori actual scalar values where deterministically exposed.
  const tijoriArtifact = sourceMeta(manifest, ['tijori-financial-context']);
  const tijori = tijoriArtifact?.localPath ? await readJson(tijoriArtifact.localPath) : null;
  for (const [field, labels, unit] of [
    ['tijori_pe',['P/E','PE'],'x'],
    ['tijori_roce',['ROCE'],'%'],
    ['tijori_roe',['ROE'],'%'],
    ['tijori_market_cap',['market cap','market capitalization'],'INR crore'],
    ['tijori_current_price',['current price','price'],'price'],
  ] as const) {
    const value = extractTijoriMetric(tijori, labels);
    add(facts, value === null ? null : sourceFact({id:`tijori-${field}`,field,value,unit,source:'Tijori',sourceArtifact:tijoriArtifact?.id,evidencePath:tijoriArtifact?.localPath,sourceUrl:tijoriArtifact?.url,verified:true,asOf:tijori?.capturedAt ?? tijoriArtifact?.retrievedAt ?? null,confidence:'medium'}));
  }

  // Cross-source price conflict detection using actual numeric values.
  const priceCandidates = facts.filter(x => ['last_price','current_price'].includes(x.field) && typeof x.value === 'number');
  if (priceCandidates.length >= 2) {
    const max = Math.max(...priceCandidates.map(x => Number(x.value)));
    const min = Math.min(...priceCandidates.map(x => Number(x.value)));
    const spread = max - min;
    const base = min || 1;
    const spreadPct = spread / base * 100;
    if (spreadPct > 1) {
      conflicts.push({id:'conflict-current-price',kind:'conflict',field:'current_price',values:priceCandidates,numericSpread:spread,spreadPercent:spreadPct,method:'cross_source_comparison',resolution:'unresolved',note:'Cross-source prices differ by more than 1%; final analysis must prefer the freshest timestamp and explain the difference.'});
    }
  }

  // Conflicts for obvious source identity disagreements.
  const identity = facts.filter(x => /company_name$/.test(x.field) && typeof x.value === 'string');
  if (identity.length > 1) {
    const normalized = new Set(identity.map(x => String(x.value).toLowerCase().replace(/\b(limited|ltd|india)\b/g,'').replace(/[^a-z0-9]/g,'')));
    if (normalized.size > 1) conflicts.push({id:'conflict-company-identity',kind:'conflict',field:'company_name',values:identity,method:'cross_source_comparison',resolution:'unresolved'});
  }

  // Source warnings: classify fallbacks/delegation as informational.
  const sh = await readJson(path.join(researchDir,'source-health.json'));
  for (const [source, raw] of Object.entries(sh?.sources ?? {})) {
    const s = raw as any;
    for (const message of s.warningDetails ?? []) {
      const informational = Boolean((s.fallbackDetails ?? []).includes(message) || (s.delegatedWarningDetails ?? []).includes(message));
      warnings.push({id:`warning-${source}-${warnings.length+1}`,kind:'warning',field:'source_warning',value:message,source,method:'pipeline_status',verified:true,severity:informational?'informational':'actionable'});
    }
  }

  // Supplement the legacy extraction with the v1.37 individual-stock canonical values.
  const canonicalFile = path.join(researchDir,'normalized','canonical-values.json');
  const canonicalData = await readJson(canonicalFile);
  if(canonicalData){
    const existing = new Set([...facts,...metrics].map(x=>`${x.field}|${x.source}|${x.id}`));
    for(const item of Array.isArray(canonicalData.facts)?canonicalData.facts:[]) {
      if(item?.value===null||item?.value===undefined||item?.value==='') continue;
      const key=`${item.field}|${item.source}|${item.id}`;
      if(!existing.has(key)) { facts.push(item as CanonicalValue); existing.add(key); }
    }
    for(const item of Array.isArray(canonicalData.calculatedMetrics)?canonicalData.calculatedMetrics:[]) {
      if(item?.value===null||item?.value===undefined||item?.value==='') continue;
      const key=`${item.field}|${item.source}|${item.id}`;
      if(!existing.has(key)) { metrics.push(item as CanonicalValue); existing.add(key); }
    }
  }

  // Provenance completeness check.
  for (const e of [...facts,...metrics]) {
    if (!e.sourceArtifact || !e.evidencePath || !e.asOf) quality.push({id:`provenance-${e.id}`,evidenceRole:'quality_signal',field:`provenance_${e.field}`,value:'incomplete',unit:null,source:e.source,sourceArtifact:e.sourceArtifact,method:'source_extraction',verified:false,evidencePath:e.evidencePath ?? null,asOf:e.asOf ?? null,confidence:'low',note:'Important canonical value is missing one or more provenance fields.'});
  }

  const values = [...facts,...metrics];
  const sourceCounts: Record<string, number> = {};
  for (const e of values) sourceCounts[e.source] = (sourceCounts[e.source] ?? 0) + 1;

  return {
    schema_version:'1.0', ticker:manifest.ticker, generatedAt:new Date().toISOString(), deterministic:true, llmUsed:false,
    sections:{
      FACTS:facts,
      CALCULATED_METRICS:metrics,
      SOURCE_EVIDENCE:sourceEvidence,
      DATA_QUALITY:quality,
      CONFLICTS:conflicts,
      WARNINGS:warnings,
    },
    summary:{factCount:facts.length,calculatedMetricCount:metrics.length,sourceEvidenceCount:sourceEvidence.length,qualitySignalCount:quality.length,conflictCount:conflicts.length,warningCount:warnings.length},
    sourceCounts,
    rules:{
      sourceDerivedVsCalculated:'Observed values use source_extraction; script-derived metrics use deterministic_calculation.',
      presenceIsNotValue:'Presence validation is not sufficient for canonical financial facts; important values must contain their actual value when deterministically extractable.',
      verifiedMeansDeterministicallyObservedOrCalculated:true,
      noInventedValues:true,
      fallbackWarningsInformational:true,
      delegatedEvidenceInformational:true,
      bseExcludedFromProduction:true,
    }
  };
}

export async function writeEvidenceContract(researchDir:string,manifest:ResearchManifest){
  const out=path.join(researchDir,'evidence-contract.json');
  const contract=await buildContract(researchDir,manifest);
  await writeText(out,JSON.stringify(contract,null,2));
  return {out,contract:{...contract,entryCount:(contract.sections.FACTS.length+contract.sections.CALCULATED_METRICS.length+contract.sections.SOURCE_EVIDENCE.length+contract.sections.DATA_QUALITY.length+contract.sections.CONFLICTS.length+contract.sections.WARNINGS.length)}};
}

async function main(){const ticker=process.argv[2]?.toUpperCase();if(!ticker)throw new Error('Usage: npm run evidence:contract -- RELIANCE');const dir=path.join(process.cwd(),'research',ticker);const manifest=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest;const r=await writeEvidenceContract(dir,manifest);console.log(JSON.stringify({path:r.out,entryCount:r.contract.entryCount,summary:r.contract.summary},null,2));}
if(import.meta.url===`file://${process.argv[1]?.replace(/\\/g,'/')}`)main().catch(e=>{console.error(e?.stack||e);process.exitCode=1;});
