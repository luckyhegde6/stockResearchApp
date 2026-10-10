import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ensureDir } from './fs.js';

export const NSE_EQUITY_SOURCE_PAGE = 'https://www.nseindia.com/static/market-data/securities-available-for-trading';
export const NSE_EQUITY_SOURCE_CSV = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';

export interface NseSecurityRecord {
  symbol: string;
  companyName: string;
  series: string;
  dateOfListing: string;
  paidUpValue: number | null;
  marketLot: number | null;
  isin: string;
  faceValue: number | null;
  equityEligible: boolean;
  preferredForStockResearch: boolean;
}

function clean(v: unknown): string { return String(v ?? '').trim(); }
function numberOrNull(v: string): number | null {
  const n = Number(v.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function parseNseEquityCsv(csv: string): NseSecurityRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  return rows.slice(1).map(cols => {
    const [symbol, companyName, series, dateOfListing, paidUpValue, marketLot, isin, faceValue] = cols;
    const normalizedSeries = clean(series).toUpperCase();
    return {
      symbol: clean(symbol).toUpperCase(),
      companyName: clean(companyName),
      series: normalizedSeries,
      dateOfListing: clean(dateOfListing),
      paidUpValue: numberOrNull(clean(paidUpValue)),
      marketLot: numberOrNull(clean(marketLot)),
      isin: clean(isin),
      faceValue: numberOrNull(clean(faceValue)),
      equityEligible: ['EQ', 'BE', 'BZ'].includes(normalizedSeries),
      preferredForStockResearch: normalizedSeries === 'EQ',
    };
  }).filter(r => r.symbol && r.isin);
}

export async function loadNseEquityUniverse(root: string = process.cwd()): Promise<NseSecurityRecord[]> {
  const jsonPath = path.join(root, 'data', 'nse-equity-universe.json');
  if (existsSync(jsonPath)) {
    return JSON.parse(await readFile(jsonPath, 'utf8')) as NseSecurityRecord[];
  }
  const csvPath = path.join(root, 'data', 'EQUITY_L.csv');
  if (!existsSync(csvPath)) throw new Error(`NSE equity universe not found: ${csvPath}`);
  return parseNseEquityCsv(await readFile(csvPath, 'utf8'));
}

export function normalizeUserTicker(input: string): string {
  return clean(input).toUpperCase().replace(/\s+/g, ' ');
}

export function resolveNseSecurity(input: string, universe: NseSecurityRecord[]) {
  const q = normalizeUserTicker(input);
  const bySymbol = universe.find(r => r.symbol === q);
  if (bySymbol) return { match: 'symbol' as const, record: bySymbol, suggestions: [] };
  const exactNames = universe.filter(r => r.companyName.toUpperCase() === q);
  if (exactNames.length === 1) return { match: 'company' as const, record: exactNames[0], suggestions: [] };
  const tokens = q.split(/\s+/).filter(Boolean);
  const suggestions = universe
    .map(r => {
      const hay = `${r.symbol} ${r.companyName}`.toUpperCase();
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { symbol: r.symbol, companyName: r.companyName, series: r.series, score };
    })
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, 10);
  return { match: null, record: null, suggestions };
}

export async function writeUniverseSnapshot(root: string): Promise<{ jsonPath: string; metaPath: string; count: number }> {
  const records = parseNseEquityCsv(await readFile(path.join(root, 'data', 'EQUITY_L.csv'), 'utf8'));
  const dataDir = path.join(root, 'data');
  await ensureDir(dataDir);
  const jsonPath = path.join(dataDir, 'nse-equity-universe.json');
  const metaPath = path.join(dataDir, 'nse-equity-universe.meta.json');
  await writeFile(jsonPath, JSON.stringify(records, null, 2), 'utf8');
  await writeFile(metaPath, JSON.stringify({
    sourcePage: NSE_EQUITY_SOURCE_PAGE,
    sourceCsv: NSE_EQUITY_SOURCE_CSV,
    generatedAt: new Date().toISOString(),
    count: records.length,
    seriesCounts: Object.fromEntries(Object.entries(records.reduce((a,r)=>(a[r.series]=(a[r.series]||0)+1,a), {} as Record<string,number>)).sort(([a],[b])=>a.localeCompare(b))),
    eqCount: records.filter(r => r.preferredForStockResearch).length,
  }, null, 2), 'utf8');
  return { jsonPath, metaPath, count: records.length };
}
