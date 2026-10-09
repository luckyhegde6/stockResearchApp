import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';

export type GoogleSheetsDatasetKind =
  | 'research'
  | 'analysis'
  | 'fullscan'
  | 'chartinkScan'
  | 'nse52w'
  | 'screenerScan'
  | 'tijoriScan'
  | 'news'
  | 'laya'
  | 'custom';

export type GoogleSheetsRunState =
  | 'waiting'
  | 'running'
  | 'publishing'
  | 'succeeded'
  | 'failed'
  | 'not_configured'
  | 'skipped';

export interface GoogleSheetsRun {
  runId: string;
  kind: GoogleSheetsDatasetKind;
  symbol: string;
  trigger: 'cli' | 'dashboard' | 'post_process';
  status: GoogleSheetsRunState;
  message: string;
  startedAt: string;
  completedAt?: string;
  spreadsheetUrl: string;
  tabs?: Array<{ tabName: string; dataset: string; rows: number }>;
  rowCount?: number;
  screenshotsSent?: number;
  screenshotsEmbedded?: number;
  screenshotsFailed?: number;
  error?: string;
}

interface SyncStateFile {
  schema_version: '1.0';
  updatedAt: string;
  recentRuns: GoogleSheetsRun[];
}

export interface GoogleSheetsStatus {
  configured: boolean;
  endpointConfigured: boolean;
  tokenConfigured: boolean;
  autoExportEnabled: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  lastRun: GoogleSheetsRun | null;
  recentRuns: GoogleSheetsRun[];
  statusFile: string;
}

export interface GoogleSheetsExportOptions {
  root?: string;
  file?: string;
  tab?: string;
  append?: boolean;
  trigger?: GoogleSheetsRun['trigger'];
  automatic?: boolean;
  runId?: string;
  contextMessage?: string;
}

export interface StartedGoogleSheetsExport {
  runId: string;
  completion: Promise<GoogleSheetsRun>;
}

const DEFAULT_SPREADSHEET_ID = '1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak';
const STATUS_RELATIVE_PATH = path.join('outputs', 'google-sheets-sync-status.json');

function safeId(value: string | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function statusPath(root: string): string {
  return path.join(root, STATUS_RELATIVE_PATH);
}

function configInfo(): Pick<GoogleSheetsStatus,
  'configured' | 'endpointConfigured' | 'tokenConfigured' | 'autoExportEnabled' | 'spreadsheetId' | 'spreadsheetUrl'> {
  const endpointConfigured = Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim());
  const tokenConfigured = Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN?.trim());
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  return {
    configured: endpointConfigured && tokenConfigured,
    endpointConfigured,
    tokenConfigured,
    autoExportEnabled: !/^(0|false|no)$/i.test(process.env.GOOGLE_SHEETS_AUTO_EXPORT || 'true'),
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=0#gid=0`,
  };
}

async function readState(root: string): Promise<SyncStateFile> {
  try {
    return JSON.parse(await readFile(statusPath(root), 'utf8')) as SyncStateFile;
  } catch {
    return { schema_version: '1.0', updatedAt: new Date().toISOString(), recentRuns: [] };
  }
}

async function persistRun(root: string, run: GoogleSheetsRun): Promise<void> {
  const file = statusPath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const current = await readState(root);
  const recentRuns = [run, ...current.recentRuns.filter(item => item.runId !== run.runId)].slice(0, 30);
  const next: SyncStateFile = {
    schema_version: '1.0',
    updatedAt: new Date().toISOString(),
    recentRuns,
  };
  await writeFile(file, JSON.stringify(next, null, 2), 'utf8');
}

export async function getGoogleSheetsSyncStatus(root = process.cwd()): Promise<GoogleSheetsStatus> {
  const config = configInfo();
  const state = await readState(root);
  return {
    ...config,
    lastRun: state.recentRuns[0] || null,
    recentRuns: state.recentRuns,
    statusFile: STATUS_RELATIVE_PATH.replaceAll(path.sep, '/'),
  };
}

function parseExporterOutput(stdout: string): any {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch {}
  // Resilient to a non-JSON prefix from a package runner; parse the last JSON object.
  for (let start = trimmed.lastIndexOf('{'); start >= 0; start = trimmed.lastIndexOf('{', start - 1)) {
    const candidate = trimmed.slice(start);
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && 'ok' in value) return value;
    } catch {}
  }
  throw new Error('Exporter returned no valid JSON response.');
}

function makeRun(
  runId: string,
  kind: GoogleSheetsDatasetKind,
  symbol: string | undefined,
  options: GoogleSheetsExportOptions,
  status: GoogleSheetsRunState,
  message: string,
): GoogleSheetsRun {
  const config = configInfo();
  return {
    runId,
    kind,
    symbol: safeId(symbol),
    trigger: options.trigger || 'cli',
    status,
    message,
    startedAt: new Date().toISOString(),
    spreadsheetUrl: config.spreadsheetUrl,
  };
}

async function executeExport(
  runId: string,
  kind: GoogleSheetsDatasetKind,
  symbol: string | undefined,
  options: GoogleSheetsExportOptions,
  root: string,
): Promise<GoogleSheetsRun> {
  const config = configInfo();
  if (options.automatic && !config.autoExportEnabled) {
    const run = makeRun(runId, kind, symbol, options, 'skipped', ['Automatic Google Sheets export is disabled by GOOGLE_SHEETS_AUTO_EXPORT=false.', options.contextMessage].filter(Boolean).join(' '));
    run.completedAt = new Date().toISOString();
    await persistRun(root, run);
    return run;
  }
  if (!config.configured) {
    const missing: string[] = [];
    if (!config.endpointConfigured) missing.push('GOOGLE_SHEETS_WEBHOOK_URL');
    if (!config.tokenConfigured) missing.push('GOOGLE_SHEETS_WEBHOOK_TOKEN');
    const run = makeRun(runId, kind, symbol, options, 'not_configured', [`Not synced: configure ${missing.join(' and ')} in .env.`, options.contextMessage].filter(Boolean).join(' '));
    run.completedAt = new Date().toISOString();
    await persistRun(root, run);
    console.log(`[sheets] ${run.message}`);
    return run;
  }

  const script = path.join(root, 'scripts', 'export-to-google-sheets.ts');
  const run = makeRun(runId, kind, symbol, options, 'publishing', [`Publishing ${kind}${symbol ? ` for ${safeId(symbol)}` : ''} to Google Sheets.`, options.contextMessage].filter(Boolean).join(' '));
  await persistRun(root, run);
  console.log(`[sheets] ${run.message}`);

  const args = [script, kind];
  if (symbol) args.push(safeId(symbol));
  if (options.file) args.push('--file', options.file);
  if (options.tab) args.push('--tab', options.tab);
  if (options.append) args.push('--append');

  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npx', ['tsx', ...args], {
      cwd: root,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
    child.on('error', reject);
  }).catch(error => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));

  if (result.code === 0) {
    try {
      const output = parseExporterOutput(result.stdout);
      if (output?.ok === false) throw new Error(output.error || 'Exporter reported failure.');
      run.status = 'succeeded';
      run.message = [`Published ${kind}${symbol ? ` for ${safeId(symbol)}` : ''} to Google Sheets.`, options.contextMessage].filter(Boolean).join(' ');
      run.tabs = Array.isArray(output.tabs) ? output.tabs : [];
      run.rowCount = Number(output.rowCount ?? run.tabs.reduce((sum: number, tab: any) => sum + Number(tab.rows || 0), 0));
      run.screenshotsSent = Number(output.screenshotsSent || 0);
      run.screenshotsEmbedded = Number(output.screenshotsEmbedded || 0);
      run.screenshotsFailed = Number(output.screenshotsFailed || 0);
    } catch (error) {
      run.status = 'failed';
      run.message = 'Exporter completed but its result could not be verified.';
      run.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    run.status = 'failed';
    run.message = 'Google Sheets export failed; local research results were preserved.';
    run.error = (result.stderr || result.stdout || `Exporter exited with code ${result.code}`).trim().slice(-3000);
  }

  run.completedAt = new Date().toISOString();
  await persistRun(root, run);
  if (run.status === 'succeeded') {
    console.log(`[sheets] ${run.message} rows=${run.rowCount ?? 0} screenshots=${run.screenshotsEmbedded ?? 0}`);
  } else {
    console.warn(`[sheets] ${run.message} ${run.error || ''}`);
  }
  return run;
}

export function startGoogleSheetsExport(
  kind: GoogleSheetsDatasetKind,
  symbol?: string,
  options: GoogleSheetsExportOptions = {},
): StartedGoogleSheetsExport {
  const root = path.resolve(options.root || process.cwd());
  const runId = options.runId || `sheets-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const completion = executeExport(runId, kind, symbol, options, root).catch(async error => {
    const failed = makeRun(runId, kind, symbol, options, 'failed', 'Google Sheets publishing step failed before completion.');
    failed.error = error instanceof Error ? error.message : String(error);
    failed.completedAt = new Date().toISOString();
    await persistRun(root, failed).catch(() => {});
    return failed;
  });
  return { runId, completion };
}

export async function publishAfterPipelineRun(
  kind: 'research' | 'analysis' | 'laya',
  symbol: string,
  root = process.cwd(),
): Promise<void> {
  const started = startGoogleSheetsExport(kind, symbol, { root, trigger: 'cli', automatic: true });
  const result = await started.completion;
  if (result.status === 'failed') {
    console.warn(`[sheets] Export failed (run ${result.runId}); local output remains available. Retry with: npm run sheets:export -- ${kind} ${safeId(symbol)}`);
  }
}

export async function runGoogleSheetsExport(
  kind: GoogleSheetsDatasetKind,
  symbol?: string,
  options: GoogleSheetsExportOptions = {},
): Promise<GoogleSheetsRun> {
  const started = startGoogleSheetsExport(kind, symbol, options);
  return started.completion;
}

export interface GoogleSheetsCommandStep {
  runId: string;
  command: string;
  target?: string;
  trigger: GoogleSheetsRun['trigger'];
  root: string;
  startedAt: string;
}

export interface GoogleSheetsCommandOutcome {
  exitCode: number;
  completedAt?: string;
  error?: string;
}

export async function beginGoogleSheetsCommandStep(
  command: string,
  target: string | undefined,
  root = process.cwd(),
  trigger: GoogleSheetsRun['trigger'] = 'cli',
): Promise<GoogleSheetsCommandStep> {
  const resolvedRoot = path.resolve(root);
  const startedAt = new Date().toISOString();
  const runId = `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = configInfo();
  const run = makeRun(
    runId,
    'custom',
    target || command,
    { root: resolvedRoot, trigger },
    'running',
    config.configured
      ? `Command/process "${command}" started. The Google Sheets step will publish its run record when the process exits.`
      : `Command/process "${command}" started. The Google Sheets step is active; connection credentials are not configured yet.`,
  );
  run.startedAt = startedAt;
  await persistRun(resolvedRoot, run);
  console.log(`[sheets] step started for ${command} (run ${runId})`);
  return { runId, command, target, trigger, root: resolvedRoot, startedAt };
}

export async function completeGoogleSheetsCommandStep(
  step: GoogleSheetsCommandStep,
  outcome: GoogleSheetsCommandOutcome,
): Promise<GoogleSheetsRun> {
  const completedAt = outcome.completedAt || new Date().toISOString();
  const safeCommand = step.command.replace(/[^A-Za-z0-9:_-]+/g, '-').slice(0, 60) || 'command';
  const tabDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(completedAt));
  const report = [{
    runId: step.runId,
    command: step.command,
    target: safeId(step.target),
    trigger: step.trigger,
    outcome: outcome.exitCode === 0 ? 'succeeded' : 'failed',
    exitCode: outcome.exitCode,
    startedAt: step.startedAt,
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(step.startedAt).getTime()),
    error: outcome.error || '',
  }];
  const safeTimestamp = step.startedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(step.root, 'outputs', 'command-runs', `${safeTimestamp}-${safeCommand}.json`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  const result = await runGoogleSheetsExport('custom', step.target || step.command, {
    root: step.root,
    file: path.relative(step.root, reportPath),
    tab: `command-runs-${tabDate}`,
    append: true,
    trigger: step.trigger,
    automatic: true,
    runId: step.runId,
    contextMessage: `Command/process "${step.command}" ${outcome.exitCode === 0 ? 'completed successfully' : `failed with exit code ${outcome.exitCode}`}; the local run record is ${path.relative(step.root, reportPath)}.`,
  });
  if (result.status === 'succeeded') {
    console.log(`[sheets] command step synced: ${step.command} (run ${step.runId})`);
  } else {
    console.log(`[sheets] command step final state: ${result.status} — ${result.message}`);
  }
  return result;
}

export async function announceGoogleSheetsStep(
  kind: GoogleSheetsDatasetKind,
  target: string,
  root = process.cwd(),
  trigger: GoogleSheetsRun['trigger'] = 'dashboard',
): Promise<GoogleSheetsRun> {
  const config = configInfo();
  const status: GoogleSheetsRunState = !config.autoExportEnabled
    ? 'skipped'
    : (!config.configured ? 'not_configured' : 'waiting');
  const message = status === 'skipped'
    ? 'Publishing is disabled by GOOGLE_SHEETS_AUTO_EXPORT=false.'
    : status === 'not_configured'
      ? 'This run reached the Google Sheets step, but the webhook URL/token are not configured.'
      : 'Run started. Google Sheets publishing will begin after local artifacts are ready.';
  return writeGoogleSheetsStatusMessage(status, message, { kind, symbol: target, root, trigger });
}

export async function writeGoogleSheetsStatusMessage(
  status: 'waiting' | 'publishing' | 'succeeded' | 'failed' | 'not_configured' | 'skipped',
  message: string,
  details: { kind?: GoogleSheetsDatasetKind; symbol?: string; root?: string; trigger?: GoogleSheetsRun['trigger']; error?: string } = {},
): Promise<GoogleSheetsRun> {
  const root = path.resolve(details.root || process.cwd());
  const runId = `sheets-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const run = makeRun(runId, details.kind || 'custom', details.symbol, { root, trigger: details.trigger || 'post_process' }, status, message);
  if (details.error) run.error = details.error;
  if (status !== 'publishing' && status !== 'waiting') run.completedAt = new Date().toISOString();
  await persistRun(root, run);
  return run;
}

export async function resolveGoogleSheetsExportFile(
  kind: GoogleSheetsDatasetKind,
  root = process.cwd(),
): Promise<string | undefined> {
  if (kind === 'chartinkScan') {
    const scanRoot = path.join(root, 'scans');
    const candidates = [
      path.join(scanRoot, 'index.json'),
      path.join(root, 'research', 'chartink', 'top20', 'index.json'),
    ];
    try {
      const entries = await readdir(scanRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('52-Week-High-')) {
          candidates.push(path.join(scanRoot, entry.name, 'index.json'));
        }
      }
    } catch {}

    const existing: Array<{ file: string; modifiedAt: number }> = [];
    for (const candidate of [...new Set(candidates)]) {
      try {
        const info = await stat(candidate);
        if (info.isFile()) existing.push({ file: candidate, modifiedAt: info.mtimeMs });
      } catch {}
    }
    existing.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return existing[0]?.file || candidates[0];
  }
  if (kind === 'screenerScan') return path.join(root, 'research', 'market-screens', 'screener', 'index.json');
  if (kind === 'tijoriScan') return path.join(root, 'research', 'market-screens', 'tijori', 'index.json');
  if (kind !== 'nse52w') return undefined;

  const scansRoot = path.join(root, 'scans');
  try {
    const dirs = await readdir(scansRoot, { withFileTypes: true });
    const candidates = dirs.filter(item => item.isDirectory() && item.name.startsWith('52-Week-High-'));
    const dated = candidates.map(item => {
      const datePart = item.name.slice('52-Week-High-'.length);
      const segments = datePart.split('-');
      const valid = segments.length === 3 && segments.every((segment, index) => segment.length === (index === 2 ? 4 : 2) && /^[0-9]+$/.test(segment));
      const timestamp = valid ? new Date(Number(segments[2]), Number(segments[1]) - 1, Number(segments[0])).getTime() : 0;
      return { name: item.name, timestamp };
    }).filter(item => item.timestamp > 0).sort((a, b) => b.timestamp - a.timestamp);
    if (!dated.length) return path.join(scansRoot, 'not-yet-generated', 'raw', 'nse-api', '52-week-high.normalized.json');
    return path.join(scansRoot, dated[0].name, 'raw', 'nse-api', '52-week-high.normalized.json');
  } catch {
    return path.join(scansRoot, 'not-yet-generated', 'raw', 'nse-api', '52-week-high.normalized.json');
  }
}

export async function getAvailableSheetArtifacts(root = process.cwd(), symbol?: string): Promise<Record<string, boolean>> {
  const ticker = safeId(symbol);
  const checks: Record<string, string> = {};
  for (const kind of ['chartinkScan', 'nse52w', 'screenerScan', 'tijoriScan'] as const) {
    checks[kind] = (await resolveGoogleSheetsExportFile(kind, root)) || '';
  }
  if (ticker) {
    checks.research = path.join(root, 'research', ticker, 'manifest.json');
    checks.analysis = path.join(root, 'outputs', `${ticker}-analysis.json`);
    checks.laya = path.join(root, 'research', ticker, 'normalized', 'laya-decisions.json');
    checks.news = path.join(root, 'research', ticker, 'normalized', 'news-sentiment.json');
    checks.fullscan = path.join(root, 'research', ticker, 'fullscan.json');
  }
  const entries = await Promise.all(Object.entries(checks).map(async ([key, file]) => {
    try {
      if (!file) return [key, false] as const;
      await access(file);
      return [key, true] as const;
    } catch {
      return [key, false] as const;
    }
  }));
  return Object.fromEntries(entries);
}
