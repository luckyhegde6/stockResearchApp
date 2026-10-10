import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildVisualEvidenceRows,
  fitWithinPixelLimit,
  transformAnalysisToSheets,
  transformResearchToSheets,
} from './google-sheets-transformers.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const analysis = {
  schema_version: '1.0.0',
  company: { name: 'Example Ltd', ticker: 'EXAMPLE', exchange: 'NSE', sector: 'Industrials' },
  analysis_meta: { analysis_timestamp: '2026-10-09T09:30:00Z', latest_reporting_period: 'Jun-2026', financial_basis: 'consolidated', data_completeness: 0.92, overall_confidence: 0.84, data_gaps: [] },
  market_snapshot: { current_price: 125.5, currency: 'INR', market_cap: 9000, pe: 18.4, '52_week_high': 140, '52_week_low': 80 },
  recommendation: { action: 'BUY', conviction: 8, confidence: 0.84, one_line_thesis: 'Growing with reasonable valuation', top_three_reasons: ['Earnings growth', 'Cash conversion', 'Valuation support'] },
  scores: { fundamentals: 8, management: 7, valuation: 8, technical: 6, shareholding: 7, risk_reward: 8, overall: 7.5 },
  executive_summary: { business_quality: 'Strong', earnings_quality: 'Improving', key_risk: 'Input costs', key_catalyst: 'Capacity addition' },
  fundamentals: { growth: { revenue_growth: 14, profit_growth: 21, trend: 'positive', confidence: 0.8 }, verdict: 'Improving' },
  management: { score: 7, positive_signals: ['Guidance delivery'], confidence: 0.7 },
  valuation: { classification: 'FAIRLY_VALUED', pe: 18.4, assessment: 'Reasonable', confidence: 0.8 },
  technical: { market_phase: 'MARKUP', rsi: 59, assessment: 'Trend positive', confidence: 0.7, source_id: 'TV-1' },
  shareholding: { promoter_holding: 52, assessment: 'Stable', confidence: 0.8 },
  news_sentiment: { label: 'POSITIVE', assessment: 'Mostly positive', key_evidence: ['Order win'], confidence: 0.6 },
  risks: [{ rank: 1, risk: 'Input costs rise', category: 'operational', probability: 'medium', impact: 'high', early_warning_indicator: 'Margin decline', priced_in: 'unknown', confidence: 0.7, source_id: 'NSE-1' }],
  catalysts: [{ rank: 1, catalyst: 'New plant', timeframe: '12 months', confirmation_condition: 'Commissioning announcement', potential_impact: 'Higher capacity', confidence: 0.8, source_id: 'NSE-2' }],
  scenarios: { bull: { thesis: 'Faster growth', assumptions: ['Demand holds'], confidence: 0.7 }, base: { thesis: 'Steady growth', assumptions: ['Margins stable'], confidence: 0.6 }, bear: { thesis: 'Demand falls', assumptions: ['Costs rise'], confidence: 0.3 } },
  contrarian_test: { fragile_assumption: 'Demand remains strong', confidence: 0.7 },
  entry_zones: { attractive: { low: 100, high: 115, assumptions: ['Normal earnings'] } },
  portfolio_action: { existing_shareholder: 'Hold', new_investor: 'Accumulate gradually', investment_horizon: '3–5 years', thesis_invalidation: ['Margins collapse'] },
  what_would_change_my_mind: ['Two quarters of declining cash generation'],
  sources: [{ source_id: 'NSE-1', source_name: 'NSE', source_type: 'corporate_announcement', url: 'https://example.com', retrieved_at: '2026-10-09T09:00:00Z', artifact_path: 'raw/nse.json' }],
  audit: { facts_without_primary_source: ['Claim with no primary source'], conflicts_detected: [{ field: 'revenue', sources: ['NSE', 'Screener'] }], calculations: [{ metric: 'growth', formula: '(new-old)/old', inputs: ['new', 'old'], calculation_note: 'Year-on-year' }] },
};

const resizedDimensions = fitWithinPixelLimit(3840, 2160);
assert(resizedDimensions.width * resizedDimensions.height <= 900_000, 'Screenshot dimensions must stay below the Apps Script one-million-pixel ceiling');
assert(resizedDimensions.width > 0 && resizedDimensions.height > 0, 'Screenshot resizing must preserve positive dimensions');
assert(fitWithinPixelLimit(800, 600).width === 800, 'Small images should not be unnecessarily upscaled or resized');

const analysisTabs = transformAnalysisToSheets(analysis, 'EXAMPLE', 'EXAMPLE-2026-10-09-analysis');
const analysisTab = analysisTabs[0];
const rowsIn = (section: string) => analysisTab?.rows.filter(row => row.section === section && row.record_type !== 'section_header') || [];
const summaryValue = (field: string) => rowsIn('SUMMARY').find(row => row.field === field)?.value;
assert(analysisTabs.length === 1, 'Analysis export must use exactly one sheet per run');
assert(analysisTab.tabName === 'EXAMPLE-2026-10-09-analysis', 'Analysis tab should use the unsuffixed run name');
assert(summaryValue('recommendation') === 'BUY', 'Summary section should expose recommendation as a labelled value');
assert(summaryValue('current_price_inr') === 125.5, 'Summary section should preserve current price as a number');
assert(rowsIn('FINDINGS').some(row => row.domain === 'Fundamentals' && row.field === 'growth.revenue_growth' && row.value === 14), 'Findings should retain domain and nested field classification');
assert(rowsIn('RISKS').some(row => row.field === 'Input costs rise' && String(row.details).includes('early_warning_indicator')), 'Risk detail fields should survive consolidation');
assert(rowsIn('CATALYSTS').some(row => String(row.details).includes('Commissioning announcement')), 'Catalyst confirmation details should survive consolidation');
assert(rowsIn('SCENARIOS').length === 3, 'Bull/base/bear scenarios should be separated into rows');
assert(rowsIn('SOURCES').some(row => row.source_url === 'https://example.com'), 'Source URLs should be preserved as their own column');
assert(rowsIn('AUDIT').some(row => String(row.details).includes('source_conflict')), 'Audit conflicts should be published');
assert(analysisTab.rows.every(row => !Object.keys(row).some(key => /local.?path|artifact.?path|screenshot.?path/i.test(key))), 'Consolidated analysis must not expose local path columns');

const researchTabs = transformResearchToSheets({
  manifest: { ticker: 'EXAMPLE', companyName: 'Example Ltd', generatedAt: '2026-10-09T09:00:00Z', acquisitionOnly: true, sourceArtifacts: [{ id: 'nse-1', provider: 'NSE', type: 'market_data', title: 'Quote', status: 'ok', url: 'https://example.com', localPath: 'research/EXAMPLE/raw/quote.json', screenshotPath: 'C:\\Local\\research\\chart.png', notes: ['normalized=F:\\Local_git\\stock-research-app\\research\\EXAMPLE\\raw\\quote.json'] }], dataGaps: ['research/EXAMPLE/raw/gap.json'], warnings: [] },
  readiness: { ready: true, blockingReasons: [], advisoryReasons: [], requiredFiles: [{ file: 'manifest.json', ok: true }], missingFiles: [], actionableWarnings: [] },
  evidencePack: { canonicalFacts: [{ field: 'revenue', value: 100, unit: 'INR crore', source: 'NSE', sourceArtifact: 'nse-1', asOf: 'Jun-2026' }], calculatedMetrics: [{ field: 'revenue_growth', value: 14, unit: '%', source: 'calculated' }], fundamentals: { trend: 'positive' }, catalysts: { items: [] }, newsSentiment: { label: 'NEUTRAL' }, valuation: { pe: 18 }, technicals: { rsi: 58 }, ownership: { promoter: 52 } },
  sourceHealth: { overall: { status: 'ok' }, sources: { NSE: { status: 'ok', warningDetails: [] } } },
  evidenceQuality: { report: { status: 'ok', summary: { missing: 0 } } },
  reconciliation: { conflictCount: 0, conflicts: [] },
}, 'EXAMPLE', 'EXAMPLE-2026-10-09-research');
assert(researchTabs.length === 1, 'Research export must use exactly one sheet per run');
assert(researchTabs[0]?.tabName === 'EXAMPLE-2026-10-09-research', 'Research tab should use the unsuffixed run name');
const researchRows = researchTabs[0]?.rows || [];
const researchSection = (section: string) => researchRows.filter(row => row.section === section && row.record_type !== 'section_header');
assert(researchSection('SUMMARY').some(row => row.field === 'readiness' && row.value === 'READY'), 'Research summary should expose readiness');
assert(researchSection('EVIDENCE').some(row => row.field === 'revenue' && row.value === 100), 'Research evidence should publish canonical facts in columns');
assert(researchSection('SOURCES').some(row => row.provider === 'NSE'), 'Research source provenance should have dedicated columns');
assert(researchSection('FINDINGS').some(row => row.domain === 'Fundamentals' && row.field === 'trend' && row.value === 'positive'), 'Research findings must be included in the single run sheet');
assert(researchSection('QUALITY').some(row => row.field === 'manifest.json' && row.status === 'present'), 'Research quality checks must be included in the single run sheet');
assert(researchRows.every(row => !Object.keys(row).some(key => /local.?path|artifact.?path|screenshot.?path|relative.?path/i.test(key))), 'Research sheet must not expose local path columns');
assert(!JSON.stringify(researchRows).includes('research/EXAMPLE'), 'Research sheet values must not expose local filesystem paths');
assert(!JSON.stringify(researchRows).includes('F:\\\\Local_git'), 'Embedded Windows paths in source notes must be redacted, not only path-valued fields');
const emptyEvidenceTabs = transformResearchToSheets({
  manifest: { ticker: 'EMPTY', companyName: 'Empty Example', generatedAt: '2026-10-09T09:00:00Z', acquisitionOnly: true, sourceArtifacts: [], dataGaps: [], warnings: [] },
  evidencePack: {},
}, 'EMPTY', 'EMPTY-2026-10-09-research');
assert(
  emptyEvidenceTabs[0]?.rows.some(row => row.section === 'EVIDENCE' && row.record_type === 'notice' && String(row.value).includes('No evidence rows')),
  'An empty canonical evidence section should be explicit instead of appearing silently blank',
);

const packlessEvidenceTabs = transformResearchToSheets({
  manifest: { ticker: 'PACKLESS', companyName: 'Packless Example', generatedAt: '2026-10-09T09:00:00Z', acquisitionOnly: true, sourceArtifacts: [], dataGaps: [], warnings: [] },
  canonicalValues: {
    schema_version: '1.2',
    ticker: 'PACKLESS',
    facts: [{ id: 'nse-last-price', evidenceRole: 'source_fact', field: 'last_price', value: 154.25, unit: 'INR', source: 'NSE', sourceArtifact: 'nse-quote', verified: true, confidence: 'high' }],
    calculatedMetrics: [{ id: 'rsi14', evidenceRole: 'calculated_metric', field: 'rsi14', value: 58.2, unit: 'index', source: 'script', sourceArtifact: 'technical-normalizer', verified: true, confidence: 'high' }],
  },
}, 'PACKLESS', 'PACKLESS-2026-10-09-research');
const packlessRows = packlessEvidenceTabs[0]?.rows ?? [];
const packlessSection = (section: string) => packlessRows.filter(row => row.section === section && row.record_type !== 'section_header');
assert(packlessSection('EVIDENCE').some(row => row.field === 'last_price' && row.value === 154.25), 'Research export must fall back to canonical-values.json when analysis-evidence-pack.json is absent');
assert(packlessSection('EVIDENCE').some(row => row.field === 'rsi14' && row.value === 58.2), 'Research evidence fallback must include deterministic calculated metrics');
assert(packlessSection('SUMMARY').some(row => row.field === 'evidence_facts' && row.value === 1), 'Research summary evidence counts must match canonical fallback rows');
assert(packlessSection('SUMMARY').some(row => row.field === 'calculated_metrics' && row.value === 1), 'Research summary metric counts must match canonical fallback rows');


const visualRows = buildVisualEvidenceRows('EXAMPLE', []);
assert(visualRows[0]?.embedding_status === 'not_available', 'Missing screenshots should be explicitly identified');
const skippedVisual = buildVisualEvidenceRows('EXAMPLE', [{
  fileName: 'empty-chart.png',
  relativePath: 'research/EXAMPLE/screenshots/empty-chart.png',
  sizeBytes: 0,
  mimeType: 'image/png',
  status: 'skipped_empty_file',
  rowIndex: 2,
}]);
assert(skippedVisual[0]?.embedding_status === 'skipped_empty_file', 'Empty screenshots must not be represented as embedded');

const optimizedVisual = buildVisualEvidenceRows('EXAMPLE', [{
  fileName: 'tradingview-fullchart-5y.png',
  relativePath: '',
  sizeBytes: 125_000,
  originalSizeBytes: 760_000,
  width: 900,
  height: 800,
  originalWidth: 1200,
  originalHeight: 1600,
  optimizationOccurred: true,
  compressionQuality: 0.76,
  mimeType: 'image/jpeg',
  status: 'pending_embedding',
  rowIndex: 4,
}]);
assert(optimizedVisual[0]?.optimization_occurred === true, 'Screenshot rows must record whether optimization occurred');
assert(optimizedVisual[0]?.original_size_bytes === 760_000, 'Screenshot rows must preserve original bytes');
assert(optimizedVisual[0]?.original_image_width === 1200 && optimizedVisual[0]?.original_image_height === 1600, 'Screenshot rows must preserve source dimensions');
const publisher = await readFile(path.join(process.cwd(), 'src', 'lib', 'google-sheets-publish.ts'), 'utf8');
assert(publisher.includes('GOOGLE_SHEETS_WEBHOOK_URL') && publisher.includes('GOOGLE_SHEETS_WEBHOOK_TOKEN'), 'Auto-publisher must require a configured URL and token');
assert(publisher.includes('local output remains available'), 'Sheets failure must not invalidate locally saved analysis');
const appsScript = await readFile(path.join(process.cwd(), 'integrations', 'google-sheets', 'Code.gs'), 'utf8');
assert(appsScript.includes('function json_('), 'Apps Script sink must expose JSON responses');
assert(appsScript.includes('function doPost('), 'Apps Script sink must accept export POST requests');
assert(appsScript.includes('function embedScreenshots_('), 'Apps Script sink must embed screenshot images');
assert(appsScript.includes('item.rowIndex = tabResult.dataStartRow + (Number(item.rowIndex || 2) - 2)'), 'Append mode should adjust screenshot row indexes to the appended block');
assert(appsScript.includes("const HOME_TAB = 'StockResearch'"), 'Apps Script sink must maintain the StockResearch index');
assert(!appsScript.includes("const name = '_EXPORT_LOG'"), 'Apps Script must not create an _EXPORT_LOG tab');
assert(appsScript.includes('cleanupLegacyManagedTabs_'), 'Apps Script must remove old command-run and split research tabs');
assert(appsScript.includes('sanitizeRowsForSheet_'), 'Apps Script must filter local path references before writing data');
assert(publisher.includes('publishAudit: options.publishAudit ?? false'), 'Command-run audit publishing must be disabled by default');

console.log(JSON.stringify({ ok: true, analysisTabs: analysisTabs.length, researchTabs: researchTabs.length, coverage: ['summary', 'findings', 'scores', 'risks', 'catalysts', 'scenarios', 'sources', 'audit'] }, null, 2));
