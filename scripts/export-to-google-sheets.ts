import 'dotenv/config';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { readFile, readdir, stat } from 'node:fs/promises';
import {
  transformAnalysisToSheets,
  transformResearchToSheets,
  fitWithinPixelLimit,
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
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10);
  const runTime = iso.slice(11, 23).replace(/[:.]/g, '');
  const s = symbol || 'dataset';
  switch (kind) {
    case 'research': return `${s}-${date}-${runTime}-research`;
    case 'analysis': return `${s}-${date}-${runTime}-analysis`;
    case 'fullscan': return `${s}-${date}-${runTime}-fullscan`;
    case 'chartinkScan': return `chartinkScan-${date}-${runTime}`;
    case 'nse52w': return `nse52wScan-${date}-${runTime}`;
    case 'screenerScan': return `screenerScan-${date}-${runTime}`;
    case 'tijoriScan': return `tijoriScan-${date}-${runTime}`;
    case 'news': return `${s}-${date}-${runTime}-news`;
    case 'laya': return `${s}-${date}-${runTime}-laya`;
    case 'custom': return `dataset-${date}-${runTime}`;
  }
}

async function loadJson(file: string): Promise<any> {
  return JSON.parse(await readFile(file, 'utf8'));
}

function isPathLikeKey(key: string): boolean {
  return /^(?:path|localPath|relativePath|artifactPath|screenshotPath|evidencePath|reportPath|filePath|sourcePath|local_path|relative_path|artifact_path|screenshot_path|evidence_path|report_path|file_path|source_path)$/i.test(key) ||
    /(?:local|relative|artifact|screenshot|evidence|report|file|source)[_-]?path/i.test(key);
}

function isPathLikeValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  const drivePath = /^[A-Za-z]:/.test(text) && (text.charAt(2) === '\\' || text.charAt(2) === '/');
  const uncPath = text.charAt(0) === '\\' && text.charAt(1) === '\\';
  return drivePath || uncPath ||
    text.startsWith('/Users/') || text.startsWith('/home/') || text.startsWith('/mnt/') ||
    text.startsWith('research/') || text.startsWith('research\\') ||
    text.startsWith('outputs/') || text.startsWith('outputs\\');
}

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value, (key, item) =>
    isPathLikeKey(key) || isPathLikeValue(item) ? undefined : item
  ) ?? '';
}

function stripLocalPaths(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter(item => !isPathLikeValue(item)).map(stripLocalPaths);
  }
  if (typeof value === 'string') return isPathLikeValue(value) ? '' : value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => !isPathLikeKey(key) && !isPathLikeValue(item))
      .map(([key, item]) => [key, stripLocalPaths(item)]));
  }
  return value;
}

function objectToRows(value: any, source: string, symbol?: string): Record<string, unknown>[] {
  const clean = stripLocalPaths(value) as any;
  if (Array.isArray(clean)) {
    if (clean.length === 0) return [{ source, symbol, status: 'empty_dataset' }];
    return clean.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return { source, symbol, row: index + 1, ...item };
      }
      return { source, symbol, row: index + 1, value: scalar(item) };
    });
  }
  if (clean && typeof clean === 'object') {
    return Object.entries(clean).map(([key, item]) => ({
      source,
      symbol,
      field: key,
      value: scalar(item),
    }));
  }
  return [{ source, symbol, value: scalar(clean) }];
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

async function compressScreenshotForSheets(
  page: Page,
  inputBase64: string,
  inputMimeType: string,
  maxBytes: number,
): Promise<{ base64: string; mimeType: 'image/jpeg'; sizeBytes: number; width: number; height: number; originalWidth: number; originalHeight: number; quality: number }> {
  const pixelLimit = 900_000;
  return page.evaluate(async ({ base64, mimeType, byteLimit, maxPixels }) => {
    const image = new Image();
    image.src = 'data:' + mimeType + ';base64,' + base64;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Chromium could not decode the screenshot image.');
    }

    const scale = Math.min(1, Math.sqrt(maxPixels / (image.naturalWidth * image.naturalHeight)));
    let width = Math.max(1, Math.floor(image.naturalWidth * scale));
    let height = Math.max(1, Math.floor(image.naturalHeight * scale));
    while (width * height > maxPixels) {
      if (width >= height) width -= 1;
      else height -= 1;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Chromium could not create a 2D canvas for screenshot compression.');
    const qualities = [0.88, 0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46, 0.40, 0.34];

    for (let resizeAttempt = 0; resizeAttempt < 10; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const outputBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const sizeBytes = Math.floor(outputBase64.length * 3 / 4);
        if (sizeBytes <= byteLimit && width * height <= maxPixels) {
          return { base64: outputBase64, sizeBytes, width, height, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, quality };
        }
      }
      width = Math.max(1, Math.floor(width * 0.82));
      height = Math.max(1, Math.floor(height * 0.82));
    }
    throw new Error('Compression could not meet the Apps Script byte and pixel limits.');
  }, { base64: inputBase64, mimeType: inputMimeType, byteLimit: maxBytes, maxPixels: pixelLimit })
    .then(result => ({ ...result, mimeType: 'image/jpeg' as const }));
}

async function collectScreenshots(symbol: string): Promise<{ rows: ScreenshotRowInput[]; uploads: ScreenshotUpload[] }> {
  const screenshotDir = path.join(ROOT, 'research', symbol, 'screenshots');
  const maxUploadBytes = Math.min(
    Math.max(100_000, Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES || 1_400_000)),
    1_800_000,
  );
  const maxSourceBytes = Math.max(
    maxUploadBytes,
    Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOT_SOURCE_BYTES || 20_000_000),
  );
  const maxTotalBytes = Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOT_TOTAL_BYTES || 5_000_000);
  const maxFiles = Number(process.env.GOOGLE_SHEETS_MAX_SCREENSHOTS || 8);
  let files: string[] = [];
  try {
    files = (await readdir(screenshotDir))
      .filter(name => /\.(png|jpe?g|webp)$/i.test(name))
      .sort(screenshotOrder)
      .slice(0, maxFiles);
  } catch {
    files = [];
  }

  const rows: ScreenshotRowInput[] = [];
  const uploads: ScreenshotUpload[] = [];
  let totalBytes = 0;
  let browser: Browser | undefined;
  let page: Page | undefined;
  let browserInitError: string | undefined;
  try {
    for (const fileName of files) {
      const fullPath = path.join(screenshotDir, fileName);
      const info = await stat(fullPath);
      const sourceMimeType = /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png';
      let rowStatus = 'pending_embedding';
      let base64: string | undefined;
      let uploadSizeBytes = info.size;
      let outputWidth: number | undefined;
      let outputHeight: number | undefined;\n      let originalWidth: number | undefined;\n      let originalHeight: number | undefined;\n      let compressionQuality: number | undefined;\n      let optimizationOccurred = false;

      if (info.size === 0) {
        rowStatus = 'skipped_empty_file';
      } else if (info.size > maxSourceBytes) {
        rowStatus = `skipped_source_over_limit_${maxSourceBytes}_bytes`;
      } else if (totalBytes >= maxTotalBytes) {
        rowStatus = `skipped_total_over_limit_${maxTotalBytes}_bytes`;
      } else {
        try {
          if (!page) {
            if (browserInitError) throw new Error(browserInitError);
            try {
              browser = await chromium.launch({ headless: true });
              page = await browser.newPage();
            } catch (error) {
              browserInitError = error instanceof Error ? error.message : String(error);
              throw new Error('Could not start Playwright Chromium to resize screenshots. Run "npx playwright install chromium" and retry. ' + browserInitError);
            }
          }
          const sourceBase64 = (await readFile(fullPath)).toString('base64');
          const normalized = await compressScreenshotForSheets(
            page,
            sourceBase64,
            sourceMimeType,
            maxUploadBytes,
          );
          // Keep the pure sizing contract in sync with the in-browser canvas implementation.
          const safeSize = fitWithinPixelLimit(normalized.width, normalized.height, 900_000);
          if (safeSize.width !== normalized.width || safeSize.height !== normalized.height) {
            throw new Error('Normalized screenshot dimensions exceed the 900,000-pixel safety limit.');
          }
          if (normalized.sizeBytes > maxUploadBytes) {
            rowStatus = `skipped_compressed_over_limit_${maxUploadBytes}_bytes`;
          } else if (totalBytes + normalized.sizeBytes > maxTotalBytes) {
            rowStatus = `skipped_total_over_limit_${maxTotalBytes}_bytes`;
          } else {
            base64 = normalized.base64;
            uploadSizeBytes = normalized.sizeBytes;
            outputWidth = normalized.width;
            outputHeight = normalized.height;
            totalBytes += normalized.sizeBytes;
            rowStatus = 'pending_embedding';
          }
        } catch (error) {
          rowStatus = 'resize_failed: ' + (error instanceof Error ? error.message : String(error)).slice(0, 250);
        }
      }

      rows.push({
        fileName,
        relativePath: '',
        sizeBytes: uploadSizeBytes,
        originalSizeBytes: info.size,
        width: outputWidth,
        height: outputHeight,
        mimeType: base64 ? 'image/jpeg' : sourceMimeType,
        status: base64 ? 'pending_embedding' : rowStatus,
        rowIndex: 0,
        base64,
      });
      if (base64) {
        uploads.push({
          tabName: '',
          rowIndex: 0,
          fileName,
          mimeType: 'image/jpeg',
          sizeBytes: uploadSizeBytes,
          base64,
        });
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
  return { rows, uploads };
}

function appendScreenshotSection(
  tab: ResearchSheetTab,
  symbol: string,
  screenshots: ScreenshotRowInput[],
  uploads: ScreenshotUpload[],
): void {
  tab.rows.push({
    section: 'SCREENSHOTS',
    record_type: 'section_header',
    symbol: symbol.toUpperCase(),
    domain: 'TradingView',
    field: 'SCREENSHOTS',
    value: '',
  });
  if (!screenshots.length) {
    tab.rows.push({
      section: 'SCREENSHOTS',
      record_type: 'visual_evidence',
      symbol: symbol.toUpperCase(),
      domain: 'TradingView',
      field: 'screenshots',
      value: 'no_screenshots_found',
      status: 'not_available',
      notes: 'No chart images were found in this research run.',
      file_name: '',
      size_bytes: '',
      embedding_status: 'not_available',
      preview: '',
    });
    return;
  }

  for (const screenshot of screenshots) {
    const rowIndex = tab.rows.length + 2;
    const chartPeriod = screenshot.fileName
      .replace(/^tradingview[-_]?/i, '')
      .replace(/\.(png|jpe?g|webp)$/i, '');
    const upload = uploads.find(item => item.fileName === screenshot.fileName);
    const embeddingStatus = screenshot.base64 ? 'pending_embedding' : screenshot.status;
    tab.rows.push({
      section: 'SCREENSHOTS',
      record_type: 'visual_evidence',
      symbol: symbol.toUpperCase(),
      domain: 'TradingView',
      field: chartPeriod,
      value: screenshot.status,
      file_name: screenshot.fileName,
      size_bytes: screenshot.sizeBytes,
      original_size_bytes: screenshot.originalSizeBytes ?? screenshot.sizeBytes,
      image_width: screenshot.width ?? '',
      image_height: screenshot.height ?? '',
      status: screenshot.status,
      embedding_status: embeddingStatus,
      notes: screenshot.base64 ? 'Optimized image payload is attached; final status is set by Apps Script after insertion.' : screenshot.status,
      preview: '',
    });
    if (upload) {
      upload.tabName = tab.tabName;
      upload.rowIndex = rowIndex;
    }
  }
}

async function buildExport(parsed: ParsedArgs, baseTab: string): Promise<{ tabs: ResearchSheetTab[]; screenshots: ScreenshotUpload[] }> {
  const { kind, symbol, file } = parsed;

  if (kind === 'research') {
    if (!symbol) usage();
    const artifacts = await loadResearchArtifacts(symbol);
    const tabs = transformResearchToSheets(artifacts, symbol, baseTab);
    const visuals = await collectScreenshots(symbol);
    appendScreenshotSection(tabs[0], symbol, visuals.rows, visuals.uploads);
    return { tabs, screenshots: visuals.uploads };
  }

  let sourceFile = file;
  if (!sourceFile && symbol && kind === 'analysis') {
    sourceFile = path.join(ROOT, 'outputs', `${symbol}-analysis.json`);
  }
  if (!sourceFile && symbol && kind === 'laya') {
    sourceFile = path.join(ROOT, 'research', symbol, 'normalized', 'laya-decisions.json');
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
    const visuals = await collectScreenshots(ticker);
    appendScreenshotSection(tabs[0], ticker, visuals.rows, visuals.uploads);
    return { tabs, screenshots: visuals.uploads };
  }

  return {
    tabs: [{
      tabName: baseTab.slice(0, 90),
      dataset: kind,
      rows: objectToRows(value, 'provided_dataset', symbol),
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
  const contentType = response.headers.get('content-type') || '';
  const looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(responseText);
  if (!response.ok) {
    if (looksLikeHtml) {
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(responseText)?.[1]?.replace(/\s+/g, ' ').trim();
      throw new Error(
        `Google Sheets webhook returned HTTP ${response.status} with HTML${title ? ` (" ${title} ")` : ''}, not Apps Script JSON. ` +
        'The deployed URL is likely stale, incorrect, or not accessible. Run "npm run sheets:doctor"; if its health check fails, redeploy integrations/google-sheets/Code.gs as a Web app and update GOOGLE_SHEETS_WEBHOOK_URL to the current URL ending in /exec. Do not rotate the token until the endpoint health check passes.'
      );
    }
    throw new Error(`Google Sheets sink HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(responseText);
  } catch {
    if (looksLikeHtml) {
      throw new Error('Google Sheets webhook returned HTML instead of JSON. Check that GOOGLE_SHEETS_WEBHOOK_URL is the current deployed Apps Script /exec URL, then run "npm run sheets:doctor".');
    }
    throw new Error(`Google Sheets webhook returned invalid JSON: ${responseText.slice(0, 500)}`);
  }
  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('Google Sheets webhook returned an unexpected JSON value; expected an object.');
  }
  const result = parsedPayload as Record<string, unknown>;
  if (result.ok === false) {
    const error = typeof result.error === 'string' ? result.error : 'unknown error';
    throw new Error(`Google Sheets sink rejected export: ${error}`);
  }
  if (result.ok !== true) {
    throw new Error('Google Sheets webhook response did not contain ok: true; verify the deployed Apps Script version.');
  }

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
