import 'dotenv/config';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { runNse } from './adapters/nse.js';
import { runScreener } from './adapters/screener.js';
import { runTijori } from './adapters/tijori.js';
import { runChartink } from './adapters/chartink.js';
import { runTradingView } from './adapters/tradingview.js';
import { runTradingViewSymbolSnapshot } from './adapters/tradingview-symbol-snapshot.js';
import { runNewsSentiment } from './adapters/news-sentiment.js';
import { ensureDir, resetDir, readText, writeText } from './lib/fs.js';
import { ingestResearch } from './lib/ingest.js';
import { writeManifest } from './lib/manifest.js';
import { buildAnalysisPrompt } from './lib/prompt.js';
import { runLlmAnalysis } from './lib/llm.js';
import { analysisSchema } from './schema.js';
import type { ResearchManifest, SourceArtifact } from './types/research.js';
import { DebugLogger } from './lib/debug.js';
import { writeSourceHealth } from './lib/source-health.js';
import { writeEvidenceQuality } from './lib/evidence-quality.js';
import { writeTechnicalNormalized } from './lib/technical-normalizer.js';
import { writeEvidenceContract } from './lib/evidence-contract.js';
import { writeEvidenceBundle } from './lib/evidence-bundle.js';
import { writeCanonicalFinancialTables } from './lib/canonical-financials.js';
import { runScreenerMarketScreens } from './adapters/screener-market-screens.js';
import { runTijoriMarketScreens } from './adapters/tijori-market-screens.js';
import { runNseMarketUniverse } from './adapters/nse-market-universe.js';
import { writeAnalysisReadiness } from './lib/analysis-readiness.js';
import { runChartinkTop20 } from './lib/chartink-top20.js';
import { runChartinkMarketScans } from './lib/chartink-market-scans.js';
import { runNse52WeekHigh } from './adapters/nse-52week-high.js';
import { writeIndividualStockEvidence } from './lib/individual-stock-evidence.js';
import { writeMarketScanQuality } from './lib/market-scan-quality.js';
import { writeAnalysisInputs } from './lib/analysis-inputs.js';
import { writeAnalysisEvidencePack } from './lib/analysis-evidence-pack.js';

import { loadNseEquityUniverse, resolveNseSecurity } from './lib/nse-securities.js';
import { RESEARCH_CONFIG, featureSummary, normalizeSymbolInput } from './lib/research-config.js';
import { classifyProvider } from './lib/source-classifier.js';
import { publishAfterPipelineRun, runGoogleSheetsExport } from './lib/google-sheets-publish.js';

const ROOT = process.cwd();

async function publishDatasetFile(kind: 'chartinkScan' | 'nse52w' | 'screenerScan' | 'tijoriScan', filePath: string) {
  const result = await runGoogleSheetsExport(kind, undefined, {
    root: ROOT,
    file: path.relative(ROOT, filePath),
    trigger: 'cli',
    automatic: true,
  });
  if (result.status === 'failed') {
    console.warn(`[sheets] Dataset ${kind} was not published: ${result.error || result.message}`);
  }
}
const SKILL = path.join(ROOT, 'skills', 'stock-analysis', 'SKILL.md');
const PROMPT = path.join(ROOT, 'skills', 'stock-analysis', 'ANALYSIS_PROMPT.md');

async function tickerArg() {
  const values = process.argv.slice(3).filter(v => !v.startsWith('--'));
  if (!values[0]) throw new Error('Usage: npm run research -- SYMBOL | npm run analyze -- SYMBOL');
  const raw = values[0].trim();
  const normalized = normalizeSymbolInput(raw);
  const universe = await loadNseEquityUniverse(ROOT);
  const resolved = resolveNseSecurity(normalized, universe);
  if (!resolved.record) {
    const suggestions = resolved.suggestions.map(s => `${s.symbol} (${s.companyName})`).join(', ');
    throw new Error(`Unknown NSE security/company: ${raw}${suggestions ? `. Suggestions: ${suggestions}` : ''}`);
  }
  if (!resolved.record.preferredForStockResearch) {
    throw new Error(`NSE symbol ${resolved.record.symbol} is series ${resolved.record.series}; individual stock research requires EQ series.`);
  }
  return resolved.record.symbol;
}

function hasFlag(name: string) { return process.argv.includes(name); }

function debugPaths(researchDir: string) {
  const d = path.join(researchDir, 'debug');
  return {
    debugJson: path.join(d, 'acquisition-debug.json'),
    debugJsonl: path.join(d, 'acquisition-debug.jsonl'),
    timeline: path.join(d, 'acquisition-timeline.txt'),
  };
}

async function acquire(ticker: string) {
  const researchDir = path.join(ROOT, 'research', ticker);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${ticker.toLowerCase()}`;
  await resetDir(researchDir);
  await ensureDir(path.join(researchDir, 'raw'));
  await ensureDir(path.join(researchDir, 'derived'));
  await ensureDir(path.join(researchDir, 'markdown'));
  await ensureDir(path.join(researchDir, 'screenshots'));

  const securityUniverse = await loadNseEquityUniverse(ROOT);
  const resolvedSecurity = resolveNseSecurity(ticker, securityUniverse);
  const security = resolvedSecurity.record;
  const ctx = { ticker, researchDir, companyName: security?.companyName, isin: security?.isin };
  await writeText(path.join(researchDir, 'run-context.json'), JSON.stringify({
    schema_version: '1.0',
    runId,
    input: process.argv.slice(3).find(v => !v.startsWith('--')) ?? ticker,
    normalizedSymbol: ticker,
    exchange: 'NSE',
    instrumentType: 'equity',
    security: security ?? null,
    features: featureSummary(),
    sourcePolicy: {
      core: ['NSE', 'Screener', 'Tijori', 'TradingView'],
      optional: ['Chartink'],
      excluded: ['BSE'],
    },
    generatedAt: new Date().toISOString(),
    deterministic: true,
    llmUsed: false,
  }, null, 2));
  const debug = new DebugLogger(path.join(researchDir, 'debug'), process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({
    ticker,
    adapter: 'FULL',
    node: process.version,
    cwd: ROOT,
    researchDir,
    runId,
    rawInput: process.argv.slice(3).find(v => !v.startsWith('--')) ?? ticker,
    normalizedSymbol: ticker,
    exchange: 'NSE',
    features: featureSummary(),
  });
  let artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const adapters: Array<[string, (ctx: any) => Promise<any>]> = [
    ['NSE', runNse],
    ['Screener', runScreener],
    ['Tijori', runTijori],
    ['TradingView', runTradingView],
    ['TradingView Snapshot', runTradingViewSymbolSnapshot],
    ['News', runNewsSentiment],
    ...(RESEARCH_CONFIG.chartinkEnabled ? [['Chartink', runChartink] as [string, (ctx: any) => Promise<any>]] : []),
  ];

  const expectedSources = ['NSE', 'Screener', 'Tijori', 'TradingView', 'News', 'Chartink'];
  await ensureDir(path.join(researchDir, 'debug', 'sources'));

  for (const [name, fn] of adapters) {
    const t0 = Date.now();
    const sourceDir = path.join(researchDir, 'debug', 'sources', name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    await ensureDir(sourceDir);
    await debug.emit(`SOURCE/${name}`, 'START', `${name} adapter started`, {
      enabled: name !== 'Chartink' || RESEARCH_CONFIG.chartinkEnabled,
      researchRole: name === 'Chartink' ? 'optional-screening' : 'core',
    });
    try {
      const r = await fn(ctx);
      artifacts.push(...r.artifacts);
      gaps.push(...(r.gaps || []));
      warnings.push(...(r.warnings || []));
      const sourceSummary = {
        source: name,
        status: r.gaps?.length ? 'partial' : (r.warnings?.length ? 'ok_with_warnings' : 'ok'),
        artifacts: r.artifacts.length,
        dataGaps: [...new Set(r.gaps || [])],
        warnings: [...new Set(r.warnings || [])],
        durationMs: Date.now() - t0,
        runId,
        ticker,
      };
      await writeText(path.join(sourceDir, 'summary.json'), JSON.stringify(sourceSummary, null, 2));
      await debug.emit(`SOURCE/${name}`, r.gaps?.length ? 'WARN' : (r.warnings?.length ? 'OK_WITH_FALLBACK' : 'OK'), `${name} adapter completed`, { artifacts: r.artifacts.length, gaps: r.gaps?.length || 0, warnings: r.warnings?.length || 0, sourceDebug: path.relative(ROOT, path.join(sourceDir, 'summary.json')) }, Date.now() - t0);
    } catch (e: any) {
      const msg = e?.message || String(e);
      warnings.push(`${name} adapter failed: ${msg}`);
      const sourceSummary = { source: name, status: 'error', artifacts: 0, dataGaps: [], warnings: [msg], durationMs: Date.now() - t0, runId, ticker };
      await writeText(path.join(sourceDir, 'summary.json'), JSON.stringify(sourceSummary, null, 2));
      await debug.emit(`SOURCE/${name}`, 'FAIL', `${name} adapter failed`, { error: msg, sourceDebug: path.relative(ROOT, path.join(sourceDir, 'summary.json')) }, Date.now() - t0);
    }
  }

  if (!RESEARCH_CONFIG.chartinkEnabled) {
    await ensureDir(path.join(researchDir, 'debug', 'sources', 'chartink'));
    await writeText(
      path.join(researchDir, 'debug', 'sources', 'chartink', 'summary.json'),
      JSON.stringify({ source: 'Chartink', status: 'skipped', enabled: false, reason: 'RESEARCH_INCLUDE_CHARTINK=false', runId, ticker }, null, 2)
    );
    await debug.emit('SOURCE/Chartink', 'SKIP', 'Chartink excluded from individual-stock research by feature flag', {
      env: 'RESEARCH_INCLUDE_CHARTINK',
      value: false,
      next: 'Use npm run chartink:scans -- all for long-lived market scans.',
    });
  }
  await debug.emit('SOURCE/VALIDATION', 'OK', 'Configured source adapters completed', {
    artifacts: artifacts.length,
    dataGaps: new Set(gaps).size,
    warnings: new Set(warnings).size,
    coreSources: ['NSE','Screener','Tijori','TradingView'],
    supplementarySources: ['News'],
    optionalSources: ['Chartink'],
    chartinkEnabled: RESEARCH_CONFIG.chartinkEnabled,
  });

  // Build an initial manifest so deterministic quality validators can inspect the acquired artifacts.
  let manifest: ResearchManifest = {
    schema_version: '1.49',
    ticker,
    companyName: ctx.companyName,
    isin: ctx.isin,
    bseScrip: ctx.bseScrip,
    runId,
    input: { raw: process.argv.slice(3).find(v => !v.startsWith('--')) ?? ticker, normalized: ticker, exchange: 'NSE', instrumentType: 'equity' },
    features: { chartinkEnabled: RESEARCH_CONFIG.chartinkEnabled },
    generatedAt: new Date().toISOString(),
    acquisitionOnly: true,
    sourceArtifacts: artifacts,
    dataGaps: [...new Set(gaps)],
    warnings: [...new Set(warnings)],
  };
  await writeManifest(researchDir, manifest);

  // Deterministic derived evidence. No LLM is involved here.
  const derivedArtifacts: SourceArtifact[] = [];
  try {
    const technicalPath = await writeTechnicalNormalized(researchDir);
    derivedArtifacts.push({
      id: 'tradingview-technical-normalized',
      type: 'derived_data',
      provider: 'script',
      title: 'Deterministic 1D technical indicators from NSE EQ history',
      localPath: technicalPath,
      retrievedAt: new Date().toISOString(),
      status: 'ok',
      method: 'script',
      notes: ['EMA50, EMA200 and RSI14 are computed from acquired NSE EQ history; not inferred by an LLM.'],
    });
  } catch (e: any) {
    warnings.push(`Technical normalization: ${e?.message || String(e)}`);
  }

  manifest.warnings = [...new Set(warnings)];
  manifest.derivedArtifacts = [...(manifest.derivedArtifacts || []).filter((a: any) => !derivedArtifacts.some(d => d.id === a.id)), ...derivedArtifacts];
  manifest.sourceArtifacts = [...manifest.sourceArtifacts.filter((a: any) => !derivedArtifacts.some(d => d.id === a.id)), ...derivedArtifacts];

  await ensureDir(path.join(researchDir, 'normalized'));
  try {
    const normalizedTables = await writeCanonicalFinancialTables(researchDir);
    manifest.sourceArtifacts.push({ id:'canonical-financial-tables', type:'derived_data', provider:'script', title:'Canonical source financial tables', localPath:normalizedTables.screener, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:['Normalized source tables/text for deterministic analysis; no LLM inference.'] });
  } catch (e:any) { warnings.push(`Canonical financial normalization: ${e?.message || String(e)}`); }

  const sourceHealthPath = await writeSourceHealth(researchDir, manifest);
  try {
    const individual = await writeIndividualStockEvidence(researchDir, manifest);
    const individualPath = path.join(researchDir,'normalized','individual-stock-evidence.json');
    manifest.sourceArtifacts.push({ id:'individual-stock-evidence', type:'derived_data', provider:'script', title:'Canonical individual-stock evidence package', localPath:individualPath, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:[`facts=${individual.facts.length}`,`calculatedMetrics=${individual.metrics.length}`,`conflicts=${individual.reconciliation.conflictCount}`, 'No LLM inference.'] });
    manifest.sourceArtifacts.push({ id:'individual-stock-reconciliation', type:'derived_data', provider:'script', title:'Cross-source individual-stock reconciliation', localPath:path.join(researchDir,'normalized','reconciliation.json'), retrievedAt:new Date().toISOString(), status:individual.reconciliation.conflictCount?'partial':'ok', method:'script', notes:[`conflicts=${individual.reconciliation.conflictCount}`] });
    const individualDerived:[string,string,string][]=[
      ['individual-identity','Canonical individual-stock identity','normalized/identity.json'],
      ['individual-market','Canonical individual-stock market facts','normalized/market.json'],
      ['individual-financials','Canonical individual-stock financial evidence','normalized/financials.json'],
      ['individual-financial-periods','Canonical period-aware financial tables','normalized/financial-periods.json'],
      ['individual-valuation','Canonical valuation evidence','normalized/valuation.json'],
      ['individual-ownership','Canonical ownership evidence','normalized/ownership.json'],
      ['individual-technicals','Canonical technical evidence','normalized/technicals.json'],
      ['individual-screening','Canonical screening evidence','normalized/screening.json'],
      ['individual-catalysts','Canonical catalyst evidence','normalized/catalysts.json'],
      ['individual-canonical-values','Canonical individual-stock values','normalized/canonical-values.json'],
      ['individual-analysis-inputs','Compact canonical analysis inputs','normalized/analysis-inputs.json'],
    ];
    for (const [id,title,rel] of individualDerived) manifest.sourceArtifacts.push({id,type:'derived_data',provider:'script',title,localPath:path.join(researchDir,rel),retrievedAt:new Date().toISOString(),status:'ok',method:'script',notes:['Deterministic individual-stock evidence; no LLM inference.']});
    await writeManifest(researchDir, manifest);
  } catch (e:any) {
    warnings.push(`Individual stock evidence: ${e?.message || String(e)}`);
  }
  const evidenceQuality = await writeEvidenceQuality(researchDir, manifest);
  manifest.sourceArtifacts.push({
    id: 'source-health', type: 'derived_data', provider: 'script', title: 'Deterministic source health report',
    localPath: sourceHealthPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Generated from adapter artifacts, gaps and warnings.']
  });
  manifest.sourceArtifacts.push({
    id: 'evidence-quality', type: 'derived_data', provider: 'script', title: 'Deterministic evidence quality report',
    localPath: evidenceQuality.out, retrievedAt: new Date().toISOString(), status: evidenceQuality.report.status === 'ok' ? 'ok' : 'partial', method: 'script', notes: ['Field-presence verification only; no model inference.']
  });
  await writeManifest(researchDir, manifest);

  const contractResult = await writeEvidenceContract(researchDir, manifest);
  manifest.sourceArtifacts.push({
    id: 'evidence-contract', type: 'derived_data', provider: 'script', title: 'Canonical deterministic evidence contract',
    localPath: contractResult.out, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script',
    notes: ['Canonical index of source-derived facts, deterministic metrics, quality, conflicts and warnings. No LLM inference.']
  });
  await writeManifest(researchDir, manifest);
  const analysisInputs = await writeAnalysisInputs(researchDir, manifest);
  manifest.sourceArtifacts.push({ id:'analysis-inputs', type:'derived_data', provider:'script', title:'Deterministic compact analysis input package', localPath:analysisInputs.out, retrievedAt:new Date().toISOString(), status:'ok', method:'script', notes:['Compact cross-source handoff for final reasoning; no LLM inference.'] });
  await writeManifest(researchDir, manifest);

  await debug.emit('SOURCE/QUALITY', evidenceQuality.report.status === 'ok' ? 'OK' : 'WARN', 'Deterministic source and evidence validation complete', {
    sourceHealth: path.relative(ROOT, sourceHealthPath), evidenceQuality: path.relative(ROOT, evidenceQuality.out),
    evidenceContract: path.relative(ROOT, contractResult.out),
    qualityStatus: evidenceQuality.report.status, checks: evidenceQuality.report.summary,
    contractEntries: contractResult.contract.entryCount
  });

  const ingestion = await ingestResearch(researchDir, manifest.sourceArtifacts);

  // Build the prompt before readiness because the prompt itself is a required LLM handoff artifact.
  const prompt = await buildAnalysisPrompt(
    SKILL,
    PROMPT,
    researchDir,
    manifest.sourceArtifacts,
    { name: ctx.companyName, ticker, isin: ctx.isin, bseScrip: ctx.bseScrip }
  );

  const evidenceBundlePath = await writeEvidenceBundle(researchDir, manifest);
  manifest.sourceArtifacts.push({
    id: 'evidence-bundle', type: 'derived_data', provider: 'script', title: 'Final deterministic evidence bundle',
    localPath: evidenceBundlePath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script',
    notes: ['Combines source health, evidence quality, canonical evidence contract and document paths. No LLM inference.']
  });
  await writeManifest(researchDir, manifest);

  // Readiness is evaluated only after prompt + bundle + all deterministic inputs exist.
  const readiness = await writeAnalysisReadiness(researchDir, manifest);
  await writeEvidenceBundle(researchDir, manifest);
  await debug.finish({ status: manifest.dataGaps.length ? 'partial' : manifest.warnings.length ? 'ok_with_fallback' : 'ok', artifacts: manifest.sourceArtifacts.length, dataGaps: manifest.dataGaps.length, warnings: manifest.warnings.length });

  // Easy-to-debug classification map: one index for every artifact grouped by provider/type/status.
  const classifiedArtifacts = manifest.sourceArtifacts.map((a:any) => ({
    id: a.id,
    provider: a.provider,
    providerClass: classifyProvider(a.provider),
    type: a.type,
    status: a.status,
    method: a.method ?? null,
    period: a.period ?? null,
    localPath: a.localPath ? path.relative(researchDir, a.localPath).replaceAll(path.sep, '/') : null,
    markdownPath: a.markdownPath ? path.relative(researchDir, a.markdownPath).replaceAll(path.sep, '/') : null,
    screenshotPath: a.screenshotPath ? path.relative(researchDir, a.screenshotPath).replaceAll(path.sep, '/') : null,
    retrievedAt: a.retrievedAt,
  }));
  const artifactIndex = {
    schema_version: '1.0',
    runId,
    ticker,
    generatedAt: new Date().toISOString(),
    sourcePolicy: {
      core: ['NSE', 'Screener', 'Tijori', 'TradingView'],
      optional: ['Chartink'],
      excluded: ['BSE'],
      chartinkEnabled: RESEARCH_CONFIG.chartinkEnabled,
    },
    counts: {
      total: classifiedArtifacts.length,
      core: classifiedArtifacts.filter(a => a.providerClass === 'core').length,
      supplementary: classifiedArtifacts.filter(a => a.providerClass === 'supplementary').length,
      optional: classifiedArtifacts.filter(a => a.providerClass === 'optional').length,
      excluded: classifiedArtifacts.filter(a => a.providerClass === 'excluded').length,
      unknown: classifiedArtifacts.filter(a => a.providerClass === 'unknown').length,
    },
    artifacts: classifiedArtifacts,
    deterministic: true,
    llmUsed: false,
  };
  await writeText(path.join(researchDir, 'debug', 'artifact-index.json'), JSON.stringify(artifactIndex, null, 2));

  const acquisitionReport = {
    status: 'acquired',
    acquisitionOnly: true,
    ticker,
    companyName: ctx.companyName,
    isin: ctx.isin,
    bseScrip: ctx.bseScrip,
    generatedAt: manifest.generatedAt,
    artifactCount: manifest.sourceArtifacts.length,
    dataGapCount: manifest.dataGaps.length,
    warningCount: manifest.warnings.length,
    features: { chartinkEnabled: RESEARCH_CONFIG.chartinkEnabled },
    runId,
    manifest: path.relative(ROOT, path.join(researchDir, 'manifest.json')),
    allEvidence: path.relative(ROOT, ingestion.allEvidence),
    structuredEvidence: path.relative(ROOT, ingestion.structuredEvidence),
    mdaEvidence: path.relative(ROOT, ingestion.mdaEvidence),
    analysisPrompt: path.relative(ROOT, prompt.out),
    evidenceContract: path.relative(ROOT, contractResult.out),
    evidenceBundle: path.relative(ROOT, evidenceBundlePath),
    debug: { ...Object.fromEntries(Object.entries(debugPaths(researchDir)).map(([k, v]) => [k, path.relative(ROOT, v)])), artifactIndex: path.relative(ROOT, path.join(researchDir, 'debug', 'artifact-index.json')) },
    nextCommand: `npm run analyze -- ${ticker}`,
  };
  await writeFile(path.join(researchDir, 'acquisition-report.json'), JSON.stringify(acquisitionReport, null, 2));

  // Optional single-command convenience: still only the final stage invokes the LLM.
  if (hasFlag('--with-market-screens')) {
    const marketRoot = path.join(ROOT, 'research', 'market-screens', 'screener');
    const market = await runScreenerMarketScreens(marketRoot);
    await debug.emit('SOURCE/SCREENER_MARKET_SCREENS', market.gaps.length ? 'WARN' : (market.warnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'Optional market-wide Screener screens collected', { root: path.relative(ROOT, marketRoot), artifacts: market.artifacts.length, dataGaps: market.gaps.length, warnings: market.warnings.length });
    await publishDatasetFile('screenerScan', path.join(marketRoot, 'index.json'));
  }

  if (hasFlag('--with-nse-market')) {
    const marketRoot = path.join(ROOT, 'research', 'market-screens', 'nse');
    const market = await runNseMarketUniverse({ root: marketRoot, ticker });
    artifacts.push(...market.artifacts);
    gaps.push(...market.gaps);
    warnings.push(...market.warnings);
    await debug.emit('SOURCE/NSE_MARKET', market.gaps.length ? 'WARN' : (market.warnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'Optional NSE market universe collected', { root: path.relative(ROOT, marketRoot), artifacts: market.artifacts.length, dataGaps: market.gaps.length, warnings: market.warnings.length });
  }

  if (hasFlag('--with-tijori-market')) {
    const marketRoot = path.join(ROOT, 'research', 'market-screens', 'tijori');
    const market = await runTijoriMarketScreens(marketRoot);
    await debug.emit('SOURCE/TIJORI_MARKET', market.gaps.length ? 'WARN' : (market.warnings.length ? 'OK_WITH_FALLBACK' : 'OK'), 'Optional Tijori market datasets collected', { root: path.relative(ROOT, marketRoot), artifacts: market.artifacts.length, dataGaps: market.gaps.length, warnings: market.warnings.length });
    await publishDatasetFile('tijoriScan', path.join(marketRoot, 'index.json'));
  }

  if (hasFlag('--analyze')) {
    await analyze(ticker);
    return;
  }

  console.log(JSON.stringify(acquisitionReport, null, 2));
}


async function ensureAnalysisPrepared(ticker:string){
  const researchDir=path.join(ROOT,'research',ticker);
  const manifestPath=path.join(researchDir,'manifest.json');
  if(!(await import('node:fs/promises')).access(manifestPath).then(()=>true).catch(()=>false)){
    console.log(`→ ANALYSIS/PREPARE: Research manifest missing; running deterministic research for ${ticker}`);
    await acquire(ticker);
  }
  const mf=JSON.parse(await readFile(manifestPath,'utf8')) as ResearchManifest;
  await writeIndividualStockEvidence(researchDir,mf);
  await writeEvidenceQuality(researchDir,mf);
  const ing=await ingestResearch(researchDir,mf.sourceArtifacts);
  const contract=await writeEvidenceContract(researchDir,mf);
  const analysisInputs=await writeAnalysisInputs(researchDir,mf);
  const evidencePack=await writeAnalysisEvidencePack(researchDir,mf);
  const bundleBefore=await writeEvidenceBundle(researchDir,mf);
  const prompt=await buildAnalysisPrompt(SKILL,PROMPT,researchDir,mf.sourceArtifacts,{name:mf.companyName,ticker,isin:mf.isin,bseScrip:mf.bseScrip});
  // Readiness is evaluated only after every deterministic artifact required by the LLM handoff exists.
  const readiness=await writeAnalysisReadiness(researchDir,mf);
  const bundle=await writeEvidenceBundle(researchDir,mf);
  const prep={
    schema_version:'1.2',
    ticker,
    preparedAt:new Date().toISOString(),
    ingestion:{allEvidence:ing.allEvidence,structuredEvidence:ing.structuredEvidence,mdaEvidence:ing.mdaEvidence,visualEvidence:ing.visualEvidence},
    readiness:readiness.report,
    evidenceContract:contract,
    evidenceBundle:bundle,
    prompt:prompt.out,
    analysisEvidencePack:{json:evidencePack.jsonPath,markdown:evidencePack.mdPath},
    deterministic:true,
    llmUsed:false
  };
  await writeText(path.join(researchDir,'analysis-prep.json'),JSON.stringify(prep,null,2));
  console.log(`✓ ANALYSIS/PREPARE: Deterministic analysis package prepared | ready=${readiness.report.ready} blocking=${JSON.stringify(readiness.report.blockingReasons)}`);
  return readiness.report;
}

async function analyze(ticker: string) {
  const researchDir = path.join(ROOT, 'research', ticker);
  await ensureDir(path.join(ROOT, 'outputs'));

  console.log(`\n=== ANALYZE ${ticker} ===`);
  console.log(`→ ANALYZE/RESEARCH: Running complete deterministic acquisition pipeline`);
  await acquire(ticker);
  // Publish the evidence package even if a later readiness gate blocks LLM analysis.
  await publishAfterPipelineRun('research', ticker, ROOT);

  console.log(`→ ANALYZE/PREPARE: Running complete deterministic preparation pipeline`);
  const readiness = await ensureAnalysisPrepared(ticker);

  if(!readiness.ready) {
    throw new Error('Analysis blocked by deterministic readiness gate: '+JSON.stringify({blockingReasons:readiness.blockingReasons,missingFiles:readiness.missingFiles,coreCompleteness:readiness.coreCompleteness,actionableWarnings:readiness.actionableWarnings}));
  }

  const manifest = JSON.parse(await readFile(path.join(researchDir,'manifest.json'),'utf8')) as ResearchManifest;
  const promptPath = path.join(researchDir, 'analysis-prompt.txt');
  const outputPath = path.join(ROOT, 'outputs', `${ticker}-analysis.json`);
  const prompt = await readText(promptPath);
  const skill = await readText(SKILL);

  console.log(`→ ANALYZE/LLM: Deterministic gate passed; invoking final reasoning model`);
  const result = await runLlmAnalysis(skill, prompt, outputPath);
  const parsed = JSON.parse(result);
  const ajv = new Ajv({ allErrors: true });
  const valid = ajv.compile(analysisSchema as any)(parsed);
  if (!valid) {
    throw new Error(`Final analysis JSON failed schema validation: ${JSON.stringify(ajv.errors)}`);
  }
  await writeFile(path.join(researchDir, 'analysis-status.json'), JSON.stringify({
    status: 'ok',
    analyzedAt: new Date().toISOString(),
    ticker: manifest.ticker,
    output: path.relative(ROOT, outputPath),
    pipeline: ['research','prepare-analysis','llm-analysis'],
  }, null, 2));
  console.log(JSON.stringify({ status: 'analyzed', ticker, output: outputPath }, null, 2));
  await publishAfterPipelineRun('analysis', ticker, ROOT);
}

async function ingestOnly(ticker: string) {
  const researchDir = path.join(ROOT, 'research', ticker);
  const mf = JSON.parse(await readFile(path.join(researchDir, 'manifest.json'), 'utf8')) as ResearchManifest;
  const result = await ingestResearch(researchDir, mf.sourceArtifacts);
  await writeManifest(researchDir, mf);
  console.log(JSON.stringify(result, null, 2));
}

async function validate(ticker: string) {
  const file = path.join(ROOT, 'outputs', `${ticker}-analysis.json`);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  const ok = ajv.compile(analysisSchema as any)(data);
  if (!ok) { console.error(JSON.stringify(ajv.errors, null, 2)); process.exitCode = 1; }
  else console.log(`Valid analysis JSON: ${file}`);
}

async function promptOnly(ticker: string) {
  const researchDir = path.join(ROOT, 'research', ticker);
  const mf = JSON.parse(await readFile(path.join(researchDir, 'manifest.json'), 'utf8')) as ResearchManifest;
  const p = await buildAnalysisPrompt(SKILL, PROMPT, researchDir, mf.sourceArtifacts, { name: mf.companyName, ticker, isin: mf.isin, bseScrip: mf.bseScrip });
  console.log(p.out);
}

const cmd = process.argv[2];
(async () => {
  switch (cmd) {
    case 'research': { const ticker = await tickerArg(); if (hasFlag('--analyze')) await analyze(ticker); else { await acquire(ticker); await publishAfterPipelineRun('research', ticker, ROOT); } break; }
    case 'research-screener-screens':
    case 'screener-screens': {
      const root = path.join(ROOT, 'research', 'market-screens', 'screener');
      const r = await runScreenerMarketScreens(root);
      console.log(JSON.stringify({ schema_version:'1.0', source:'Screener.in', root:path.relative(ROOT,root), artifacts:r.artifacts.length, dataGaps:r.gaps.length, warnings:r.warnings.length, artifactsDetail:r.artifacts }, null, 2));
      await publishDatasetFile('screenerScan', path.join(root, 'index.json'));
      break;
    }
    case 'research-tijori-market':
    case 'tijori-market': {
      const root = path.join(ROOT, 'research', 'market-screens', 'tijori');
      const r = await runTijoriMarketScreens(root);
      console.log(JSON.stringify({ schema_version:'1.0', source:'Tijori Finance', root:path.relative(ROOT,root), artifacts:r.artifacts.length, dataGaps:r.gaps.length, warnings:r.warnings.length, index:path.join(root,'index.json'), artifactsDetail:r.artifacts }, null, 2));
      await publishDatasetFile('tijoriScan', path.join(root, 'index.json'));
      break;
    }
    case 'research-chartink': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      await ensureDir(path.join(researchDir, 'raw'));
      await ensureDir(path.join(researchDir, 'derived'));
      await ensureDir(path.join(researchDir, 'markdown'));
      await ensureDir(path.join(researchDir, 'screenshots'));
      const r = await runChartink({ ticker: t, researchDir });
      console.log(JSON.stringify({ schema_version: '1.8', ticker: t, acquisitionOnly: true, sourceArtifacts: r.artifacts, dataGaps: r.gaps || [], warnings: r.warnings || [] }, null, 2));
      break;
    }
    case 'research-tradingview': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      await ensureDir(path.join(researchDir, 'raw'));
      await ensureDir(path.join(researchDir, 'screenshots'));
      const r = await runTradingView({ ticker: t, researchDir });
      console.log(JSON.stringify({ schema_version: '1.1', ticker: t, acquisitionOnly: true, sourceArtifacts: r.artifacts, dataGaps: r.gaps || [], warnings: r.warnings || [] }, null, 2));
      break;
    }
    case 'research-news': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      await ensureDir(path.join(researchDir, 'normalized'));
      const r = await runNewsSentiment({ ticker:t, researchDir });
      console.log(JSON.stringify({ schema_version:'1.0', ticker:t, source:'NewsSentiment', artifacts:r.artifacts, dataGaps:r.gaps||[], warnings:r.warnings||[] }, null, 2));
      break;
    }
    case 'tradingview-doctor': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      // Diagnostic command must preserve the existing ticker evidence tree.
      await ensureDir(researchDir);
      await ensureDir(path.join(researchDir, 'raw'));
      await ensureDir(path.join(researchDir, 'screenshots'));
      const r = await runTradingView({ ticker: t, researchDir });
      const uiSurfaceNames = String(process.env.TRADINGVIEW_UI_SURFACES || 'forecast,news,documents,seasonals,community').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
      const screenshotNames = ['tradingview-1d.png','tradingview-fullchart-5y.png','tradingview-fullchart-all.png','tradingview-technicals.png', ...uiSurfaceNames.map(v=>`tradingview-${v}.png`)];
      const screenshotAudit = await Promise.all(screenshotNames.map(async name => { const p = path.join(researchDir,'screenshots',name); try { const st = await (await import('node:fs/promises')).stat(p); return { name, path:p, exists:st.isFile(), bytes:st.size }; } catch { return { name, path:p, exists:false, bytes:0 }; } }));
      console.log(JSON.stringify({ schema_version: '1.1', ticker: t, expectedChartUrl: `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${t}`)}`, screenshots: screenshotAudit, sourceArtifacts: r.artifacts, dataGaps: r.gaps || [], warnings: r.warnings || [] }, null, 2));
      if ((r.gaps || []).length) process.exitCode = 1;
      break;
    }
    case 'tradingview-ui': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      await ensureDir(researchDir);
      await ensureDir(path.join(researchDir, 'raw'));
      await ensureDir(path.join(researchDir, 'screenshots'));
      const r = await runTradingView({ ticker: t, researchDir });
      const ui = r.artifacts.filter(a => String(a.id).startsWith('tradingview-ui-'));
      console.log(JSON.stringify({
        schema_version:'1.0',
        ticker:t,
        chartUrl:`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${t}`)}`,
        configuredSurfaces:String(process.env.TRADINGVIEW_UI_SURFACES || 'forecast,news,documents,seasonals,community').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean),
        artifacts:ui,
        dataGaps:r.gaps||[],
        warnings:r.warnings||[]
      }, null, 2));
      if ((r.gaps||[]).some((x:string)=>x.toLowerCase().includes('ui surface'))) process.exitCode=1;
      break;
    }
    case 'research-nse-market': {
      const root = path.join(ROOT, 'research', 'market-screens', 'nse');
      const t = process.argv.slice(3).find(v => !v.startsWith('--'))?.toUpperCase();
      const r = await runNseMarketUniverse({ root, ticker: t });
      console.log(JSON.stringify({ schema_version: '1.0', source: 'NSE India', ticker: t ?? null, root: path.relative(ROOT, root), artifacts: r.artifacts.length, dataGaps: r.gaps || [], warnings: r.warnings || [], summary: r.summary }, null, 2));
      break;
    }
    case 'nse-market': {
      const root = path.join(ROOT, 'research', 'market-screens', 'nse');
      const t = process.argv.slice(3).find(v => !v.startsWith('--'))?.toUpperCase();
      const r = await runNseMarketUniverse({ root, ticker: t });
      console.log(JSON.stringify({ schema_version: '1.0', source: 'NSE India', ticker: t ?? null, root: path.relative(ROOT, root), artifacts: r.artifacts.length, dataGaps: r.gaps || [], warnings: r.warnings || [], summary: r.summary }, null, 2));
      break;
    }
    case 'research-nse': {
      const t = await tickerArg();
      const researchDir = path.join(ROOT, 'research', t);
      await resetDir(researchDir);
      await ensureDir(path.join(researchDir, 'raw'));
      await ensureDir(path.join(researchDir, 'derived'));
      await ensureDir(path.join(researchDir, 'markdown'));
      await ensureDir(path.join(researchDir, 'screenshots'));
      const ctx:any = { ticker: t, researchDir };
      const r = await runNse(ctx);
      const gaps = [...new Set(r.gaps || [])];
      const warnings = [...new Set(r.warnings || [])];
      const hasFallback = r.artifacts.some((a: any) => a.status === 'ok_with_fallback');
      const status = gaps.length ? (r.artifacts.length ? 'partial' : 'error') : (hasFallback || warnings.length ? 'ok_with_fallback' : 'ok');
      const out:any = {
        schema_version:'1.7',
        ticker:t,
        generatedAt:new Date().toISOString(),
        acquisitionOnly:true,
        status,
        companyName:ctx.companyName,
        isin:ctx.isin,
        sourceArtifacts:r.artifacts,
        dataGaps:gaps,
        warnings,
        debug: Object.fromEntries(Object.entries(debugPaths(researchDir)).map(([k, v]) => [k, path.relative(ROOT, v)])),
      };
      await writeFile(path.join(researchDir,'nse-acquisition-report.json'), JSON.stringify(out,null,2));
      console.log('');
      console.log('=== NSE ACQUISITION COMPLETE ===');
      console.log(`Status: ${status}`);
      console.log(`Artifacts: ${r.artifacts.length}`);
      console.log(`Data gaps: ${gaps.length}`);
      console.log(`Warnings: ${warnings.length}`);
      console.log(`Debug JSON: ${path.relative(ROOT, debugPaths(researchDir).debugJson)}`);
      console.log(`Debug JSONL: ${path.relative(ROOT, debugPaths(researchDir).debugJsonl)}`);
      console.log(`Timeline: ${path.relative(ROOT, debugPaths(researchDir).timeline)}`);
      console.log('');
      console.log(JSON.stringify(out,null,2));
      break;
    }
    case 'prepare-analysis': {
      const t=await tickerArg(); const dir=path.join(ROOT,'research',t); const manifestFile=path.join(dir,'manifest.json');
      if(!(await import('node:fs/promises')).access(manifestFile).then(()=>true).catch(()=>false)) { console.log(`→ ANALYSIS/PREPARE: manifest missing; running deterministic research for ${t}`); await acquire(t); }
      const mf=JSON.parse(await readFile(manifestFile,'utf8')) as ResearchManifest;
      await writeIndividualStockEvidence(dir,mf);
      await writeEvidenceQuality(dir,mf);
      const ing=await ingestResearch(dir,mf.sourceArtifacts);
      const contract=await writeEvidenceContract(dir,mf);
      const analysisInputs=await writeAnalysisInputs(dir,mf);
      const bundle=await writeEvidenceBundle(dir,mf);
      const prompt=await buildAnalysisPrompt(SKILL,PROMPT,dir,mf.sourceArtifacts,{name:mf.companyName,ticker:t,isin:mf.isin,bseScrip:mf.bseScrip});
      const readiness=await writeAnalysisReadiness(dir,mf);
      const finalBundle=await writeEvidenceBundle(dir,mf);
      await writeText(path.join(dir,'analysis-prep.json'),JSON.stringify({schema_version:'1.2',ticker:t,preparedAt:new Date().toISOString(),ingestion:{allEvidence:ing.allEvidence,structuredEvidence:ing.structuredEvidence,mdaEvidence:ing.mdaEvidence,visualEvidence:ing.visualEvidence},readiness:readiness.report,evidenceContract:contract,evidenceBundle:finalBundle,prompt:prompt.out,deterministic:true,llmUsed:false},null,2));
      console.log(JSON.stringify({ticker:t,ready:readiness.report.ready,blockingReasons:readiness.report.blockingReasons,advisoryReasons:readiness.report.advisoryReasons,analysisPrep:path.join(dir,'analysis-prep.json')},null,2)); break; }
    case 'analyze': await analyze(await tickerArg()); break;
    case 'ingest': await ingestOnly(await tickerArg()); break;
    case 'validate': await validate(await tickerArg()); break;
    case 'prompt': await promptOnly(await tickerArg()); break;
    case 'evidence:pack': {
      const t=await tickerArg();
      const researchDir=path.join(ROOT,'research',t);
      const mf=JSON.parse(await readFile(path.join(researchDir,'manifest.json'),'utf8')) as ResearchManifest;
      const r=await writeAnalysisEvidencePack(researchDir,mf);
      console.log(JSON.stringify({ticker:t,ok:true,json:r.jsonPath,markdown:r.mdPath,facts:r.pack.canonicalFacts.length,calculatedMetrics:r.pack.calculatedMetrics.length,documents:r.pack.documents.count,conflicts:r.pack.reconciliation?.conflictCount??0},null,2));
      break;
    }
    case 'market-scans':
    case 'scans:all': {
      const chart = await runChartinkMarketScans({ projectRoot: ROOT, scanType: 'all', captureCharts: !hasFlag('--no-charts') });
      const root52 = path.join(ROOT, 'scans', `52-Week-High-${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date()).replace(/\//g,'-')}`);
      const high52 = await runNse52WeekHigh({ root: root52 });
      const scanQuality = await writeMarketScanQuality(path.join(ROOT,'scans'));
      console.log(JSON.stringify({ schema_version:'1.0', deterministic:true, llmUsed:false, chartink:chart.summary, nse52WeekHigh:high52.summary, scanQuality: { path:scanQuality.out, status:scanQuality.report.status, warnings:scanQuality.report.warnings } }, null, 2));
      await publishDatasetFile('chartinkScan', path.join(ROOT, 'scans', 'index.json'));
      await publishDatasetFile('nse52w', path.join(root52, 'raw', 'nse-api', '52-week-high.normalized.json'));
      if (chart.summary.failed > 0 || high52.gaps.length) process.exitCode = 1;
      break;
    }
    case 'nse-52week-high':
    case 'research:nse-52week-high': {
      const root = path.join(ROOT, 'scans', `52-Week-High-${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date()).replace(/\//g,'-')}`);
      const r = await runNse52WeekHigh({ root });
      console.log(JSON.stringify({ schema_version:'1.0', source:'NSE India', root:path.relative(ROOT,root), artifacts:r.artifacts.length, dataGaps:r.gaps, warnings:r.warnings, summary:r.summary }, null, 2));
      if (r.gaps.length) process.exitCode = 1;
      else await publishDatasetFile('nse52w', path.join(root, 'raw', 'nse-api', '52-week-high.normalized.json'));
      break;
    }
    case 'chartink-market-scans':
    case 'research:chartink-scans':
    case 'scan:chartink': {
      const scanTypeArg = process.argv.slice(3).find(v => !v.startsWith('--'))?.toLowerCase() || 'all';
      const allowed = new Set(['all','fundamental','candlestick','range-breakouts','bullish','bearish','intraday']);
      if (!allowed.has(scanTypeArg)) throw new Error('Usage: npm run chartink:scans -- all|fundamental|candlestick|range-breakouts|bullish|bearish|intraday [--no-charts]');
      const captureCharts = !hasFlag('--no-charts');
      const r = await runChartinkMarketScans({ projectRoot: ROOT, scanType: scanTypeArg as any, captureCharts });
      const scanQuality = await writeMarketScanQuality(path.join(ROOT,'scans'));
      console.log(JSON.stringify({ ...r.summary, scanQuality: { path: scanQuality.out, status: scanQuality.report.status, warnings: scanQuality.report.warnings } }, null, 2));
      if (r.summary.failed > 0) process.exitCode = 1;
      else await publishDatasetFile('chartinkScan', path.join(r.dateDir, 'index.json'));
      break;
    }
    case 'chartink-top20':
    case 'research:chartink-top20':
    case 'screen:chartink': {
      const categoryArg = process.argv.slice(3).find(v => !v.startsWith('--'))?.toLowerCase() || 'all';
      const refresh = hasFlag('--refresh');
      const allowed = new Set(['all','swing','long','short','fundamental','candlestick','range-breakouts','bullish','bearish','intraday']);
      if (!allowed.has(categoryArg)) throw new Error('Usage: npm run chartink:top20 -- swing|long|short|fundamental|candlestick|range-breakouts|bullish|bearish|intraday|all [--refresh]');
      const r = await runChartinkTop20({ root: path.join(ROOT, 'research', 'chartink'), category: categoryArg as any, refresh, projectRoot: ROOT });
      console.log(JSON.stringify(r, null, 2));
      await publishDatasetFile('chartinkScan', r.indexPath);
      break;
    }
    case 'normalize': { const t=await tickerArg(); const dir=path.join(ROOT,'research',t); const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest; const { runNormalization } = await import('./lib/normalize.js'); console.log(JSON.stringify(await runNormalization(dir,m),null,2)); break; }
    case 'evidence:contract': { const t=await tickerArg(); const dir=path.join(ROOT,'research',t); const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest; const r=await writeEvidenceContract(dir,m); console.log(JSON.stringify({path:r.out,entryCount:r.contract.entryCount},null,2)); break; }
    case 'bundle': { const t=await tickerArg(); const dir=path.join(ROOT,'research',t); const m=JSON.parse(await readFile(path.join(dir,'manifest.json'),'utf8')) as ResearchManifest; console.log(JSON.stringify({path:await writeEvidenceBundle(dir,m)},null,2)); break; }
    case 'nse:securities': {
      const universe = await loadNseEquityUniverse(ROOT);
      console.log(JSON.stringify({ sourcePage: 'https://www.nseindia.com/static/market-data/securities-available-for-trading', sourceCsv: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', count: universe.length, seriesCounts: Object.fromEntries(Object.entries(universe.reduce((a,r)=>(a[r.series]=(a[r.series]||0)+1,a), {} as Record<string,number>))), eqCount: universe.filter(r=>r.series==='EQ').length }, null, 2));
      break;
    }
    case 'nse:lookup': {
      const query = process.argv.slice(3).filter(v => !v.startsWith('--')).join(' ').trim();
      const universe = await loadNseEquityUniverse(ROOT);
      console.log(JSON.stringify({ query, result: resolveNseSecurity(query, universe) }, null, 2));
      break;
    }
    case 'nse:validate-symbol': {
      const query = process.argv.slice(3).filter(v => !v.startsWith('--')).join(' ').trim();
      const universe = await loadNseEquityUniverse(ROOT);
      const result = resolveNseSecurity(query, universe);
      if (!result.record) throw new Error(`Unknown NSE security/company: ${query}`);
      console.log(JSON.stringify({ valid: true, record: result.record }, null, 2));
      break;
    }
    default: throw new Error('Commands: research | research-nse | research-nse-market | nse-market | nse:securities | nse:lookup | nse:validate-symbol | research-screener-screens | screener-screens | research-tijori-market | tijori-market | research-chartink | research-tradingview | tradingview-doctor | research:nse-52week-high | market-scans | chartink-market-scans | chartink-top20 | screen:chartink | analyze | ingest | validate | prompt | normalize | evidence:contract | bundle | prepare-analysis');
  }
})().catch(e => { console.error(e?.stack || e?.message || String(e)); process.exitCode = 1; });
