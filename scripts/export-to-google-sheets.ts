import 'dotenv/config';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import {
  buildVisualEvidenceRows,
  transformAnalysisToSheets,
  transformResearchToSheets,
  type ScreenshotRowInput,
  type ScreenshotUpload,
  type ResearchSheetTab,
} from './google-sheets-transformers.js';

const ROOT = process.cwd();
const SHEET_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const SHEET_TOKEN = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID || '1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak';

type Kind = 'research' | 'analysis' | 'fullscan' | 'chartinkScan' | 'nse52w' | 'screenerScan' | 'tijoriScan' | 'news' | 'laya' | 'custom';

interface ParsedArgs {
  kind: Kind;
  symbol?: string;
  file?: string;
  tab?: string;
  append: boolean;
}

function usage(): never {
  throw new Error(
    'Usage: npm run sheets:export -- <kind> [SYMBOL] [--file path] [--tab name] [--append]\n' +
    'Kinds: research, analysis, fullscan, chartinkScan, nse52w, screenerScan, tijoriScan, news, laya, custom'
  );
}

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let file: string | undefined;
  let tab: string | undefined;
  let append = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--append') {
      append = true;
    } else if (arg === '--file') {
      file = argv[++i];
      if (!file) throw new Error('--file requires a path');
    } else if (arg === '--tab') {
      tab = argv[++i];
      if (!tab) throw new Error('--tab requires a tab name');
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const kind = positional[0] as Kind | undefined;
  const allowed: Kind[] = ['research', 'analysis', 'fullscan', 'chartinkScan', 'nse52w', 'screenerScan', 'tijoriScan', 'news', 'laya', 'custom'];
  if (!kind || !allowed.includes(kind)) usage();
  return { kind, symbol: positional[1]?.toUpperCase(), file, tab, append };
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultTab(kind: Kind, symbol?: string) {
  const date = isoDate();
  const s = symbol || 'dataset';
  switch (kind) {
    case 'research': return `${s}-${date}-research`;
    case 'analysis': return `${s}-${date}-analysis`;
    case 'fullscan': return `${s}-${date}-fullscan`;
    case 'chartinkScan': return `chartinkScan-${date}`;
    case 'nse52w': return `nse52wScan-${date}`;
    case 'screenerScan': return `screenerScan-${date}`;
    case 'tijoriScan': return `tijoriScan-${date}`;
    case 'news': return `${s}-${date}-news`;
    case 'laya': return `${s}-${date}-laya`;
    case 'custom': return `dataset-${date}`;
  }
}

async function loadJson(file: string): Promise<any> {
  return JSON.parse(await readFile(file, 'utf8'));
}

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function objectToRows(value: any, source: string, symbol?: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ source, symbol, status: 'empty_dataset' }];
    return value.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return { source, symbol, row: index + 1, ...item };
      }
      return { source, symbol, row: index + 1, value: scalar(item) };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => ({
      source,
      symbol,
      field: key,
      value: scalar(item),
    }));
  }
  return [{ source, symbol, value: scalar(value) }];
}

async function loadResearchArtifacts(symbol: string): Promise<Record<string, any>> {
  const root = path.join(ROOT, 'research', symbol);
  const files: Array<[string, string]> = [
    ['manifest', 'manifest.json'],
    ['readiness', 'analysis-readiness.json'],
    ['analysisInputs', 'normalized/analysis-inputs.json'],
    ['evidencePack', 'normalized/analysis-evidence-pack.json'],
    ['reconciliation', 'normalized/reconciliation.json'],
    ['sourceHealth', 'source-health.json'],
    ['evidenceQuality', 'evidence-quality.json'],
  ];
  const artifacts: Record<string, any> = {};
  for (const [key, relative] of files) {
    try {
      artifacts[key] = await loadJson(path.join(root, relative));
    } catch {
      artifacts[key] = null;
    }
  }
  if (!artifacts.manifest) {
    throw new Error(`Missing research manifest: ${path.join(root, 'manifest.json')}. Run research first.`);
  }
  return artifacts;
}

function screenshotOrder(a: string, b: string): number {
  const preferred = ['tradingview-1d.png', 'tradingview-fullchart-5y.png', 'tradingview-fullchart-all.png'];
  const ai = preferred.indexOf(a.toLowerCase());
  const bi = preferred.indexOf(b.toLowerCase());
  if (ai >= 0 || bi >= 0) {
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  }
  return a.localeCompare(b);
}

async function collectScreenshots(symbol: string, baseTab: string): Promise<{ tab: ResearchSheetTab; uploads: ScreenshotUpload[]; count: number }> {
  const screenshotDir = path.join(ROOT, 'research', symbol, 'screenshots');
  const maxFileBytes = Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES || 1_500_000);
  const maxTotalBytes = Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOT_TOTAL_BYTES || 5_000_000);
  const maxFiles = Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOTS || 8);
  let files: string[] = [];
  try {
    files = (await readdir(screenshotDir)).filter(name => /\.(png|jpe?g|webp)$/i.test(name)).sort(screenshotOrder).slice(0, maxFiles);
  } catch {
    files = [];
  }

  const rows: ScreenshotRowInput[] = [];
  const uploads: ScreenshotUpload[] = [];
  let totalBytes = 0;
  for (const fileName of files) {
    const fullPath = path.join(screenshotDir, fileName);
    const info = await stat(fullPath);
    const relativePath = path.relative(ROOT, fullPath).replaceAll(path.sep, '/');
    const mimeType = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
    let status = 'embedded';
    let base64: string | undefined;
    if (info.size === 0) {
      status = 'skipped_empty_file';
    } else if (info.size > maxFileBytes) {
      status = `skipped_file_over_limit_${maxFileBytes}_bytes`;
    } else if (totalBytes + info.size > maxTotalBytes) {
      status = `skipped_total_over_limit_${maxTotalBytes}_bytes`;
    } else {
      base64 = (await readFile(fullPath)).toString('base64');
      totalBytes += info.size;
    }
    const rowIndex = rows.length + 2;
    rows.push({ fileName, relativePath, sizeBytes: info.size, mimeType, status, rowIndex, base64 });
    if (base64) {
      uploads.push({
        tabName: `${baseTab}-visual-evidence`.slice(0, 90),
        rowIndex,
        fileName,
        mimeType,
        sizeBytes: info.size,
        base64,
      });
    }
  }

  const visualTab: ResearchSheetTab = {
    tabName: `${baseTab}-visual-evidence`.slice(0, 90),
    dataset: 'visual-evidence',
    rows: buildVisualEvidenceRows(symbol, rows),
  };
  return { tab: visualTab, uploads, count: uploads.length };
}

async function buildExport(parsed: ParsedArgs, baseTab: string): Promise<{ tabs: ResearchSheetTab[]; screenshots: ScreenshotUpload[] }> {
  const { kind, symbol, file } = parsed;

  if (kind === 'research') {
    if (!symbol) usage();
    const artifacts = await loadResearchArtifacts(symbol);
    const tabs = transformResearchToSheets(artifacts, symbol, baseTab);
    const visuals = await collectScreenshots(symbol, baseTab);
    return { tabs: [...tabs, visuals.tab], screenshots: visuals.uploads };
  }

  let sourceFile = file;
  if (!sourceFile && symbol && kind === 'analysis') {
    sourceFile = path.join(ROOT, 'outputs', `${symbol}-analysis.json`);
  }
  if (!sourceFile) {
    throw new Error('This dataset requires --file. For research/analysis, a symbol can be supplied.');
  }
  const resolved = path.resolve(ROOT, sourceFile);
  const value = await loadJson(resolved);

  if (kind === 'analysis') {
    if (!symbol && !value?.company?.ticker) throw new Error('Analysis export requires SYMBOL or company.ticker in the analysis JSON.');
    const ticker = String(value?.company?.ticker ?? symbol).toUpperCase();
    const tabs = transformAnalysisToSheets(value, ticker, baseTab);
    const visuals = await collectScreenshots(ticker, baseTab);
    return { tabs: [...tabs, visuals.tab], screenshots: visuals.uploads };
  }

  return {
    tabs: [{
      tabName: baseTab.slice(0, 90),
      dataset: kind,
      rows: objectToRows(value, path.relative(ROOT, resolved), symbol),
    }],
    screenshots: [],
  };
}

async function main() {
  if (!SHEET_URL) throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured in .env');
  if (!SHEET_TOKEN) throw new Error('GOOGLE_SHEETS_WEBHOOK_TOKEN is not configured in .env');

  const parsed = parseArgs();
  const baseTab = parsed.tab || defaultTab(parsed.kind, parsed.symbol);
  const { tabs, screenshots } = await buildExport(parsed, baseTab);
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dataset = parsed.kind;
  const response = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: SHEET_TOKEN,
      spreadsheetId: SPREADSHEET_ID,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
      runId,
      symbol: parsed.symbol || '',
      dataset,
      mode: parsed.append ? 'append' : 'replace',
      tabs,
      screenshots,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error(`Google Sheets sink HTTP ${response.status}: ${responseText}`);
  let result: any;
  try { result = JSON.parse(responseText); } catch { result = { raw: responseText }; }
  if (result?.ok === false) throw new Error(`Google Sheets sink rejected export: ${result.error || 'unknown error'}`);

  console.log(JSON.stringify({
    ok: true,
    runId,
    kind: dataset,
    symbol: parsed.symbol || '',
    spreadsheetUrl: result.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    tabs: tabs.map(item => ({ tabName: item.tabName, dataset: item.dataset, rows: item.rows.length })),
    rowCount: tabs.reduce((sum, item) => sum + item.rows.length, 0),
    screenshotsSent: screenshots.length,
    screenshotsEmbedded: result.screenshotsEmbedded ?? 0,
    screenshotsFailed: result.screenshotsFailed ?? 0,
    response: result,
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
