import 'dotenv/config';
/**
 * Laya Decision Run — CLI script
 *
 * Usage:
 *   npx tsx scripts/laya-decision-run.ts ITC
 *   npx tsx scripts/laya-decision-run.ts HDFC
 *   npx tsx scripts/laya-decision-run.ts HPCL --format markdown
 *
 * Reads the stock's analysis-evidence-pack.json, runs all typed decisions,
 * writes JSON + Markdown reports, and prints summary to stdout.
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  LayaDecisionReport,
  renderLayaReportMarkdown
} from '../src/lib/laya-decision-engine.js';
import { runStockDecisions } from '../src/lib/laya-stock-questions.js';
import { publishAfterPipelineRun, writeGoogleSheetsStatusMessage } from '../src/lib/google-sheets-publish.js';

async function readJson(file: string): Promise<any | null> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function run() {
  const args = process.argv.slice(2);
  const ticker = args.find(a => !a.startsWith('--'))?.toUpperCase();
  const format  = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';
  const silent  = args.includes('--silent');

  if (!ticker) {
    console.error('Usage: npx tsx scripts/laya-decision-run.ts <TICKER> [--format json|markdown|both] [--silent]');
    process.exit(1);
  }

  const root = process.cwd();
  const researchDir = path.join(root, 'research', ticker);
  const packPath = path.join(researchDir, 'normalized', 'analysis-evidence-pack.json');

  const pack = await readJson(packPath);
  if (!pack) {
    console.error(`❌  No analysis-evidence-pack.json found for ${ticker}.`);
    console.error(`   Expected: ${packPath}`);
    console.error('   Run the research pipeline first: npm run research -- ' + ticker);
    process.exit(1);
  }

  if (!silent) console.log(`🧠  Running Laya decision engine for ${ticker}...`);

  const decisions = runStockDecisions(ticker, pack);
  const summary = {
    action:              (decisions['action_recommendation']?.answer as any)?.choice ?? 'Insufficient-Data',
    actionConfidence:    (decisions['action_recommendation']?.answer as any)?.confidence ?? 0,
    trendDirection:      (decisions['trend_direction']?.answer as any)?.choice ?? 'Mixed',
    fundamentalScore:    (decisions['fundamental_quality']?.answer as any)?.level ?? 0,
    valuationStance:     (decisions['valuation_stance']?.answer as any)?.choice ?? 'Indeterminate',
    momentumLevel:       (decisions['momentum_strength']?.answer as any)?.level ?? 0,
    newsRisk:            (decisions['news_risk']?.answer as any)?.value ?? null,
    scanConviction:      (decisions['scan_conviction']?.answer as any)?.value ?? null,
    dataQualityLevel:    (decisions['data_quality_gate']?.answer as any)?.level ?? 0
  };

  const report: LayaDecisionReport = {
    schema_version: '1.0',
    ticker,
    generatedAt: new Date().toISOString(),
    deterministic: true,
    llmUsed: false,
    modelSource: 'laya-js-rule-engine',
    decisions,
    summary
  };

  // Ensure output directory
  const outDir = path.join(researchDir, 'normalized');
  await mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'laya-decisions.json');
  const mdPath   = path.join(researchDir, 'markdown', 'LAYA_DECISIONS.md');

  const shouldWriteJson = !format || format === 'json' || format === 'both';
  const shouldWriteMd   = format === 'markdown' || format === 'both';

  if (shouldWriteJson) {
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    if (!silent) console.log(`✅  JSON: ${jsonPath}`);
  }

  if (shouldWriteMd) {
    await mkdir(path.join(researchDir, 'markdown'), { recursive: true });
    const md = renderLayaReportMarkdown(report);
    await writeFile(mdPath, md, 'utf8');
    if (!silent) console.log(`✅  Markdown: ${mdPath}`);
  }

  if (shouldWriteJson) {
    await publishAfterPipelineRun('laya', ticker, root);
  } else {
    await writeGoogleSheetsStatusMessage('skipped', 'Laya report was requested as Markdown only; JSON source was not refreshed, so Sheet publishing was skipped.', {
      root, trigger: 'cli', kind: 'laya', symbol: ticker
    });
  }

  // Pretty console output
  if (!silent) {
    console.log('\n📊  Decision Summary:');
    console.log(`  Action:        ${report.summary.action} (${(report.summary.actionConfidence * 100).toFixed(0)}% confidence)`);
    console.log(`  Trend:         ${report.summary.trendDirection}`);
    console.log(`  Fundamentals:  Score ${report.summary.fundamentalScore}/4`);
    console.log(`  Valuation:     ${report.summary.valuationStance}`);
    console.log(`  Momentum:      Level ${report.summary.momentumLevel}/3`);
    console.log(`  News Risk:     ${report.summary.newsRisk === null ? 'Unclear' : report.summary.newsRisk ? '⚠️  Yes' : '✓  No'}`);
    console.log(`  Scan:          ${report.summary.scanConviction === null ? 'Unclear' : report.summary.scanConviction ? '✓  Convicted' : '—  Not convicted'}`);
    console.log(`  Data Quality:  Level ${report.summary.dataQualityLevel}/3`);
    console.log('');
  }

  // Always output JSON to stdout for piping (when --silent)
  if (silent) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  return report;
}

run().catch(err => { console.error(err); process.exit(1); });
