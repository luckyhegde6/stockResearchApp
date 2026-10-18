import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAnalysisReadiness } from '../src/lib/analysis-readiness.js';
import type { ResearchManifest } from '../src/types/research.js';

const requiredFiles = [
  'evidence-contract.json','source-health.json','evidence-quality.json','evidence-bundle.json',
  'markdown/STRUCTURED_EVIDENCE.md','markdown/INGESTION_REPORT.json','analysis-prompt.txt',
  'normalized/analysis-evidence-pack.json','normalized/individual-stock-evidence.json',
  'normalized/canonical-values.json','normalized/reconciliation.json','normalized/financial-periods.json',
  'normalized/financials.json','normalized/valuation.json','normalized/ownership.json',
  'normalized/technicals.json','normalized/screening.json','normalized/catalysts.json',
  'normalized/analysis-inputs.json','screenshots/tradingview-1d.png',
  'screenshots/tradingview-fullchart-5y.png','screenshots/tradingview-fullchart-all.png',
  'raw/nse-api/historical-normalized.json','raw/screener/fundamental-snapshot.json',
  'raw/tijori/financial-context.json',
];

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stock-research-readiness-'));
  for (const relative of requiredFiles) {
    const file = path.join(dir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    let value = 'fixture evidence';
    if (relative === 'evidence-contract.json') value = JSON.stringify({ summary: { factCount: 1, calculatedMetricCount: 0, sourceEvidenceCount: 0 } });
    if (relative === 'evidence-quality.json') value = JSON.stringify({ report: { status: 'ok', summary: { missing: 0 }, coreCompleteness: { missing: 0 } } });
    if (relative === 'source-health.json') value = JSON.stringify({ overall: { status: 'ok' }, sources: {} });
    await writeFile(file, value, 'utf8');
  }
  const manifest: ResearchManifest = {
    schema_version: '1.49',
    ticker: 'TEST',
    generatedAt: new Date(0).toISOString(),
    acquisitionOnly: true,
    sourceArtifacts: [],
    dataGaps: [],
    warnings: [],
  };
  return { dir, manifest };
}

const originalPartial = process.env.ANALYSIS_ALLOW_PARTIAL;
process.env.ANALYSIS_ALLOW_PARTIAL = '0';
const { dir, manifest } = await fixture();
try {
  const complete = await buildAnalysisReadiness(dir, manifest);
  assert.equal(complete.ready, true, 'complete core evidence should be ready');
  assert.equal(complete.contractEntries, 1);

  assert.equal(complete.missingAdvisoryFiles.length, 2);
  assert.equal(complete.advisoryReasons.includes('optional-markdown-aggregate-files-missing'), true);
  assert.equal(complete.ready, true, 'missing advisory markdown must not block readiness');

  manifest.dataGaps = ['Annual report could not be downloaded', 'BSE source unavailable'];
  const advisoryGaps = await buildAnalysisReadiness(dir, manifest);
  assert.equal(advisoryGaps.ready, true, 'annual-report and excluded BSE gaps are advisory');
  assert.deepEqual(advisoryGaps.advisoryReasons.slice(0, 2), manifest.dataGaps);
  assert.equal(advisoryGaps.blockingReasons.includes('manifest-data-gaps'), false);

  manifest.dataGaps = ['NSE historical API timeout'];
  const blockingGap = await buildAnalysisReadiness(dir, manifest);
  assert.equal(blockingGap.ready, false);
  assert.equal(blockingGap.blockingReasons.includes('manifest-data-gaps'), true);

  manifest.dataGaps = [];
  const healthPath = path.join(dir, 'source-health.json');
  await writeFile(healthPath, JSON.stringify({ overall: { status: 'partial' }, sources: {
    nse: { warningDetails: ['NSE API quote failed: 403 Forbidden'] },
    screener: { warningDetails: ['Screener concall 1: fetch failed', 'Screener: no direct concall PDF links found'] },
    tradingview: { warningDetails: ['TradingView UI surface not fully confirmed'] },
  } }), 'utf8');
  const optionalWarnings = await buildAnalysisReadiness(dir, manifest);
  assert.equal(optionalWarnings.ready, true, 'known optional-source warnings must not block otherwise complete evidence');
  assert.deepEqual(optionalWarnings.actionableWarnings, []);

  await writeFile(healthPath, JSON.stringify({ sources: { nse: { warningDetails: ['NSE historical response malformed'] } } }), 'utf8');
  const actionableWarning = await buildAnalysisReadiness(dir, manifest);
  assert.equal(actionableWarning.ready, false);
  assert.equal(actionableWarning.blockingReasons.includes('actionable-source-warnings'), true);

  const valuationPath = path.join(dir, 'normalized/valuation.json');
  await unlink(valuationPath);
  const missingRequired = await buildAnalysisReadiness(dir, manifest);
  assert.equal(missingRequired.ready, false);
  assert.equal(missingRequired.blockingReasons.includes('missing-required-files'), true);
  assert.equal(missingRequired.missingFiles.includes('normalized/valuation.json'), true);
  await writeFile(valuationPath, '{}', 'utf8');

  await writeFile(path.join(dir, 'evidence-contract.json'), JSON.stringify({ summary: { factCount: 0, calculatedMetricCount: 0, sourceEvidenceCount: 0 } }), 'utf8');
  process.env.ANALYSIS_ALLOW_PARTIAL = '1';
  const emptyContract = await buildAnalysisReadiness(dir, manifest);
  assert.equal(emptyContract.ready, false, 'partial mode must never make an empty evidence contract ready');
  assert.equal(emptyContract.blockingReasons.includes('empty-evidence-contract'), true);

  console.log('Analysis readiness regression tests passed.');
} finally {
  await rm(dir, { recursive: true, force: true });
  if (originalPartial === undefined) delete process.env.ANALYSIS_ALLOW_PARTIAL;
  else process.env.ANALYSIS_ALLOW_PARTIAL = originalPartial;
}

const ticker = process.argv[2]?.trim().toUpperCase();
if (ticker) {
  if (!/^[A-Z0-9._-]+$/.test(ticker)) throw new Error('Ticker may contain only letters, numbers, dot, underscore, and hyphen.');
  const researchDir = path.join(process.cwd(), 'research', ticker);
  const manifest = JSON.parse(await readFile(path.join(researchDir, 'manifest.json'), 'utf8')) as ResearchManifest;
  const report = await buildAnalysisReadiness(researchDir, manifest);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
