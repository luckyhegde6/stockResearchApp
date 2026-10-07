import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ensureDir } from './fs.js';

export interface TrackedStock {
  id: string;
  symbol: string;
  companyName: string;
  scanType: string;
  scanDate: string; // ISO date string YYYY-MM-DD
  priceAtScan: number;
  currentPrice: number | null;
  returnPercent: number | null;
  perfStatus: 'gain' | 'loss' | 'neutral' | 'pending';
  lastUpdated: string;
  notes?: string;
}

export interface PerformanceReport {
  schemaVersion: '1.0';
  generatedAt: string;
  totalTracked: number;
  totalGains: number;
  totalLosses: number;
  totalNeutral: number;
  gainRatioPercent: number;
  averageReturnPercent: number;
  bestPerformer: { symbol: string; returnPercent: number } | null;
  worstPerformer: { symbol: string; returnPercent: number } | null;
  trackedStocks: TrackedStock[];
}

const ROOT = process.cwd();
const TRACKING_DIR = path.join(ROOT, 'scans', 'tracking');
const TRACKING_FILE = path.join(TRACKING_DIR, 'performance-tracker.json');

const INITIAL_REPORT: PerformanceReport = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  totalTracked: 0,
  totalGains: 0,
  totalLosses: 0,
  totalNeutral: 0,
  gainRatioPercent: 0,
  averageReturnPercent: 0,
  bestPerformer: null,
  worstPerformer: null,
  trackedStocks: [],
};

export async function loadPerformanceTracker(): Promise<PerformanceReport> {
  try {
    if (!existsSync(TRACKING_FILE)) {
      await savePerformanceTracker(INITIAL_REPORT);
      return INITIAL_REPORT;
    }
    const raw = await readFile(TRACKING_FILE, 'utf-8');
    return JSON.parse(raw) as PerformanceReport;
  } catch {
    await savePerformanceTracker(INITIAL_REPORT);
    return INITIAL_REPORT;
  }
}

export async function savePerformanceTracker(report: PerformanceReport): Promise<void> {
  await ensureDir(TRACKING_DIR);
  await writeFile(TRACKING_FILE, JSON.stringify(report, null, 2), 'utf-8');
}

export function calculateReportSummary(stocks: TrackedStock[]): PerformanceReport {
  const totalTracked = stocks.length;
  let totalGains = 0;
  let totalLosses = 0;
  let totalNeutral = 0;
  let returnSum = 0;
  let validReturnCount = 0;

  let best: { symbol: string; returnPercent: number } | null = null;
  let worst: { symbol: string; returnPercent: number } | null = null;

  for (const s of stocks) {
    if (s.returnPercent !== null && Number.isFinite(s.returnPercent)) {
      returnSum += s.returnPercent;
      validReturnCount += 1;

      if (s.returnPercent > 0.5) totalGains += 1;
      else if (s.returnPercent < -0.5) totalLosses += 1;
      else totalNeutral += 1;

      if (!best || s.returnPercent > best.returnPercent) {
        best = { symbol: s.symbol, returnPercent: s.returnPercent };
      }
      if (!worst || s.returnPercent < worst.returnPercent) {
        worst = { symbol: s.symbol, returnPercent: s.returnPercent };
      }
    } else {
      totalNeutral += 1;
    }
  }

  const gainRatioPercent = totalTracked > 0 ? Math.round((totalGains / totalTracked) * 1000) / 10 : 0;
  const averageReturnPercent = validReturnCount > 0 ? Math.round((returnSum / validReturnCount) * 100) / 100 : 0;

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    totalTracked,
    totalGains,
    totalLosses,
    totalNeutral,
    gainRatioPercent,
    averageReturnPercent,
    bestPerformer: best,
    worstPerformer: worst,
    trackedStocks: stocks,
  };
}

export async function recordScannedStockList(
  scanType: string,
  items: Array<{ symbol: string; companyName?: string; price?: number; scanDate?: string }>
): Promise<PerformanceReport> {
  const current = await loadPerformanceTracker();
  const dateStr = new Date().toISOString().slice(0, 10);
  const updatedStocks = [...current.trackedStocks];

  for (const item of items) {
    const sym = item.symbol.trim().toUpperCase();
    if (!sym) continue;
    const id = `${dateStr}-${sym}-${scanType}`;

    const existingIdx = updatedStocks.findIndex((s) => s.id === id || (s.symbol === sym && s.scanDate === dateStr && s.scanType === scanType));
    const price = item.price && Number.isFinite(item.price) ? item.price : 100;

    const entry: TrackedStock = {
      id,
      symbol: sym,
      companyName: item.companyName || sym,
      scanType,
      scanDate: item.scanDate || dateStr,
      priceAtScan: price,
      currentPrice: price, // initial price is scan price
      returnPercent: 0,
      perfStatus: 'neutral',
      lastUpdated: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      updatedStocks[existingIdx] = { ...updatedStocks[existingIdx], ...entry };
    } else {
      updatedStocks.unshift(entry);
    }
  }

  const newReport = calculateReportSummary(updatedStocks);
  await savePerformanceTracker(newReport);
  return newReport;
}

export async function updatePricesAndPerformance(
  priceMap: Record<string, number>
): Promise<PerformanceReport> {
  const current = await loadPerformanceTracker();
  const updatedStocks = current.trackedStocks.map((s) => {
    const freshPrice = priceMap[s.symbol];
    if (freshPrice && Number.isFinite(freshPrice) && s.priceAtScan > 0) {
      const returnPct = Math.round(((freshPrice - s.priceAtScan) / s.priceAtScan) * 10000) / 100;
      let perfStatus: TrackedStock['perfStatus'] = 'neutral';
      if (returnPct > 0.5) perfStatus = 'gain';
      else if (returnPct < -0.5) perfStatus = 'loss';

      return {
        ...s,
        currentPrice: freshPrice,
        returnPercent: returnPct,
        perfStatus,
        lastUpdated: new Date().toISOString(),
      };
    }
    return s;
  });

  const newReport = calculateReportSummary(updatedStocks);
  await savePerformanceTracker(newReport);
  return newReport;
}
