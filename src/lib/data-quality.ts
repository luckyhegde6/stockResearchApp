import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';

type Severity = 'error' | 'warning' | 'info';

export interface QualityIssue {
  severity: Severity;
  code: string;
  message: string;
  row?: number;
  field?: string;
  details?: Record<string, unknown>;
}

export interface HistoricalQualityReport {
  schema_version: '1.0';
  generatedAt: string;
  symbol: string;
  requestedFrom: string;
  requestedTo: string;
  rawRows: number;
  rawSeriesCounts: Record<string, number>;
  duplicateKeys: number;
  duplicateDates: number;
  invalidDateRows: number;
  finalRows: number;
  finalSeries: string;
  earliest: string | null;
  latest: string | null;
  coverageDays: number;
  requestedDays: number;
  coverageRatio: number;
  missingOpen: number;
  missingHigh: number;
  missingLow: number;
  missingClose: number;
  invalidOhlcRows: number;
  invalidVolumeRows: number;
  invalidDeliveryRows: number;
  chronologyErrors: number;
  qualityStatus: 'ok' | 'warning' | 'error';
  issues: QualityIssue[];
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function dateValue(row: any): Date | null {
  const raw = row?.timestamp ?? row?.CH_TIMESTAMP ?? row?.mTIMESTAMP ?? row?.Date ?? row?.date ?? row?.DATE;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function evaluateHistoricalQuality(
  symbol: string,
  rawRows: any[],
  finalRows: any[],
  requestedFrom: Date,
  requestedTo: Date,
  chunkCount: number,
): HistoricalQualityReport {
  const issues: QualityIssue[] = [];
  const seriesCounts: Record<string, number> = {};
  const rawKeySet = new Set<string>();
  let duplicateKeys = 0;
  let invalidDateRows = 0;

  for (let i = 0; i < rawRows.length; i += 1) {
    const row = rawRows[i];
    const series = String(row?.CH_SERIES ?? row?.series ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    seriesCounts[series] = (seriesCounts[series] || 0) + 1;
    const d = dateValue(row);
    if (!d) {
      invalidDateRows += 1;
      continue;
    }
    const sym = String(row?.CH_SYMBOL ?? row?.symbol ?? symbol).trim().toUpperCase() || symbol.toUpperCase();
    const key = `${sym}|${series}|${d.toISOString().slice(0, 10)}`;
    if (rawKeySet.has(key)) duplicateKeys += 1;
    rawKeySet.add(key);
  }

  const finalDates: Date[] = [];
  const finalDateSet = new Set<string>();
  let duplicateDates = 0;
  let invalidOhlcRows = 0;
  let invalidVolumeRows = 0;
  let invalidDeliveryRows = 0;
  let chronologyErrors = 0;
  let missingOpen = 0, missingHigh = 0, missingLow = 0, missingClose = 0;
  let previous: Date | null = null;

  for (let i = 0; i < finalRows.length; i += 1) {
    const row = finalRows[i];
    const d = dateValue(row);
    if (!d) {
      issues.push({ severity: 'error', code: 'INVALID_DATE', message: 'Final row has no valid date.', row: i });
      continue;
    }
    finalDates.push(d);
    const key = d.toISOString().slice(0, 10);
    if (finalDateSet.has(key)) duplicateDates += 1;
    finalDateSet.add(key);
    if (previous && d.getTime() < previous.getTime()) chronologyErrors += 1;
    previous = d;

    const open = asNumber(row.open);
    const high = asNumber(row.high);
    const low = asNumber(row.low);
    const close = asNumber(row.close);
    const volume = asNumber(row.volume);
    const deliveryQuantity = asNumber(row.deliveryQuantity);

    if (open === null) missingOpen += 1;
    if (high === null) missingHigh += 1;
    if (low === null) missingLow += 1;
    if (close === null) missingClose += 1;

    if ([open, high, low, close].every(v => v !== null)) {
      const valid = high! >= Math.max(open!, close!) && low! <= Math.min(open!, close!) && high! >= low! && low! >= 0;
      if (!valid) {
        invalidOhlcRows += 1;
        issues.push({ severity: 'error', code: 'INVALID_OHLC', message: 'OHLC relationship is invalid.', row: i, details: { open, high, low, close } });
      }
    }
    if (volume !== null && volume < 0) {
      invalidVolumeRows += 1;
      issues.push({ severity: 'error', code: 'NEGATIVE_VOLUME', message: 'Volume is negative.', row: i, field: 'volume' });
    }
    if (deliveryQuantity !== null && deliveryQuantity < 0) {
      invalidDeliveryRows += 1;
      issues.push({ severity: 'warning', code: 'NEGATIVE_DELIVERY', message: 'Delivery quantity is negative.', row: i, field: 'deliveryQuantity' });
    }
    if (deliveryQuantity !== null && volume !== null && deliveryQuantity > volume * 1.001) {
      invalidDeliveryRows += 1;
      issues.push({ severity: 'warning', code: 'DELIVERY_GT_VOLUME', message: 'Delivery quantity exceeds traded volume.', row: i, details: { deliveryQuantity, volume } });
    }
  }

  finalDates.sort((a, b) => a.getTime() - b.getTime());
  const earliestDate = finalDates[0] ?? null;
  const latestDate = finalDates[finalDates.length - 1] ?? null;
  const requestedStart = new Date(requestedFrom); requestedStart.setUTCHours(0,0,0,0);
  const requestedEnd = new Date(requestedTo); requestedEnd.setUTCHours(0,0,0,0);
  const requestedDays = Math.max(1, Math.round((requestedEnd.getTime() - requestedStart.getTime()) / 86400000) + 1);
  const coverageDays = earliestDate && latestDate ? Math.max(1, Math.round((latestDate.getTime() - earliestDate.getTime()) / 86400000) + 1) : 0;
  const coverageRatio = requestedDays ? Math.min(1, coverageDays / requestedDays) : 0;

  if (duplicateKeys > 0) issues.push({ severity: 'info', code: 'RAW_OVERLAP_DUPLICATES', message: 'Raw chunks contain overlapping duplicate keys that are expected to be removed during merge.', details: { duplicateKeys, chunkCount } });
  if (duplicateDates > 0) issues.push({ severity: 'error', code: 'FINAL_DUPLICATE_DATES', message: 'Final technical dataset still contains duplicate dates.', details: { duplicateDates } });
  if (coverageRatio < 0.90) issues.push({ severity: 'error', code: 'LOW_COVERAGE', message: 'Final history covers less than 90% of requested calendar range.', details: { coverageRatio } });
  if (invalidDateRows > 0) issues.push({ severity: 'warning', code: 'RAW_INVALID_DATES', message: 'Some raw rows have invalid/missing dates.', details: { invalidDateRows } });
  if (missingOpen || missingHigh || missingLow || missingClose) issues.push({ severity: 'warning', code: 'MISSING_OHLC', message: 'Some final rows have missing OHLC fields.', details: { missingOpen, missingHigh, missingLow, missingClose } });
  if (chronologyErrors > 0) issues.push({ severity: 'error', code: 'CHRONOLOGY', message: 'Final dataset is not strictly chronological.', details: { chronologyErrors } });

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    schema_version: '1.0',
    generatedAt: new Date().toISOString(),
    symbol,
    requestedFrom: requestedStart.toISOString(),
    requestedTo: requestedEnd.toISOString(),
    rawRows: rawRows.length,
    rawSeriesCounts: seriesCounts,
    duplicateKeys,
    duplicateDates,
    invalidDateRows,
    finalRows: finalRows.length,
    finalSeries: 'EQ',
    earliest: earliestDate?.toISOString() ?? null,
    latest: latestDate?.toISOString() ?? null,
    coverageDays,
    requestedDays,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    missingOpen,
    missingHigh,
    missingLow,
    missingClose,
    invalidOhlcRows,
    invalidVolumeRows,
    invalidDeliveryRows,
    chronologyErrors,
    qualityStatus: hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok',
    issues,
  };
}

export async function writeQualityReport(researchDir: string, report: HistoricalQualityReport) {
  const dir = path.join(researchDir, 'raw', 'nse-api');
  await ensureDir(dir);
  const file = path.join(dir, 'historical-quality.json');
  await writeFile(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}
