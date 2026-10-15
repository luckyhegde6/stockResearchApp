import 'dotenv/config';
import path from 'node:path';
import { access, readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { ResearchManifest } from '../src/types/research.js';
import { buildEvidenceQuality } from '../src/lib/evidence-quality.js';
import { buildAnalysisReadiness } from '../src/lib/analysis-readiness.js';

const ROOT = process.cwd();
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface Options {
  symbol: string;
  acquire: boolean;
  analysis: boolean;
  publish: boolean;
  replaceExisting: boolean;
  confirmVisible: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const symbol = args.find(arg => !arg.startsWith('--'))?.trim().toUpperCase();
  const known = new Set(['--acquire', '--analysis', '--publish', '--replace-existing', '--confirm-visible']);
  const unknown = args.filter(arg => arg.startsWith('--') && !known.has(arg));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}`);
  if (!symbol || !/^[A-Z0-9._&-]{1,20}$/.test(symbol)) {
    throw new Error('Usage: npm run acceptance:e2e -- SYMBOL [--acquire | --analysis] [--publish] [--replace-existing] [--confirm-visible]');
  }
  const options: Options = {
    symbol,
    acquire: args.includes('--acquire'),
    analysis: args.includes('--analysis'),
    publish: args.includes('--publish'),
    replaceExisting: args.includes('--replace-existing'),
    confirmVisible: args.includes('--confirm-visible'),
  };
  if (options.acquire && options.analysis) {
    throw new Error('--analysis performs a fresh full acquisition itself; do not combine it with --acquire.');
  }
  if (options.replaceExisting && !options.acquire && !options.analysis) {
    throw new Error('--replace-existing is only valid with --acquire or --analysis.');
  }
  if (options.confirmVisible && !options.publish) {
    throw new Error('--confirm-visible is only valid with --publish, after inspecting the workbook manually.');
  }
  return options;
}

async function exists(file: string): Promise<boolean> {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

async function readJson(file: string): Promise<any> {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function runTsx(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [TSX_CLI, path.join(ROOT, 'src', 'index.ts'), ...args], {
      cwd: ROOT,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    child.once('error', error => resolve({ code: 127, stdout, stderr: error.message }));
  });
}

async function runExporter(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string; payload?: any }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [TSX_CLI, path.join(ROOT, 'scripts', 'export-to-google-sheets.ts'), ...args], {
      cwd: ROOT,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('close', code => {
      let payload: any;
      for (let start = stdout.lastIndexOf('{'); start >= 0; start = stdout.lastIndexOf('{', start - 1)) {
        try {
          const candidate = JSON.parse(stdout.slice(start));
          if (candidate && typeof candidate === 'object' && 'ok' in candidate) { payload = candidate; break; }
        } catch {}
      }
      resolve({ code: code ?? 1, stdout, stderr, payload });
    });
    child.once('error', error => resolve({ code: 127, stdout, stderr: error.message }));
  });
}

function summarizeCommand(result: { code: number; stdout: string; stderr: string }) {
  return {
    exitCode: result.code,
    stdoutTail: result.stdout.trim().slice(-1800),
    stderrTail: result.stderr.trim().slice(-1800),
  };
}

async function main() {
  const options = parseArgs();
  const symbol = options.symbol;
  const researchDir = path.join(ROOT, 'research', symbol);
  const manifestPath = path.join(researchDir, 'manifest.json');
  const analysisPath = path.join(ROOT, 'outputs', `${symbol}-analysis.json`);
  const env: NodeJS.ProcessEnv = { ...process.env, GOOGLE_SHEETS_AUTO_EXPORT: 'false' };
  const report: Record<string, any> = {
    schema_version: '1.0',
    symbol,
    startedAt: new Date().toISOString(),
    mode: { acquire: options.acquire, analysis: options.analysis, publish: options.publish },
    stages: {},
    safety: {
      autoPublishDisabledForPipelineCommands: true,
      noBrokerOrTradingExecution: true,
      screenshotVisibilityRequiresManualWorkbookInspection: true,
    },
  };

  const existingManifest = await exists(manifestPath);
  if ((options.acquire || options.analysis) && existingManifest && !options.replaceExisting) {
    throw new Error(`Existing research artifacts would be replaced by this command. Re-run with --replace-existing after preserving anything needed: research/${symbol}`);
  }
  if (!options.acquire && !options.analysis && !existingManifest) {
    throw new Error(`No existing research manifest at research/${symbol}/manifest.json. Use --acquire to create a fresh research run.`);
  }

  let analysisCommandStartedAt = 0;
  if (options.acquire || options.analysis) {
    const command = options.analysis ? 'analyze' : 'research';
    if (options.analysis) analysisCommandStartedAt = Date.now();
    const result = await runTsx([command, symbol], env);
    report.stages[command] = summarizeCommand(result);
    if (result.code !== 0 && !(await exists(manifestPath))) {
      report.acceptance = 'failed';
      report.error = `The ${command} command failed before producing a research manifest.`;
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
  }

  // Existing artifacts are never silently reacquired by the inspection-only mode.
  const manifest = await readJson(manifestPath) as ResearchManifest;
  if (String(manifest.ticker || '').toUpperCase() !== symbol) {
    throw new Error(`Manifest ticker mismatch: expected ${symbol}, received ${String(manifest.ticker)}.`);
  }
  if (!Array.isArray(manifest.sourceArtifacts) || manifest.sourceArtifacts.length === 0) {
    throw new Error('Research manifest contains no sourceArtifacts; acquisition cannot be accepted.');
  }
  report.stages.acquisition = {
    status: 'present',
    generatedAt: manifest.generatedAt ?? null,
    sourceArtifacts: manifest.sourceArtifacts.length,
    successfulArtifacts: manifest.sourceArtifacts.filter(item => ['ok', 'ok_with_fallback'].includes(String(item.status))).length,
    failedArtifacts: manifest.sourceArtifacts.filter(item => !['ok', 'ok_with_fallback'].includes(String(item.status))).length,
    dataGaps: Array.isArray(manifest.dataGaps) ? manifest.dataGaps : [],
    warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
  };

  const prep = await runTsx(['prepare-analysis', symbol], env);
  report.stages.prepareAnalysis = summarizeCommand(prep);
  if (prep.code !== 0) {
    report.stages.prepareAnalysis.status = 'failed';
  }

  const quality = await buildEvidenceQuality(researchDir, manifest);
  const readiness = await buildAnalysisReadiness(researchDir, manifest);
  const savedQuality = await exists(path.join(researchDir, 'evidence-quality.json'))
    ? await readJson(path.join(researchDir, 'evidence-quality.json')) : null;
  const savedReadiness = await exists(path.join(researchDir, 'analysis-readiness.json'))
    ? await readJson(path.join(researchDir, 'analysis-readiness.json')) : null;
  const evidencePack = await exists(path.join(researchDir, 'normalized', 'analysis-evidence-pack.json'))
    ? await readJson(path.join(researchDir, 'normalized', 'analysis-evidence-pack.json')) : null;

  report.stages.evidenceQuality = {
    recomputedStatus: quality.status,
    savedStatus: savedQuality?.report?.status ?? savedQuality?.status ?? null,
    summary: quality.report.summary,
    coreCompleteness: quality.report.coreCompleteness,
    matchesSavedStatus: quality.status === (savedQuality?.report?.status ?? savedQuality?.status ?? null),
  };
  report.stages.readiness = {
    recomputedReady: readiness.ready,
    savedReady: typeof savedReadiness?.ready === 'boolean' ? savedReadiness.ready : null,
    blockingReasons: readiness.blockingReasons,
    advisoryReasons: readiness.advisoryReasons,
    missingFiles: readiness.missingFiles,
    actionableWarnings: readiness.actionableWarnings,
    matchesSavedReady: readiness.ready === savedReadiness?.ready,
  };
  report.stages.evidencePack = {
    exists: Boolean(evidencePack),
    tickerMatches: Boolean(evidencePack && String(evidencePack.ticker || '').toUpperCase() === symbol),
    canonicalFacts: Array.isArray(evidencePack?.canonicalFacts) ? evidencePack.canonicalFacts.length : 0,
    calculatedMetrics: Array.isArray(evidencePack?.calculatedMetrics) ? evidencePack.calculatedMetrics.length : 0,
    conflicts: Number(evidencePack?.reconciliation?.conflictCount ?? 0),
  };

  let analysis: any = null;
  let analysisIsCurrent = false;
  if (await exists(analysisPath)) {
    try {
      const candidate = await readJson(analysisPath);
      const analysisTimestamp = Date.parse(String(candidate?.analysis_meta?.analysis_timestamp || ''));
      const researchTimestamp = Date.parse(String(manifest.generatedAt || ''));
      const fileInfo = await stat(analysisPath);
      const freshForThisRun = !options.analysis || fileInfo.mtimeMs >= analysisCommandStartedAt - 1000;
      if (candidate && Number.isFinite(analysisTimestamp) && Number.isFinite(researchTimestamp) && analysisTimestamp >= researchTimestamp && freshForThisRun) {
        analysis = candidate;
        analysisIsCurrent = true;
      }
    } catch {}
  }
  report.stages.analysis = {
    requested: options.analysis,
    exists: Boolean(analysis),
    currentForResearchRun: analysisIsCurrent,
    schemaVersion: analysis?.schema_version ?? null,
    hasRecommendation: Boolean(analysis?.recommendation && typeof analysis.recommendation === 'object'),
    label: analysis?.recommendation?.action ?? 'RESEARCH_ONLY / NO CALL',
    status: analysis ? 'present_for_current_research' : (readiness.ready ? 'not_generated_or_stale' : 'blocked_by_readiness'),
    note: analysis ? 'Analysis artifact timestamp follows this research run; schema validation remains authoritative.' : 'Stale analysis artifacts are not treated as current. Absence of a current validated analysis is not a recommendation.',
  };

  const expectedChartFiles = ['tradingview-1d.png', 'tradingview-fullchart-5y.png', 'tradingview-fullchart-all.png'];
  const missingScreenshots = (await Promise.all(expectedChartFiles.map(async file => ({ file, present: await exists(path.join(researchDir, 'screenshots', file)) }))))
    .filter(item => !item.present).map(item => item.file);
  // The exact required screenshot set is advisory here; exporter outcome is the acceptance gate.
  report.stages.screenshotInputs = {
    primaryChartScreenshotExists: await exists(path.join(researchDir, 'screenshots', 'tradingview-1d.png')),
    expectedChartFilesMissing: missingScreenshots,
    note: 'Actual embedding is checked by the strict exporter mode; actual UI visibility still requires a human opening the workbook.',
  };

  if (options.publish) {
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || !process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN?.trim()) {
      report.stages.publish = { status: 'not_configured', error: 'GOOGLE_SHEETS_WEBHOOK_URL and GOOGLE_SHEETS_WEBHOOK_TOKEN are required.' };
    } else {
      const researchExport = await runExporter(['research', symbol, '--require-screenshot-embedding'], env);
      report.stages.publish = { research: researchExport.payload ?? summarizeCommand(researchExport), exitCode: researchExport.code };
      let publishOk = researchExport.code === 0 && researchExport.payload?.ok === true;
      if (analysis) {
        const analysisExport = await runExporter(['analysis', symbol, '--require-screenshot-embedding'], env);
        report.stages.publish.analysis = analysisExport.payload ?? summarizeCommand(analysisExport);
        report.stages.publish.analysisExitCode = analysisExport.code;
        publishOk = publishOk && analysisExport.code === 0 && analysisExport.payload?.ok === true;
      }
      report.stages.publish.status = publishOk ? 'receiver_confirmed_insertions' : 'failed';
      report.stages.publish.actualWorkbookVisibility = options.confirmVisible ? 'operator_confirmed' : 'pending_manual_workbook_inspection';
      report.stages.publish.note = 'Receiver-confirmed insertImage calls are not proof that image objects are visually visible. Open the returned workbook URL and inspect the screenshot rows.';
    }
  } else {
    report.stages.publish = { status: 'not_requested', note: 'No external write was attempted.' };
  }

  const commandFailures = Object.entries(report.stages)
    .filter(([name, stage]: [string, any]) => ['research', 'analyze', 'prepareAnalysis'].includes(name) && stage?.exitCode && stage.exitCode !== 0)
    .map(([name]) => name);
  const coreChecksPass =
    report.stages.acquisition.successfulArtifacts > 0 &&
    report.stages.evidencePack.exists &&
    report.stages.evidencePack.tickerMatches &&
    report.stages.evidenceQuality.matchesSavedStatus &&
    report.stages.readiness.matchesSavedReady;
  const analysisPass = !options.analysis || (readiness.ready && report.stages.analysis.exists && report.stages.analysis.currentForResearchRun && report.stages.analysis.hasRecommendation);
  const publishPass = !options.publish || report.stages.publish.status === 'receiver_confirmed_insertions';
  const visibilityPass = !options.publish || options.confirmVisible;
  const allPass = coreChecksPass && analysisPass && publishPass && visibilityPass && commandFailures.length === 0;
  report.stages.acceptance = {
    coreChecksPass,
    analysisPass,
    publishPass,
    visibilityPass,
    commandFailures,
    status: allPass ? (readiness.ready && report.stages.analysis.exists ? 'PASS_DECISION_READY' : 'PASS_RESEARCH_ONLY_NO_CALL') : (options.publish && publishPass && !visibilityPass ? 'PENDING_MANUAL_VISIBILITY_CHECK' : 'FAIL'),
  };
  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (!allPass) process.exitCode = options.publish && publishPass && !visibilityPass ? 2 : 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
