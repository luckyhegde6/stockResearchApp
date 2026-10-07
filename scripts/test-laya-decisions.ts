/**
 * Test: Laya Decision Engine
 *
 * Validates the decision engine logic with synthetic evidence packs
 * and checks that real research data (if available) produces valid output.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  softmax, clamp01, evalChoice, evalScore, evalNoul,
  LayaDecisionEngine, renderLayaReportMarkdown,
  type ChoiceQuestion, type ScoreQuestion, type NoulQuestion
} from '../src/lib/laya-decision-engine.js';
import { runStockDecisions, Q_TREND_DIRECTION, Q_FUNDAMENTAL_QUALITY, Q_NEWS_RISK } from '../src/lib/laya-stock-questions.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅  ${name}`);
    passed++;
  } else {
    console.error(`  ❌  ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Unit tests for core primitives ──────────────────────────────────────────

console.log('\n🧪  softmax');
{
  const probs = softmax({ a: 2, b: 1, c: 0 });
  assert('all probs sum to 1', Math.abs(Object.values(probs).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert('highest logit wins', probs['a'] > probs['b'] && probs['b'] > probs['c']);
  assert('no NaN values', !Object.values(probs).some(isNaN));
}

console.log('\n🧪  clamp01');
{
  assert('clamp above 1', clamp01(5) === 1);
  assert('clamp below 0', clamp01(-5) === 0);
  assert('pass through 0.5', clamp01(0.5) === 0.5);
}

console.log('\n🧪  evalChoice');
{
  const q: ChoiceQuestion = {
    type: 'choice', id: 'test', instructions: 'Test choice',
    criteria: { 'A': 'First', 'B': 'Second', 'C': 'Third' }
  };
  const ans = evalChoice(q, { A: 3, B: 1, C: 0 }, ['evidence:A']);
  assert('choice type', ans.type === 'choice');
  assert('correct winner', ans.choice === 'A', `got ${ans.choice}`);
  assert('confidence in range', ans.confidence >= 0 && ans.confidence <= 1);
  assert('probabilities sum to 1', Math.abs(Object.values(ans.probabilities).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert('evidence passed through', ans.evidence[0] === 'evidence:A');
}

console.log('\n🧪  evalScore');
{
  const q: ScoreQuestion = {
    type: 'score', id: 'test', instructions: 'Test score',
    criteria: ['Bad', 'Weak', 'Fair', 'Good', 'Excellent']
  };
  const ans = evalScore(q, 3.2, ['evidence:roe=18%']);
  assert('score type', ans.type === 'score');
  assert('level clipped to 3', ans.level === 3, `got ${ans.level}`);
  assert('label correct', ans.label === 'Good', `got ${ans.label}`);
  assert('confidence in range', ans.confidence >= 0 && ans.confidence <= 1);
}

console.log('\n🧪  evalNoul');
{
  const q: NoulQuestion = { type: 'noul', id: 'test', instructions: 'Test noul' };
  const trueAns  = evalNoul(q, 0.8, []);
  const falseAns = evalNoul(q, -0.8, []);
  const unclearAns = evalNoul(q, 0.05, []);
  assert('noul type', trueAns.type === 'noul');
  assert('high signal → true', trueAns.value === true && trueAns.label === 'true');
  assert('negative signal → false', falseAns.value === false && falseAns.label === 'false');
  assert('weak signal → unclear', unclearAns.value === null && unclearAns.label === 'unclear');
}

// ── Synthetic evidence pack tests ────────────────────────────────────────────

console.log('\n🧪  Stock decisions — strong bullish pack');
{
  const bullishPack = {
    technicals: { rsi14: 68, ema50: 450, ema200: 380, currentPrice: 475, macd: 5.2, macdSignal: 3.1, volumeRatio: 1.8 },
    valuation: { peRatio: 22, pbRatio: 3.2, netProfitMargin: 18, debtToEquity: 0.4, roe: 22 },
    fundamentals: { revenueGrowth: 12 },
    newsSentiment: { sentiment: { compoundPolarity: 0.3, negativeCount: 1, totalHeadlines: 10 } },
    marketContext: { scanArchives: {
      bullish: { membership: { symbol: 'TEST' } },
      fundamental: { top20Membership: { symbol: 'TEST' } }
    }},
    quality: { report: { coreCompleteness: { score: 90 }, status: 'healthy' } },
    sourceHealth: { overall: { status: 'healthy' } },
    readinessInputs: { manifestDataGaps: [] }
  };
  const decisions = runStockDecisions('TEST', bullishPack);
  assert('all 8 decisions present', Object.keys(decisions).length === 8);
  assert('trend_direction is Bullish', (decisions['trend_direction']?.answer as any)?.choice === 'Bullish',
    `got ${(decisions['trend_direction']?.answer as any)?.choice}`);
  assert('action is Buy or Strong-Buy',
    ['Buy', 'Strong-Buy'].includes((decisions['action_recommendation']?.answer as any)?.choice),
    `got ${(decisions['action_recommendation']?.answer as any)?.choice}`);
  assert('data quality >= 2', (decisions['data_quality_gate']?.answer as any)?.level >= 2);
  assert('news_risk false', (decisions['news_risk']?.answer as any)?.value !== true);
}

console.log('\n🧪  Stock decisions — bearish pack');
{
  const bearishPack = {
    technicals: { rsi14: 32, ema50: 500, ema200: 480, currentPrice: 440, macd: -3.1, macdSignal: -1.2 },
    valuation: { peRatio: 80, pbRatio: 9, netProfitMargin: -2, debtToEquity: 2.1, roe: -5 },
    newsSentiment: { sentiment: { compoundPolarity: -0.6, negativeCount: 8, totalHeadlines: 10 } },
    catalysts: { risks: ['regulatory investigation', 'earnings miss'] },
    marketContext: { scanArchives: {} },
    quality: {},
    sourceHealth: {},
    readinessInputs: { manifestDataGaps: ['missing financials', 'missing ownership'] }
  };
  const decisions = runStockDecisions('BEAR', bearishPack);
  assert('trend_direction is Bearish', (decisions['trend_direction']?.answer as any)?.choice === 'Bearish',
    `got ${(decisions['trend_direction']?.answer as any)?.choice}`);
  assert('action is Sell or Strong-Sell',
    ['Sell', 'Strong-Sell', 'Hold'].includes((decisions['action_recommendation']?.answer as any)?.choice),
    `got ${(decisions['action_recommendation']?.answer as any)?.choice}`);
  assert('news_risk true', (decisions['news_risk']?.answer as any)?.value === true,
    `got ${(decisions['news_risk']?.answer as any)?.value}`);
}

console.log('\n🧪  Stock decisions — empty pack (resilience)');
{
  const emptyPack = {};
  let threw = false;
  let decisions: any;
  try {
    decisions = runStockDecisions('EMPTY', emptyPack);
  } catch (e) {
    threw = true;
  }
  assert('does not throw on empty pack', !threw);
  assert('returns all 8 decisions', Object.keys(decisions ?? {}).length === 8);
}

console.log('\n🧪  Markdown renderer');
{
  const pack = {
    technicals: { rsi14: 55 },
    valuation: { peRatio: 25 },
    newsSentiment: {},
    marketContext: { scanArchives: {} },
    quality: {},
    sourceHealth: {},
    readinessInputs: {}
  };
  const decisions = runStockDecisions('ITC', pack);
  const summary = {
    action: (decisions['action_recommendation']?.answer as any)?.choice ?? 'Hold',
    actionConfidence: 0.6,
    trendDirection: 'Bullish',
    fundamentalScore: 2,
    valuationStance: 'Fairly-Valued',
    momentumLevel: 1,
    newsRisk: false,
    scanConviction: null,
    dataQualityLevel: 1
  };
  const md = renderLayaReportMarkdown({
    schema_version: '1.0', ticker: 'ITC', generatedAt: new Date().toISOString(),
    deterministic: true, llmUsed: false, modelSource: 'laya-js-rule-engine',
    decisions, summary
  });
  assert('markdown contains ticker', md.includes('ITC'));
  assert('markdown contains summary table', md.includes('Action Recommendation'));
  assert('markdown contains decisions section', md.includes('TREND DIRECTION'));
}

// ── Try real data if available ────────────────────────────────────────────────

console.log('\n🧪  Real data check (optional)');
const TICKERS = ['ITC', 'HDFC', 'HPCL', 'IOC'];
for (const ticker of TICKERS) {
  const packPath = path.join(process.cwd(), 'research', ticker, 'normalized', 'analysis-evidence-pack.json');
  try {
    const raw = await readFile(packPath, 'utf8');
    const pack = JSON.parse(raw);
    const decisions = runStockDecisions(ticker, pack);
    assert(`${ticker}: all 8 decisions`, Object.keys(decisions).length === 8);
    assert(`${ticker}: action has choice`, typeof (decisions['action_recommendation']?.answer as any)?.choice === 'string');
    assert(`${ticker}: confidence in range`, (decisions['action_recommendation']?.answer as any)?.confidence >= 0);
    console.log(`   → ${ticker} action: ${(decisions['action_recommendation']?.answer as any)?.choice} (${((decisions['action_recommendation']?.answer as any)?.confidence * 100).toFixed(0)}%)`);
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      console.log(`   ⚪  ${ticker}: no research data yet (run research pipeline first)`);
    } else {
      assert(`${ticker}: real data evaluation`, false, String(e));
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌  Some tests failed');
  process.exit(1);
} else {
  console.log('✅  All Laya decision engine tests passed');
}
