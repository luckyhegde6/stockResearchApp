import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';

export interface AppConfig {
  $schema_version: string;
  symbols: string[];
  sources: {
    nse: boolean;
    screener: boolean;
    tijori: boolean;
    tradingview: boolean;
    chartink: boolean;
    news: boolean;
    bse: boolean;
  };
  cron: {
    enabled: boolean;
    marketScansSchedule: string;
    screenerSchedule: string;
    top20Schedule: string;
    nse52WeekHighSchedule: string;
    pollIntervalSeconds: number;
  };
  pipeline: {
    defaultExchange: string;
    nseTimeoutMs: number;
    sourceTimeoutMs: number;
    concallLimit: number;
    annualReportLimit: number;
    tradingViewUiSurfaces: string[];
  };
  llm: {
    endpoint: string;
    model: string;
    timeoutMs: number;
    temperature: number;
  };
  server: {
    port: number;
    host: string;
    cors: boolean;
  };
}

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  $schema_version: '1.0',
  symbols: ['ITC', 'HDFCBANK', 'IOC', 'HPCL', 'RELIANCE', 'TCS', 'INFY'],
  sources: {
    nse: true,
    screener: true,
    tijori: true,
    tradingview: true,
    chartink: false,
    news: true,
    bse: false,
  },
  cron: {
    enabled: false,
    marketScansSchedule: '0 16 * * 1-5',
    screenerSchedule: '0 18 * * 5',
    top20Schedule: '30 16 * * 1-5',
    nse52WeekHighSchedule: '45 16 * * 1-5',
    pollIntervalSeconds: 60,
  },
  pipeline: {
    defaultExchange: 'NSE',
    nseTimeoutMs: 30000,
    sourceTimeoutMs: 45000,
    concallLimit: 3,
    annualReportLimit: 3,
    tradingViewUiSurfaces: ['forecast', 'news', 'documents', 'seasonals', 'community'],
  },
  llm: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    timeoutMs: 120000,
    temperature: 0.15,
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    cors: true,
  },
};

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      sources: { ...DEFAULT_CONFIG.sources, ...(parsed.sources || {}) },
      cron: { ...DEFAULT_CONFIG.cron, ...(parsed.cron || {}) },
      pipeline: { ...DEFAULT_CONFIG.pipeline, ...(parsed.pipeline || {}) },
      llm: { ...DEFAULT_CONFIG.llm, ...(parsed.llm || {}) },
      server: { ...DEFAULT_CONFIG.server, ...(parsed.server || {}) },
    };
  } catch (err) {
    await saveAppConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await ensureDir(path.join(ROOT, 'config'));
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
