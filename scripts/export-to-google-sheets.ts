import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const ROOT = process.cwd();
const SHEET_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const SHEET_TOKEN = process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;

type Kind = 'research' | 'analysis' | 'fullscan' | 'chartinkScan' | 'nse52w' | 'screenerScan' | 'tijoriScan' | 'news' | 'laya' | 'custom';

function usage(): never {
  throw new Error(
    'Usage: npm run sheets:export -- <kind> [SYMBOL] [--file path] [--tab name] [--append]\n' +
    'Kinds: research, analysis, fullscan, chartinkScan, nse52w, screenerScan, tijoriScan, news, laya, custom'
  );
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function args() {
  const positional = process.argv.slice(2).filter(v => !v.startsWith('--'));
  const kind = positional[0] as Kind | undefined;
  if (!kind) usage();
  const symbol = positional[1]?.toUpperCase();
  return {
    kind,
    symbol,
    file: flag('--file'),
    tab: flag('--tab'),
    append: hasFlag('--append'),
  };
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

async function loadJson(file: string) {
  const text = await readFile(file, 'utf8');
  return JSON.parse(text);
}

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function objectToRows(value: any, source: string, symbol?: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ source, symbol, row: 0 }];
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
      key,
      value: scalar(item),
    }));
  }

  return [{ source, symbol, value: scalar(value) }];
}

async function buildResearchRows(symbol: string) {
  const root = path.join(ROOT, 'research', symbol);
  const files = [
    ['manifest', 'manifest.json'],
    ['readiness', 'analysis-readiness.json'],
    ['analysisInputs', 'normalized/analysis-inputs.json'],
    ['evidencePack', 'normalized/analysis-evidence-pack.json'],
    ['reconciliation', 'normalized/reconciliation.json'],
    ['sourceHealth', 'source-health.json'],
    ['evidenceQuality', 'evidence-quality.json'],
  ] as const;

  const rows: Record<string, unknown>[] = [];
  for (const [name, rel] of files) {
    try {
      const value = await loadJson(path.join(root, rel));
      rows.push(...objectToRows(value, rel, symbol).map(row => ({ section: name, ...row })));
    } catch {
      rows.push({ section: name, source: rel, symbol, status: 'missing' });
    }
  }
  return rows;
}

async function buildRows(kind: Kind, symbol: string | undefined, file?: string) {
  if (kind === 'research') {
    if (!symbol) usage();
    return buildResearchRows(symbol);
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
  return objectToRows(value, path.relative(ROOT, resolved), symbol);
}

async function main() {
  if (!SHEET_URL) {
    throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured in .env');
  }

  const { kind, symbol, file, tab, append } = args();
  const rows = await buildRows(kind, symbol, file);
  const tabName = tab || defaultTab(kind, symbol);

  const response = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: SHEET_TOKEN || '',
      spreadsheetId: process.env.GOOGLE_SHEETS_ID || '',
      tabName,
      dataset: kind,
      mode: append ? 'append' : 'replace',
      rows,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Google Sheets sink HTTP ${response.status}: ${text}`);

  let result: any;
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  if (result?.ok === false) throw new Error(`Google Sheets sink rejected export: ${result.error || 'unknown error'}`);

  console.log(JSON.stringify({
    ok: true,
    kind,
    tabName,
    rows: rows.length,
    response: result,
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
