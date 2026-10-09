import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildVisualEvidenceRows,
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

const analysisTabs = transformAnalysisToSheets(analysis, 'EXAMPLE', 'EXAMPLE-2026-10-09-analysis');
const bySuffix = (suffix: string) => analysisTabs.find(item => item.tabName.endsWith(suffix));
assert(analysisTabs.length === 8, 'Analysis export should split into eight classified tabs');
assert(bySuffix('-summary')?.rows[0]?.recommendation === 'BUY', 'Summary should expose recommendation as a first-class column');
assert(bySuffix('-summary')?.rows[0]?.current_price_inr === 125.5, 'Summary should expose current price as a number');
assert(bySuffix('-findings')?.rows.some(row => row.domain === 'Fundamentals' && row.field === 'growth.revenue_growth' && row.value === 14), 'Findings should retain domain and nested field classification');
assert(bySuffix('-risks')?.rows[0]?.early_warning_indicator === 'Margin decline', 'Risks should have dedicated typed columns');
assert(bySuffix('-catalysts')?.rows[0]?.confirmation_condition === 'Commissioning announcement', 'Catalysts should have dedicated typed columns');
assert(bySuffix('-scenarios')?.rows.length === 3, 'Bull/base/bear scenarios should be separated into rows');
assert(bySuffix('-sources')?.rows[0]?.url === 'https://example.com', 'Source URLs should be preserved as their own column');
assert(bySuffix('-audit')?.rows.some(row => row.audit_type === 'source_conflict'), 'Audit conflicts should be published');

const researchTabs = transformResearchToSheets({
  manifest: { ticker: 'EXAMPLE', companyName: 'Example Ltd', generatedAt: '2026-10-09T09:00:00Z', acquisitionOnly: true, sourceArtifacts: [{ id: 'nse-1', provider: 'NSE', type: 'market_data', title: 'Quote', status: 'ok', url: 'https://example.com' }], dataGaps: [], warnings: [] },
  readiness: { ready: true, blockingReasons: [], advisoryReasons: [], requiredFiles: [{ file: 'manifest.json', ok: true }], missingFiles: [], actionableWarnings: [] },
  evidencePack: { canonicalFacts: [{ field: 'revenue', value: 100, unit: 'INR crore', source: 'NSE', sourceArtifact: 'nse-1', asOf: 'Jun-2026' }], calculatedMetrics: [{ field: 'revenue_growth', value: 14, unit: '%', source: 'calculated' }], fundamentals: { trend: 'positive' }, catalysts: { items: [] }, newsSentiment: { label: 'NEUTRAL' }, valuation: { pe: 18 }, technicals: { rsi: 58 }, ownership: { promoter: 52 } },
  sourceHealth: { overall: { status: 'ok' }, sources: { NSE: { status: 'ok', warningDetails: [] } } },
  evidenceQuality: { report: { status: 'ok', summary: { missing: 0 } } },
  reconciliation: { conflictCount: 0, conflicts: [] },
}, 'EXAMPLE', 'EXAMPLE-2026-10-09-research');
assert(researchTabs.length === 5, 'Research export should split into five classified tabs');
assert(researchTabs.find(item => item.tabName.endsWith('-summary'))?.rows[0]?.readiness === 'READY', 'Research summary should expose readiness');
assert(researchTabs.find(item => item.tabName.endsWith('-evidence'))?.rows.some(row => row.field === 'revenue' && row.value === 100), 'Research evidence should publish canonical facts in columns');
assert(researchTabs.find(item => item.tabName.endsWith('-sources'))?.rows[0]?.provider === 'NSE', 'Research source provenance should have dedicated columns');

const visualRows = buildVisualEvidenceRows('EXAMPLE', []);
assert(visualRows[0]?.embedding_status === 'not_available', 'Missing screenshots should be explicitly identified');
const publisher = await readFile(path.join(process.cwd(), 'src', 'lib', 'google-sheets-publish.ts'), 'utf8');
assert(publisher.includes('GOOGLE_SHEETS_WEBHOOK_URL') && publisher.includes('GOOGLE_SHEETS_WEBHOOK_TOKEN'), 'Auto-publisher must require a configured URL and token');
assert(publisher.includes('local output remains available'), 'Sheets failure must not invalidate locally saved analysis');
const appsScript = await readFile(path.join(process.cwd(), 'integrations', 'google-sheets', 'Code.gs'), 'utf8');
assert(appsScript.includes('function json_('), 'Apps Script sink must expose JSON responses');
assert(appsScript.includes('function doPost('), 'Apps Script sink must accept export POST requests');
assert(appsScript.includes('function embedScreenshots_('), 'Apps Script sink must embed screenshot images');
assert(appsScript.includes("const HOME_TAB = 'StockResearch'"), 'Apps Script sink must maintain the StockResearch index');
assert(appsScript.includes("const name = '_EXPORT_LOG'"), 'Apps Script sink must record export runs');

console.log(JSON.stringify({ ok: true, analysisTabs: analysisTabs.length, researchTabs: researchTabs.length, coverage: ['summary', 'findings', 'scores', 'risks', 'catalysts', 'scenarios', 'sources', 'audit'] }, null, 2));
