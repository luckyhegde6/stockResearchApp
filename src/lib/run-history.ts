import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ensureDir } from './fs.js';

export interface RunHistoryItem {
  runId: string;
  type: 'individual_research' | 'market_scan' | 'batch_research' | 'news_sentiment';
  target: string;
  startTime: string; // ISO date string
  endTime: string | null;
  durationSeconds: number;
  status: 'completed' | 'failed' | 'running';
  readinessScore: number | null;
  sourcesAcquired: string[];
  error?: string;
  notes?: string;
}

export interface RunHistoryDatabase {
  schemaVersion: '1.0';
  generatedAt: string;
  totalExecutions: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  successRatePercent: number;
  averageDurationSeconds: number;
  history: RunHistoryItem[];
}

export interface ActiveRunProgress {
  active: boolean;
  runId: string | null;
  target: string | null;
  step: number;
  totalSteps: number;
  stageName: string;
  progressPercent: number;
  status: 'running' | 'completed' | 'failed' | 'idle';
  elapsedSeconds: number;
  logs: string[];
}

const ROOT = process.cwd();
const HISTORY_DIR = path.join(ROOT, 'research', 'history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'run-history.json');

const INITIAL_DB: RunHistoryDatabase = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  totalExecutions: 0,
  successCount: 0,
  failedCount: 0,
  runningCount: 0,
  successRatePercent: 0,
  averageDurationSeconds: 0,
  history: [],
};

let currentActiveProgress: ActiveRunProgress = {
  active: false,
  runId: null,
  target: null,
  step: 0,
  totalSteps: 5,
  stageName: 'Idle',
  progressPercent: 0,
  status: 'idle',
  elapsedSeconds: 0,
  logs: [],
};

export function getActiveProgress(): ActiveRunProgress {
  return currentActiveProgress;
}

export function updateActiveProgress(
  step: number,
  stageName: string,
  target: string,
  runId?: string,
  logMessage?: string
): ActiveRunProgress {
  const totalSteps = 5;
  const progressPercent = Math.min(100, Math.round((step / totalSteps) * 100));
  const active = step > 0 && step < totalSteps;

  currentActiveProgress = {
    active,
    runId: runId || currentActiveProgress.runId || `run-${Date.now()}`,
    target,
    step,
    totalSteps,
    stageName,
    progressPercent,
    status: step >= totalSteps ? 'completed' : step > 0 ? 'running' : 'idle',
    elapsedSeconds: currentActiveProgress.elapsedSeconds + 1,
    logs: logMessage
      ? [...currentActiveProgress.logs.slice(-15), `[${new Date().toLocaleTimeString()}] ${logMessage}`]
      : currentActiveProgress.logs,
  };

  return currentActiveProgress;
}

export async function loadRunHistory(): Promise<RunHistoryDatabase> {
  try {
    if (!existsSync(HISTORY_FILE)) {
      await saveRunHistory(INITIAL_DB);
      return INITIAL_DB;
    }
    const raw = await readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw) as RunHistoryDatabase;
  } catch {
    await saveRunHistory(INITIAL_DB);
    return INITIAL_DB;
  }
}

export async function saveRunHistory(db: RunHistoryDatabase): Promise<void> {
  await ensureDir(HISTORY_DIR);
  await writeFile(HISTORY_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function calculateHistoryMetrics(items: RunHistoryItem[]): RunHistoryDatabase {
  const totalExecutions = items.length;
  let successCount = 0;
  let failedCount = 0;
  let runningCount = 0;
  let durationSum = 0;

  for (const item of items) {
    if (item.status === 'completed') successCount += 1;
    else if (item.status === 'failed') failedCount += 1;
    else if (item.status === 'running') runningCount += 1;

    durationSum += item.durationSeconds || 0;
  }

  const successRatePercent = totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 1000) / 10 : 0;
  const averageDurationSeconds = totalExecutions > 0 ? Math.round((durationSum / totalExecutions) * 10) / 10 : 0;

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    totalExecutions,
    successCount,
    failedCount,
    runningCount,
    successRatePercent,
    averageDurationSeconds,
    history: items,
  };
}

export async function recordRunStart(
  runId: string,
  type: RunHistoryItem['type'],
  target: string,
  sources: string[] = ['NSE', 'Screener', 'Tijori', 'TradingView']
): Promise<RunHistoryItem> {
  const db = await loadRunHistory();
  const newItem: RunHistoryItem = {
    runId,
    type,
    target: target.toUpperCase(),
    startTime: new Date().toISOString(),
    endTime: null,
    durationSeconds: 0,
    status: 'running',
    readinessScore: null,
    sourcesAcquired: sources,
  };

  db.history.unshift(newItem);
  const updatedDb = calculateHistoryMetrics(db.history);
  await saveRunHistory(updatedDb);

  updateActiveProgress(1, 'Step 1/5: Symbol Master Resolution', target, runId, `Started ${type} for ${target}`);
  return newItem;
}

export async function recordRunComplete(
  runId: string,
  status: 'completed' | 'failed',
  readinessScore: number | null = 92.5,
  error?: string
): Promise<RunHistoryDatabase> {
  const db = await loadRunHistory();
  const idx = db.history.findIndex((x) => x.runId === runId);

  if (idx >= 0) {
    const start = new Date(db.history[idx].startTime).getTime();
    const end = Date.now();
    const durationSeconds = Math.max(1, Math.round((end - start) / 1000));

    db.history[idx] = {
      ...db.history[idx],
      endTime: new Date(end).toISOString(),
      durationSeconds,
      status,
      readinessScore: status === 'completed' ? readinessScore : null,
      error,
    };
  }

  const updatedDb = calculateHistoryMetrics(db.history);
  await saveRunHistory(updatedDb);

  if (status === 'completed') {
    updateActiveProgress(5, 'Step 5/5: Analysis Readiness Gate Complete', db.history[idx]?.target || 'Done', runId, 'Execution finished successfully.');
  } else {
    currentActiveProgress.status = 'failed';
  }

  return updatedDb;
}
