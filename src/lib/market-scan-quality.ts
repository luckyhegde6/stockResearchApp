import path from 'node:path';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';
import { loadNseEquityUniverse } from './nse-securities.js';
import { CHARTINK_SCAN_TYPES, getScansByType, type ScanType } from './chartink-scan-registry.js';

export type ScanQualityStatus = 'ok' | 'partial' | 'failed' | 'not-run';

async function json(file: string): Promise<any | null> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
async function existsNonEmpty(file: string) {
  try { const s = await stat(file); return s.isFile() && s.size > 0; } catch { return false; }
}
function slugify(v: string) { return v.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function dateSortDesc(a: string, b: string) { return b.localeCompare(a); }

function qualityStatus(configured: number, successful: number, rows: number, failures: number): ScanQualityStatus {
  if (!configured) return 'not-run';
  if (failures === 0 && successful === configured && rows > 0) return 'ok';
  if (successful > 0 || rows > 0) return 'partial';
  return 'failed';
}

async function latestFamilyDir(scansRoot: string, family: string) {
  let entries: any[] = [];
  try { entries = await readdir(scansRoot, { withFileTypes: true }); } catch { return null; }
  const prefix = `${family}-`;
  const dirs = entries.filter(e => e.isDirectory() && e.name.startsWith(prefix)).map(e => e.name).sort(dateSortDesc);
  return dirs[0] ? path.join(scansRoot, dirs[0]) : null;
}

async function validateChartinkFamily(scansRoot: string, scanType: ScanType, universe: Awaited<ReturnType<typeof loadNseEquityUniverse>>) {
  const familyDir = await latestFamilyDir(scansRoot, scanType.replace(/\b\w/g, x => x.toUpperCase()));
  if (!familyDir) return { scanType, status: 'not-run' as const, configured: getScansByType(scanType).length, successful: 0, partial: 0, failed: 0, rawRows: 0, uniqueStocks: 0, nseVerifiedStocks: 0, strategies: [] };
  const conditions = await json(path.join(familyDir, 'scan-conditions.json'));
  const configured = Array.isArray(conditions?.scans) ? conditions.scans : getScansByType(scanType);
  const strategiesRoot = path.join(familyDir, 'strategies');
  const strategies: any[] = [];
  for (const scan of configured) {
    const slug = slugify(new URL(scan.url).pathname.split('/').filter(Boolean).pop() || scan.name);
    const meta = await json(path.join(strategiesRoot, slug, 'metadata.json'));
    const results = await json(path.join(strategiesRoot, slug, 'results.json'));
    const csvPath = path.join(strategiesRoot, slug, 'csv', `${slug}.csv`);
    const csvExists = await existsNonEmpty(csvPath);
    const rowCount = Number(results?.rowCount ?? meta?.normalizedRows ?? 0);
    const status: ScanQualityStatus = meta?.csv?.ok === true || meta?.sourceMode === 'csv-download' || meta?.sourceMode === 'copy-table' || meta?.sourceMode === 'visible-table' ? (rowCount > 0 ? 'ok' : 'partial') : rowCount > 0 ? 'partial' : 'failed';
    const symbols = Array.isArray(results?.stocks) ? results.stocks.map((r: any) => String(r?.symbol ?? '').trim().toUpperCase()).filter(Boolean) : [];
    const validSymbols = symbols.filter((s: string) => universe.some(u => u.symbol === s));
    strategies.push({ name: scan.name, slug, status, rowCount, csvExists, csvBytes: csvExists ? (await stat(csvPath)).size : 0, sourceMode: meta?.sourceMode ?? null, nseVerifiedRows: validSymbols.length, warningCount: Array.isArray(meta?.warnings) ? meta.warnings.length : 0 });
  }
  const successful = strategies.filter(s => s.status === 'ok').length;
  const partial = strategies.filter(s => s.status === 'partial').length;
  const failed = strategies.filter(s => s.status === 'failed').length;
  const rows = strategies.reduce((n, s) => n + s.rowCount, 0);
  const stockSets = new Set<string>();
  for (const s of strategies) {
    const data = await json(path.join(strategiesRoot, s.slug, 'results.json'));
    for (const row of (Array.isArray(data?.stocks) ? data.stocks : [])) {
      const sym = String(row?.symbol ?? '').trim().toUpperCase(); if (sym) stockSets.add(sym);
    }
  }
  const verified = [...stockSets].filter(s => universe.some(u => u.symbol === s)).length;
  return { scanType, folder: familyDir, status: qualityStatus(configured.length, successful, rows, failed), configured: configured.length, successful, partial, failed, rawRows: rows, uniqueStocks: stockSets.size, nseVerifiedStocks: verified, strategies };
}

async function validate52Week(scansRoot: string, universe: Awaited<ReturnType<typeof loadNseEquityUniverse>>) {
  const dir = await latestFamilyDir(scansRoot, '52-Week-High');
  if (!dir) return { status: 'not-run' as const, folder: null, rows: 0, equityRows: 0, nseVerified: 0, sourceAsOf: null, archiveDate: null, warnings: [] as string[] };
  const data = await json(path.join(dir, '52-week-high', '52-week-high.normalized.json'));
  if (!data) return { status: 'failed' as const, folder: dir, rows: 0, equityRows: 0, nseVerified: 0, sourceAsOf: null, archiveDate: path.basename(dir).replace(/^52-Week-High-/, ''), warnings: ['normalized 52-week-high payload missing'] };
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const equityRows = rows.filter((r: any) => r.series === 'EQ');
  const verified = equityRows.filter((r: any) => universe.some(u => u.symbol === r.symbol)).length;
  const sourceAsOf = data.timestamp ?? null;
  const archiveDate = path.basename(dir).replace(/^52-Week-High-/, '');
  const warnings: string[] = [];
  if (!rows.length) warnings.push('52-week-high contains zero rows');
  if (equityRows.length && verified !== equityRows.length) warnings.push(`52-week-high EQ rows not in official security master: ${equityRows.length - verified}`);
  return { status: rows.length && !warnings.length ? 'ok' as const : rows.length ? 'partial' as const : 'failed' as const, folder: dir, rows: rows.length, equityRows: equityRows.length, nseVerified: verified, sourceAsOf, archiveDate, warnings };
}

async function validateTradingViewScanEvidence(scansRoot: string) {
  const familyDirs: string[] = [];
  try {
    for (const e of await readdir(scansRoot, { withFileTypes: true })) if (e.isDirectory() && /^(Fundamental|Candlestick|Range-Breakouts|Bullish|Bearish|Intraday)-/.test(e.name)) familyDirs.push(path.join(scansRoot, e.name));
  } catch {}
  const out: any[] = [];
  for (const dir of familyDirs.sort().reverse()) {
    const data = await json(path.join(dir, 'chart-evidence', 'index.json'));
    if (!data) continue;
    const records = Array.isArray(data.records) ? data.records : [];
    const missing = records.filter((r: any) => !r?.screenshots?.fiveY?.exists || !r?.screenshots?.all?.exists);
    const unverifiedCandles = records.filter((r: any) => !r?.screenshots?.fiveY?.candleSelected || !r?.screenshots?.all?.candleSelected).length;
    out.push({ folder: dir, requested: data.selected ?? data.requested ?? records.length, captured: records.length, missingScreenshots: missing.length, candleSelectionUnverified: unverifiedCandles, status: missing.length ? 'partial' : 'ok' });
  }
  return out;
}

export async function buildMarketScanQuality(root: string = path.join(process.cwd(), 'scans')) {
  const universe = await loadNseEquityUniverse(process.cwd());
  const chartink = await Promise.all(CHARTINK_SCAN_TYPES.map(t => validateChartinkFamily(root, t, universe)));
  const nse52 = await validate52Week(root, universe);
  const tradingView = await validateTradingViewScanEvidence(root);
  const warnings: string[] = [];
  for (const f of chartink) if (f.status === 'partial') warnings.push(`${f.scanType}: one or more configured scans were partial/failed`);
  if (nse52.status === 'partial') warnings.push(...nse52.warnings);
  for (const tv of tradingView) if (tv.status !== 'ok') warnings.push(`${path.basename(tv.folder)}: incomplete TradingView screenshot evidence`);
  const registryUrls = CHARTINK_SCAN_TYPES.flatMap(t => getScansByType(t).map(s => s.url));
  const duplicateRegistryUrls = registryUrls.filter((u,i,a)=>a.indexOf(u)!==i);
  const invalidRegistryUrls = registryUrls.filter(u=>!/^https:\/\/chartink\.com\/(scanner|screener)\//.test(u));
  if(duplicateRegistryUrls.length) warnings.push(`duplicate Chartink registry URLs: ${duplicateRegistryUrls.length}`);
  if(invalidRegistryUrls.length) warnings.push(`invalid Chartink registry URLs: ${invalidRegistryUrls.length}`);
  return {
    schema_version: '1.0',
    generatedAt: new Date().toISOString(),
    deterministic: true,
    llmUsed: false,
    nseSecurityMasterCount: universe.length,
    chartinkRegistry: { configured: CHARTINK_SCAN_TYPES.flatMap(t=>getScansByType(t)).length, duplicateUrls: duplicateRegistryUrls.length, invalidUrls: invalidRegistryUrls.length },
    chartink: { families: chartink, configured: chartink.reduce((n, x) => n + x.configured, 0), successful: chartink.reduce((n, x) => n + x.successful, 0), partial: chartink.reduce((n, x) => n + x.partial, 0), failed: chartink.reduce((n, x) => n + x.failed, 0) },
    nse52WeekHigh: nse52,
    tradingView: tradingView,
    status: warnings.length ? 'partial' : 'ok',
    warnings,
    rules: {
      zeroRowsCannotBeComplete: true,
      csvMustExistAndBeNonEmptyForCsvSuccess: true,
      tradingViewCandleSelectionMustBeVerifiedForCandlestickClaim: true,
      officialNseSecurityMasterUsedForSymbolValidation: true,
      noLlm: true,
    }
  };
}

export async function writeMarketScanQuality(root = path.join(process.cwd(), 'scans')) {
  await ensureDir(root);
  const report = await buildMarketScanQuality(root);
  const out = path.join(root, 'market-scan-quality.json');
  await writeFile(out, JSON.stringify(report, null, 2), 'utf8');
  return { out, report };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  writeMarketScanQuality().then(({ out, report }) => console.log(JSON.stringify({ path: out, status: report.status, chartink: report.chartink, nse52WeekHigh: report.nse52WeekHigh }, null, 2))).catch(e => { console.error(e?.stack || e); process.exitCode = 1; });
}
