/**
 * Laya Stock Question Definitions & Evaluators
 *
 * Defines the 8 typed decision questions applied to each stock's AnalysisEvidencePack.
 * Each evaluator is a pure function: (pack) => LayaResult
 *
 * Question taxonomy mirrors Laya's typed decision framework:
 *   choice  → pick one label
 *   score   → ordinal level 0..N
 *   noul    → yes/no/unclear boolean
 */

import {
  LayaDecisionEngine,
  LayaResult,
  ChoiceQuestion,
  ScoreQuestion,
  NoulQuestion,
  evalChoice,
  evalScore,
  evalNoul,
  clamp01
} from './laya-decision-engine.js';

// ── Question Definitions ─────────────────────────────────────────────────────

export const Q_TREND_DIRECTION: ChoiceQuestion = {
  type: 'choice',
  id: 'trend_direction',
  instructions: 'What is the dominant price trend for this stock based on technical indicators and price action?',
  criteria: {
    'Bullish':  'Price above EMAs, RSI > 55, MACD positive or rising, higher highs pattern',
    'Bearish':  'Price below EMAs, RSI < 45, MACD negative or falling, lower lows pattern',
    'Sideways': 'Price oscillating within a narrow range, RSI between 45-55, weak trend signals',
    'Mixed':    'Conflicting signals across timeframes or insufficient technical data'
  }
};

export const Q_FUNDAMENTAL_QUALITY: ScoreQuestion = {
  type: 'score',
  id: 'fundamental_quality',
  instructions: 'Rate the fundamental financial quality of this company based on its financial health, profitability, and balance sheet.',
  criteria: [
    'Poor: Losses, negative margins, high debt, deteriorating financials',
    'Weak: Below-average margins, elevated debt, inconsistent earnings',
    'Fair: Average profitability, manageable debt, stable but uninspiring metrics',
    'Good: Above-average margins, healthy balance sheet, consistent earnings growth',
    'Excellent: Best-in-class margins, net cash or low debt, strong sustained earnings growth'
  ]
};

export const Q_VALUATION_STANCE: ChoiceQuestion = {
  type: 'choice',
  id: 'valuation_stance',
  instructions: 'What is the current valuation stance of this stock relative to its fundamentals and sector peers?',
  criteria: {
    'Overvalued':     'P/E, P/B significantly above sector median or historical average without commensurate growth',
    'Fairly-Valued':  'Valuation multiples broadly in line with sector, peers, and historical norms',
    'Undervalued':    'Trading at meaningful discount to intrinsic value or peers given earnings quality',
    'Indeterminate':  'Insufficient financial data or no clear reference point for valuation judgment'
  }
};

export const Q_MOMENTUM_STRENGTH: ScoreQuestion = {
  type: 'score',
  id: 'momentum_strength',
  instructions: 'Rate the price momentum strength based on RSI, volume trends, and short-term price performance.',
  criteria: [
    'No-momentum: Flat or reversing; RSI neutral, volume below average',
    'Weak: Mild directional bias; RSI 50-60 or 40-50, average volume',
    'Moderate: Clear directional move; RSI 60-70 or 30-40, above-average volume',
    'Strong: Powerful move; RSI >70 or <30, significant volume surge, multi-week trend'
  ]
};

export const Q_NEWS_RISK: NoulQuestion = {
  type: 'noul',
  id: 'news_risk',
  instructions: 'Is there an active negative catalyst, regulatory risk, or adverse headline event in recent news?',
  criteria: {
    true:  'Recent news contains negative sentiment: regulatory action, earnings miss, fraud allegations, sector headwinds',
    false: 'News is neutral-to-positive; no material adverse events detected in recent headlines'
  }
};

export const Q_SCAN_CONVICTION: NoulQuestion = {
  type: 'noul',
  id: 'scan_conviction',
  instructions: 'Does this stock appear in 2 or more bullish market scanner categories (Chartink, NSE, Screener)?',
  criteria: {
    true:  'Stock appears in ≥2 bullish screener/scan baskets: breakout, momentum, fundamental screening',
    false: 'Stock appears in fewer than 2 bullish scan categories or only in bearish/short screens'
  }
};

export const Q_DATA_QUALITY_GATE: ScoreQuestion = {
  type: 'score',
  id: 'data_quality_gate',
  instructions: 'How complete and reliable is the underlying evidence pack for this stock analysis?',
  criteria: [
    'Insufficient: Missing >50% of required files; core financial data unavailable',
    'Partial: Missing 25-50% required files; some key data gaps',
    'Adequate: <25% missing files; minor gaps only; advisory items not blocking',
    'Complete: All required files present; no blocking data gaps; full evidence available'
  ]
};

export const Q_ACTION_RECOMMENDATION: ChoiceQuestion = {
  type: 'choice',
  id: 'action_recommendation',
  instructions: 'Based on trend, fundamentals, valuation, momentum, and risk assessment: what action is indicated?',
  criteria: {
    'Strong-Buy':         'Strong bullish trend + good fundamentals + undervalued + strong momentum + no news risk',
    'Buy':                'Bullish trend + fair fundamentals + fairly valued or undervalued + moderate momentum',
    'Hold':               'Mixed or sideways trend; adequate fundamentals; fairly valued; no compelling entry/exit',
    'Sell':               'Bearish trend or overvalued + weak fundamentals + no scan conviction',
    'Strong-Sell':        'Clear bearish trend + poor fundamentals + overvalued + active news risk',
    'Insufficient-Data':  'Evidence pack too incomplete to form a reliable recommendation'
  }
};

// ── Evaluators ───────────────────────────────────────────────────────────────

function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeStr(v: any): string {
  return v != null ? String(v).toLowerCase() : '';
}

function countBullishScans(pack: any): number {
  const scans = pack?.marketContext?.scanArchives ?? {};
  let count = 0;
  for (const family of Object.values(scans) as any[]) {
    if (family?.membership || family?.top20Membership) count++;
  }
  // Also check Chartink scan membership from screening
  const screening = pack?.screening;
  if (screening?.chartinkScans?.length > 0) count++;
  return count;
}

function negativeNewsScore(pack: any): number {
  const news = pack?.newsSentiment;
  if (!news) return 0;
  const polarity = safeNum(news?.sentiment?.compoundPolarity ?? news?.compoundPolarity);
  const negCount  = safeNum(news?.sentiment?.negativeCount ?? news?.negativeCount);
  const totalCount = safeNum(news?.sentiment?.totalHeadlines ?? news?.totalHeadlines, 1);
  // negative polarity + high negative ratio = risk signal
  const negRatio = totalCount > 0 ? negCount / totalCount : 0;
  return clamp01(-polarity * 0.5 + negRatio * 0.5);
}

// ── Trend Direction Evaluator ─────────────────────────────────────────────────

function evalTrendDirection(pack: any): LayaResult {
  const tech = pack?.technicals ?? {};
  const tvSnap = pack?.tradingViewSymbolSnapshot ?? {};
  const evidence: string[] = [];

  // Extract technicals
  const rsi = safeNum(tech?.rsi14 ?? tech?.rsi ?? tvSnap?.rsi14 ?? tvSnap?.RSI, NaN);
  const ema50 = safeNum(tech?.ema50 ?? tvSnap?.EMA50);
  const ema200 = safeNum(tech?.ema200 ?? tvSnap?.EMA200);
  const close = safeNum(
    tech?.lastClose ?? tech?.currentPrice ?? tvSnap?.lastClose ?? tvSnap?.close ?? tvSnap?.ltp
  );
  const macd = safeNum(tech?.macd ?? tvSnap?.MACD ?? tvSnap?.macd, NaN);
  const macdSignal = safeNum(tech?.macdSignal ?? tvSnap?.MACD_signal, NaN);

  const scores: Record<string, number> = { Bullish: 0, Bearish: 0, Sideways: 0, Mixed: 0 };

  if (Number.isFinite(rsi)) {
    evidence.push(`technicals.rsi14=${rsi.toFixed(1)}`);
    if (rsi > 60) scores['Bullish'] += 2;
    else if (rsi > 55) scores['Bullish'] += 1;
    else if (rsi < 40) scores['Bearish'] += 2;
    else if (rsi < 45) scores['Bearish'] += 1;
    else scores['Sideways'] += 1;
  }

  if (close > 0 && ema50 > 0) {
    evidence.push(`close=${close} ema50=${ema50.toFixed(2)}`);
    if (close > ema50 * 1.02) scores['Bullish'] += 2;
    else if (close > ema50) scores['Bullish'] += 1;
    else if (close < ema50 * 0.98) scores['Bearish'] += 2;
    else scores['Bearish'] += 1;
  }

  if (close > 0 && ema200 > 0) {
    evidence.push(`close vs ema200=${ema200.toFixed(2)}`);
    if (close > ema200) scores['Bullish'] += 1;
    else scores['Bearish'] += 1;
  }

  if (Number.isFinite(macd) && Number.isFinite(macdSignal)) {
    evidence.push(`macd=${macd.toFixed(3)} signal=${macdSignal.toFixed(3)}`);
    if (macd > macdSignal) scores['Bullish'] += 1;
    else scores['Bearish'] += 1;
  }

  // If no evidence at all → Mixed
  const totalSignals = Object.values(scores).reduce((a, b) => a + b, 0);
  if (totalSignals === 0) { scores['Mixed'] = 1; evidence.push('no technical data available'); }

  return {
    questionId: Q_TREND_DIRECTION.id,
    questionType: 'choice',
    instructions: Q_TREND_DIRECTION.instructions,
    answer: evalChoice(Q_TREND_DIRECTION, scores, evidence)
  };
}

// ── Fundamental Quality Evaluator ─────────────────────────────────────────────

function evalFundamentalQuality(pack: any): LayaResult {
  const vals = pack?.valuation ?? {};
  const funds = pack?.fundamentals ?? {};
  const identity = pack?.identity ?? {};
  const evidence: string[] = [];

  let score = 0;
  let signals = 0;

  // Net profit margin
  const npm = safeNum(vals?.netProfitMargin ?? funds?.netProfitMargin, NaN);
  if (Number.isFinite(npm)) {
    evidence.push(`netProfitMargin=${npm.toFixed(1)}%`);
    if (npm > 20) { score += 2; signals++; }
    else if (npm > 10) { score += 1.5; signals++; }
    else if (npm > 5) { score += 1; signals++; }
    else if (npm > 0) { score += 0.5; signals++; }
    else { score += 0; signals++; }
  }

  // Debt to equity
  const de = safeNum(vals?.debtToEquity ?? funds?.debtToEquity, NaN);
  if (Number.isFinite(de) && de >= 0) {
    evidence.push(`debtToEquity=${de.toFixed(2)}`);
    if (de < 0.3) { score += 1; signals++; }
    else if (de < 0.7) { score += 0.7; signals++; }
    else if (de < 1.5) { score += 0.4; signals++; }
    else { score += 0; signals++; }
  }

  // ROE
  const roe = safeNum(vals?.roe ?? funds?.roe ?? vals?.returnOnEquity, NaN);
  if (Number.isFinite(roe)) {
    evidence.push(`roe=${roe.toFixed(1)}%`);
    if (roe > 20) { score += 1; signals++; }
    else if (roe > 12) { score += 0.7; signals++; }
    else if (roe > 5) { score += 0.4; signals++; }
    else { score += 0; signals++; }
  }

  // Revenue growth
  const revGrowth = safeNum(funds?.revenueGrowth ?? vals?.revenueGrowth ?? funds?.salesGrowthYoY, NaN);
  if (Number.isFinite(revGrowth)) {
    evidence.push(`revenueGrowth=${revGrowth.toFixed(1)}%`);
    if (revGrowth > 15) { score += 1; signals++; }
    else if (revGrowth > 8) { score += 0.7; signals++; }
    else if (revGrowth > 0) { score += 0.4; signals++; }
    else { score += 0; signals++; }
  }

  // Normalize to 0–4 scale
  const maxPossible = signals > 0 ? signals * (2 + 1 + 1 + 1) / 4 : 1;
  const rawScore = signals > 0 ? (score / maxPossible) * 4 : 2; // default to Fair

  if (evidence.length === 0) evidence.push('no fundamental data available');

  return {
    questionId: Q_FUNDAMENTAL_QUALITY.id,
    questionType: 'score',
    instructions: Q_FUNDAMENTAL_QUALITY.instructions,
    answer: evalScore(Q_FUNDAMENTAL_QUALITY, rawScore, evidence)
  };
}

// ── Valuation Stance Evaluator ────────────────────────────────────────────────

function evalValuationStance(pack: any): LayaResult {
  const vals = pack?.valuation ?? {};
  const tech = pack?.technicals ?? {};
  const evidence: string[] = [];
  const scores: Record<string, number> = {
    'Overvalued': 0, 'Fairly-Valued': 0, 'Undervalued': 0, 'Indeterminate': 0
  };

  const pe = safeNum(vals?.peRatio ?? vals?.pe ?? vals?.trailingPE, NaN);
  const pb = safeNum(vals?.pbRatio ?? vals?.pb ?? vals?.priceToBook, NaN);
  const peg = safeNum(vals?.pegRatio ?? vals?.peg, NaN);

  if (Number.isFinite(pe) && pe > 0) {
    evidence.push(`P/E=${pe.toFixed(1)}`);
    // Heuristic: high P/E = overvalued, low = undervalued (sector-agnostic rough rule)
    if (pe > 60) scores['Overvalued'] += 3;
    else if (pe > 35) scores['Overvalued'] += 1.5;
    else if (pe < 10) scores['Undervalued'] += 2;
    else if (pe < 18) scores['Undervalued'] += 1;
    else scores['Fairly-Valued'] += 2;
  }

  if (Number.isFinite(pb) && pb > 0) {
    evidence.push(`P/B=${pb.toFixed(2)}`);
    if (pb > 8) scores['Overvalued'] += 2;
    else if (pb > 4) scores['Overvalued'] += 0.5;
    else if (pb < 1) scores['Undervalued'] += 2;
    else if (pb < 2) scores['Undervalued'] += 0.5;
    else scores['Fairly-Valued'] += 1;
  }

  if (Number.isFinite(peg) && peg > 0) {
    evidence.push(`PEG=${peg.toFixed(2)}`);
    if (peg > 2) scores['Overvalued'] += 1;
    else if (peg < 1) scores['Undervalued'] += 1.5;
    else scores['Fairly-Valued'] += 1;
  }

  const totalSignals = Object.values(scores).reduce((a, b) => a + b, 0);
  if (totalSignals === 0) { scores['Indeterminate'] = 1; evidence.push('no valuation data'); }

  return {
    questionId: Q_VALUATION_STANCE.id,
    questionType: 'choice',
    instructions: Q_VALUATION_STANCE.instructions,
    answer: evalChoice(Q_VALUATION_STANCE, scores, evidence)
  };
}

// ── Momentum Strength Evaluator ───────────────────────────────────────────────

function evalMomentumStrength(pack: any): LayaResult {
  const tech = pack?.technicals ?? {};
  const tvSnap = pack?.tradingViewSymbolSnapshot ?? {};
  const evidence: string[] = [];

  const rsi = safeNum(tech?.rsi14 ?? tvSnap?.rsi14 ?? tvSnap?.RSI, NaN);
  const vol = safeNum(tech?.volumeRatio ?? tvSnap?.volumeRatio, NaN);
  const priceChg5d = safeNum(tech?.priceChange5d ?? tvSnap?.change5d ?? tvSnap?.perfW, NaN);
  const priceChg1m = safeNum(tech?.priceChange1m ?? tvSnap?.change1m ?? tvSnap?.Perf.M, NaN);

  let score = 1; // default weak momentum
  let signals = 0;

  if (Number.isFinite(rsi)) {
    evidence.push(`rsi14=${rsi.toFixed(1)}`);
    const rsiDist = Math.abs(rsi - 50);
    score += (rsiDist / 50) * 1.5;
    signals++;
  }

  if (Number.isFinite(vol) && vol > 0) {
    evidence.push(`volumeRatio=${vol.toFixed(2)}`);
    if (vol > 2) score += 1;
    else if (vol > 1.3) score += 0.5;
    signals++;
  }

  if (Number.isFinite(priceChg5d)) {
    evidence.push(`priceChange5d=${priceChg5d.toFixed(2)}%`);
    score += Math.min(1, Math.abs(priceChg5d) / 5);
    signals++;
  }

  if (signals === 0) { evidence.push('no momentum data'); }
  // Normalize to 0–3 range
  const rawScore = clamp01(score / 4) * 3;

  return {
    questionId: Q_MOMENTUM_STRENGTH.id,
    questionType: 'score',
    instructions: Q_MOMENTUM_STRENGTH.instructions,
    answer: evalScore(Q_MOMENTUM_STRENGTH, rawScore, evidence)
  };
}

// ── News Risk Evaluator ───────────────────────────────────────────────────────

function evalNewsRisk(pack: any): LayaResult {
  const evidence: string[] = [];
  const negScore = negativeNewsScore(pack);
  const news = pack?.newsSentiment ?? {};
  const totalHeadlines = safeNum(news?.sentiment?.totalHeadlines ?? news?.totalHeadlines, 0);
  evidence.push(`negativeScore=${negScore.toFixed(2)} headlines=${totalHeadlines}`);

  // Also check catalysts for risk keywords
  const catalysts = pack?.catalysts ?? {};
  const risks = Array.isArray(catalysts?.risks) ? catalysts.risks : [];
  if (risks.length > 0) {
    evidence.push(`catalystRisks=${risks.length}`);
  }
  const riskBoost = risks.length > 0 ? 0.3 : 0;
  const signal = -(negScore + riskBoost) * 2 + 1; // maps 0=no risk → +1, 1=high risk → -1

  return {
    questionId: Q_NEWS_RISK.id,
    questionType: 'noul',
    instructions: Q_NEWS_RISK.instructions,
    answer: evalNoul(Q_NEWS_RISK, -signal, evidence)  // invert: signal>0 = risk present
  };
}

// ── Scan Conviction Evaluator ─────────────────────────────────────────────────

function evalScanConviction(pack: any): LayaResult {
  const bullishScans = countBullishScans(pack);
  const evidence: string[] = [`bullishScanCount=${bullishScans}`];

  // Add which scan families matched
  const scans = pack?.marketContext?.scanArchives ?? {};
  for (const [family, data] of Object.entries(scans) as [string, any][]) {
    if (data?.membership) evidence.push(`${family}:matched`);
    else if (data?.top20Membership) evidence.push(`${family}:top20`);
  }

  // signal: 1 = very convinced, -1 = not convinced
  const signal = bullishScans >= 3 ? 0.9 : bullishScans >= 2 ? 0.4 : bullishScans === 1 ? -0.2 : -0.8;

  return {
    questionId: Q_SCAN_CONVICTION.id,
    questionType: 'noul',
    instructions: Q_SCAN_CONVICTION.instructions,
    answer: evalNoul(Q_SCAN_CONVICTION, signal, evidence)
  };
}

// ── Data Quality Gate Evaluator ───────────────────────────────────────────────

function evalDataQualityGate(pack: any): LayaResult {
  const quality = pack?.quality ?? {};
  const sourceHealth = pack?.sourceHealth ?? {};
  const evidence: string[] = [];

  const coreCompleteness = safeNum(
    quality?.report?.coreCompleteness?.score ??
    quality?.coreCompleteness?.score ??
    quality?.completeness,
    NaN
  );

  const overallStatus = safeStr(
    sourceHealth?.overall?.status ?? sourceHealth?.overallStatus ?? quality?.report?.status ?? quality?.status ?? ''
  );

  let rawScore = 2; // default: adequate

  if (Number.isFinite(coreCompleteness)) {
    evidence.push(`coreCompleteness=${coreCompleteness.toFixed(1)}%`);
    rawScore = (coreCompleteness / 100) * 3;
  } else {
    evidence.push('no core completeness metric');
  }

  if (overallStatus) {
    evidence.push(`sourceHealth.status=${overallStatus}`);
    if (overallStatus.includes('healthy') || overallStatus.includes('complete')) rawScore = Math.max(rawScore, 2);
    else if (overallStatus.includes('partial')) rawScore = Math.min(rawScore, 2);
    else if (overallStatus.includes('missing') || overallStatus.includes('fail')) rawScore = Math.min(rawScore, 1);
  }

  // Check readiness inputs
  const ri = pack?.readinessInputs ?? {};
  const manifestGaps = Array.isArray(ri?.manifestDataGaps) ? ri.manifestDataGaps.length : 0;
  if (manifestGaps > 0) {
    evidence.push(`manifestDataGaps=${manifestGaps}`);
    rawScore = Math.max(0, rawScore - manifestGaps * 0.3);
  }

  return {
    questionId: Q_DATA_QUALITY_GATE.id,
    questionType: 'score',
    instructions: Q_DATA_QUALITY_GATE.instructions,
    answer: evalScore(Q_DATA_QUALITY_GATE, rawScore, evidence)
  };
}

// ── Action Recommendation Evaluator ──────────────────────────────────────────

function evalActionRecommendation(pack: any, subDecisions: Record<string, LayaResult>): LayaResult {
  const trend   = (subDecisions['trend_direction']?.answer as any)?.choice ?? 'Mixed';
  const fundLvl = (subDecisions['fundamental_quality']?.answer as any)?.level ?? 2;
  const valSt   = (subDecisions['valuation_stance']?.answer as any)?.choice ?? 'Indeterminate';
  const momLvl  = (subDecisions['momentum_strength']?.answer as any)?.level ?? 1;
  const newsRisk= (subDecisions['news_risk']?.answer as any)?.value ?? null;
  const scanConv= (subDecisions['scan_conviction']?.answer as any)?.value ?? null;
  const dataQ   = (subDecisions['data_quality_gate']?.answer as any)?.level ?? 1;

  const evidence: string[] = [
    `trend=${trend}`, `fundamental=${fundLvl}/4`, `valuation=${valSt}`,
    `momentum=${momLvl}/3`, `newsRisk=${newsRisk}`, `scanConviction=${scanConv}`, `dataQuality=${dataQ}/3`
  ];

  // Insufficient data gate
  if (dataQ < 1) {
    return {
      questionId: Q_ACTION_RECOMMENDATION.id,
      questionType: 'choice',
      instructions: Q_ACTION_RECOMMENDATION.instructions,
      answer: evalChoice(Q_ACTION_RECOMMENDATION,
        { 'Strong-Buy': 0, 'Buy': 0, 'Hold': 0, 'Sell': 0, 'Strong-Sell': 0, 'Insufficient-Data': 3 },
        evidence)
    };
  }

  const scores: Record<string, number> = {
    'Strong-Buy': 0, 'Buy': 0, 'Hold': 2, 'Sell': 0, 'Strong-Sell': 0, 'Insufficient-Data': 0
  };

  // Trend signals
  if (trend === 'Bullish') { scores['Strong-Buy'] += 2; scores['Buy'] += 1; }
  else if (trend === 'Bearish') { scores['Sell'] += 2; scores['Strong-Sell'] += 1; }
  else if (trend === 'Sideways') { scores['Hold'] += 2; }
  else { scores['Hold'] += 1; }

  // Fundamental quality
  if (fundLvl >= 3) { scores['Strong-Buy'] += 1.5; scores['Buy'] += 1; }
  else if (fundLvl >= 2) { scores['Buy'] += 0.5; scores['Hold'] += 0.5; }
  else { scores['Sell'] += 1; scores['Strong-Sell'] += 0.5; }

  // Valuation
  if (valSt === 'Undervalued') { scores['Strong-Buy'] += 1.5; scores['Buy'] += 1; }
  else if (valSt === 'Fairly-Valued') { scores['Hold'] += 0.5; }
  else if (valSt === 'Overvalued') { scores['Sell'] += 1.5; scores['Strong-Sell'] += 0.5; }

  // Momentum
  if (momLvl >= 3) { scores['Strong-Buy'] += 1; scores['Buy'] += 0.5; }
  else if (momLvl >= 2) { scores['Buy'] += 0.5; }

  // News risk penalty
  if (newsRisk === true) { scores['Sell'] += 1; scores['Strong-Sell'] += 0.5; scores['Strong-Buy'] -= 1; }

  // Scan conviction bonus
  if (scanConv === true) { scores['Strong-Buy'] += 0.5; scores['Buy'] += 0.5; }

  return {
    questionId: Q_ACTION_RECOMMENDATION.id,
    questionType: 'choice',
    instructions: Q_ACTION_RECOMMENDATION.instructions,
    answer: evalChoice(Q_ACTION_RECOMMENDATION, scores, evidence)
  };
}

// ── Engine Factory ────────────────────────────────────────────────────────────

/**
 * Build and return a configured LayaDecisionEngine with all stock analysis questions.
 */
export function createStockDecisionEngine(): LayaDecisionEngine {
  const engine = new LayaDecisionEngine();

  // Independent evaluators (can run in any order)
  engine.register('trend_direction',      (pack) => evalTrendDirection(pack));
  engine.register('fundamental_quality',  (pack) => evalFundamentalQuality(pack));
  engine.register('valuation_stance',     (pack) => evalValuationStance(pack));
  engine.register('momentum_strength',    (pack) => evalMomentumStrength(pack));
  engine.register('news_risk',            (pack) => evalNewsRisk(pack));
  engine.register('scan_conviction',      (pack) => evalScanConviction(pack));
  engine.register('data_quality_gate',    (pack) => evalDataQualityGate(pack));

  // Action recommendation depends on sub-decisions — runs last via manual override
  // We register a stub here; the CLI/API runner calls it with sub-decisions explicitly
  engine.register('action_recommendation', (pack) => {
    // When called directly via engine.run(), sub-decisions won't be available yet.
    // This provides a basic fallback evaluation.
    const tempDecisions: Record<string, LayaResult> = {};
    return evalActionRecommendation(pack, tempDecisions);
  });

  return engine;
}

/**
 * Run all stock decisions in correct dependency order.
 * This is the preferred entry point (vs engine.run() directly).
 */
export function runStockDecisions(ticker: string, pack: any) {
  const decisions: Record<string, LayaResult> = {};

  // Run independent evaluators first
  for (const fn of [
    evalTrendDirection, evalFundamentalQuality, evalValuationStance,
    evalMomentumStrength, evalNewsRisk, evalScanConviction, evalDataQualityGate
  ]) {
    const result = fn(pack);
    decisions[result.questionId] = result;
  }

  // Run action recommendation last with full sub-decision context
  const actionResult = evalActionRecommendation(pack, decisions);
  decisions[actionResult.questionId] = actionResult;

  return decisions;
}
