import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { runChartink } from '../adapters/chartink.js';

export type Top20Category = 'swing' | 'long' | 'short' | 'fundamental' | 'candlestick' | 'range-breakouts' | 'bullish' | 'bearish' | 'intraday' | 'all';

type StrategyRow = {
  symbol?: string;
  name?: string;
  percentChange?: string | number | null;
  close?: string | number | null;
  volume?: string | number | null;
  marketCap?: string | number | null;
  sector?: string | null;
  raw?: Record<string, unknown>;
};

type StrategyResult = {
  name: string;
  slug: string;
  category: string;
  resultCount: number;
  resultSource?: string;
  csvCaptured?: boolean;
  stocks?: StrategyRow[];
};

function safeNumber(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function readStrategies(root: string): Promise<StrategyResult[]> {
  const p = path.join(root, 'strategies.json');
  if (!existsSync(p)) throw new Error(`Chartink strategy catalog missing: ${p}. Run: npm run research:chartink -- ITC`);
  const data = JSON.parse(await readFile(p, 'utf8'));
  return Array.isArray(data.results) ? data.results : [];
}

function rankCategory(strategies: StrategyResult[], category: Exclude<Top20Category, 'all'>) {
  const applicable = strategies.filter(s => s.category === category && Array.isArray(s.stocks));
  const bySymbol = new Map<string, any>();

  for (const strategy of applicable) {
    const stocks = strategy.stocks || [];
    for (let index = 0; index < stocks.length; index++) {
      const row = stocks[index];
      const symbol = String(row.symbol || '').trim().toUpperCase();
      if (!symbol) continue;
      const existing = bySymbol.get(symbol);
      const rank = index + 1;
      if (!existing) {
        bySymbol.set(symbol, {
          symbol,
          name: row.name || symbol,
          category,
          strategyHits: 1,
          strategies: [strategy.name],
          bestStrategyRank: rank,
          rankScore: rank,
          close: row.close ?? null,
          percentChange: row.percentChange ?? null,
          volume: row.volume ?? null,
          marketCap: row.marketCap ?? null,
          sector: row.sector ?? null,
          rawSamples: row.raw ? [row.raw] : [],
        });
      } else {
        existing.strategyHits += 1;
        existing.strategies.push(strategy.name);
        existing.strategies = [...new Set(existing.strategies)];
        existing.bestStrategyRank = Math.min(existing.bestStrategyRank, rank);
        existing.rankScore += rank;
        if (existing.close == null && row.close != null) existing.close = row.close;
        if (existing.percentChange == null && row.percentChange != null) existing.percentChange = row.percentChange;
        if (existing.volume == null && row.volume != null) existing.volume = row.volume;
        if (existing.marketCap == null && row.marketCap != null) existing.marketCap = row.marketCap;
        if (existing.sector == null && row.sector != null) existing.sector = row.sector;
        if (row.raw) existing.rawSamples.push(row.raw);
      }
    }
  }

  return [...bySymbol.values()]
    .map(r => ({
      ...r,
      strategyCount: r.strategyHits,
      consensusScore: r.strategyHits * 100000 - r.rankScore,
      bestStrategyRank: r.bestStrategyRank,
      percentChangeNumeric: safeNumber(r.percentChange),
      marketCapNumeric: safeNumber(r.marketCap),
      rawSamples: r.rawSamples.slice(0, 5),
    }))
    .sort((a, b) =>
      b.consensusScore - a.consensusScore ||
      b.strategyCount - a.strategyCount ||
      a.rankScore - b.rankScore ||
      a.symbol.localeCompare(b.symbol)
    );
}

function top20(ranked: any[]) {
  return ranked.slice(0, 20).map((r, i) => ({ rank: i + 1, ...r }));
}

async function ensureFreshChartink(projectRoot: string) {
  const tempResearchDir = path.join(projectRoot, 'research', '.chartink-top20');
  await rm(tempResearchDir, { recursive: true, force: true });
  await mkdir(tempResearchDir, { recursive: true });
  try {
    await runChartink({ ticker: '__MARKET__', researchDir: tempResearchDir });
  } finally {
    await rm(tempResearchDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runChartinkTop20(opts: {
  root: string;
  projectRoot: string;
  category: Top20Category;
  refresh?: boolean;
}) {
  const { root, projectRoot, category, refresh = false } = opts;
  const startedAt = new Date().toISOString();
  if (refresh || !existsSync(path.join(root, 'strategies.json'))) {
    await ensureFreshChartink(projectRoot);
  }

  const strategies = await readStrategies(root);
  const categories = category === 'all' ? ['swing', 'long', 'short', 'fundamental', 'candlestick', 'range-breakouts', 'bullish', 'bearish', 'intraday'] as const : [category] as const;
  const outputRoot = path.join(root, 'top20');
  await mkdir(outputRoot, { recursive: true });

  const results: Record<string, any> = {};
  for (const c of categories) {
    const ranked = rankCategory(strategies, c);
    const top20Rows = top20(ranked);
    const out = path.join(outputRoot, `${c}.json`);
    const payload = {
      schema_version: '1.0',
      provider: 'Chartink',
      dataset: 'category-top20',
      category: c,
      generatedAt: new Date().toISOString(),
      ranking: {
        primary: 'number_of_distinct_configured_strategies_matched',
        secondary: 'sum_of_rank_positions_across_matching_strategies',
        direction: 'higher strategy consensus first; lower rank score wins ties',
        topN: 20,
      },
      strategyCount: strategies.filter(s => s.category === c).length,
      candidateCount: ranked.length,
      stocks: top20Rows,
      deterministic: true,
      llmUsed: false,
    };
    await writeFile(out, JSON.stringify(payload, null, 2), 'utf8');
    results[c] = { path: out, count: top20Rows.length, candidateCount: ranked.length, stocks: top20Rows };
  }

  const perStrategyRoot = path.join(outputRoot, 'strategies');
  await mkdir(perStrategyRoot, { recursive: true });
  for (const s of strategies) {
    const rows = Array.isArray(s.stocks) ? s.stocks.slice(0, 20).map((row, i) => ({ rank: i + 1, ...row, strategy: s.name, strategySlug: s.slug, category: s.category })) : [];
    await writeFile(path.join(perStrategyRoot, `${slugify(s.slug)}.json`), JSON.stringify({
      schema_version: '1.0',
      provider: 'Chartink',
      dataset: 'strategy-top20',
      strategy: s.name,
      slug: s.slug,
      category: s.category,
      generatedAt: new Date().toISOString(),
      stocks: rows,
      deterministic: true,
      llmUsed: false,
    }, null, 2), 'utf8');
  }

  const indexPath = path.join(outputRoot, 'index.json');
  const indexPayload = {
    schema_version: '1.0',
    provider: 'Chartink',
    generatedAt: startedAt,
    requestedCategory: category,
    refresh,
    categoryOutputs: results,
    strategyTop20Directory: perStrategyRoot,
    sourceCatalog: path.join(root, 'strategies.json'),
    deterministic: true,
    llmUsed: false,
  };
  await writeFile(indexPath, JSON.stringify(indexPayload, null, 2), 'utf8');

  return {
    schema_version: '1.0',
    provider: 'Chartink',
    category,
    refresh,
    indexPath,
    outputs: results,
    strategyCount: strategies.length,
    deterministic: true,
    llmUsed: false,
  };
}
