/**
 * Laya Decision Engine — TypeScript Adaptation
 *
 * Adapts the typed-question decision framework from Laya (github.com/NandhaKishorM/laya)
 * for deterministic, rule-based stock analysis. Instead of a PyTorch transformer model,
 * evaluators are pure functions over the AnalysisEvidencePack.
 *
 * Three question types (mirroring Laya's API):
 *   - choice  : pick one label from N named options
 *   - score   : ordinal level 0..N
 *   - noul    : binary true/false/unclear with confidence
 */

export type QType = 'choice' | 'score' | 'noul';

// ── Question Definitions ────────────────────────────────────────────────────

export interface ChoiceQuestion {
  type: 'choice';
  id: string;
  instructions: string;
  /** label → description of criteria for that label */
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: 'score';
  id: string;
  instructions: string;
  /** ordinal level descriptions, index = score value */
  criteria: string[];
}

export interface NoulQuestion {
  type: 'noul';
  id: string;
  instructions: string;
  criteria?: { false?: string; true?: string };
}

export type LayaQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

// ── Answer shapes ───────────────────────────────────────────────────────────

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;     // 0–1
  probabilities: Record<string, number>;
  evidence: string[];     // cited field paths
}

export interface ScoreAnswer {
  type: 'score';
  level: number;          // 0..N
  label: string;
  confidence: number;     // 0–1
  evidence: string[];
}

export interface NoulAnswer {
  type: 'noul';
  value: boolean | null;  // null = unclear
  label: 'true' | 'false' | 'unclear';
  confidence: number;     // 0–1
  evidence: string[];
}

export type LayaAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface LayaResult {
  questionId: string;
  questionType: QType;
  instructions: string;
  answer: LayaAnswer;
}

export interface LayaDecisionReport {
  schema_version: '1.0';
  ticker: string;
  generatedAt: string;
  deterministic: true;
  llmUsed: false;
  modelSource: 'laya-js-rule-engine';
  decisions: Record<string, LayaResult>;
  summary: LayaReportSummary;
}

export interface LayaReportSummary {
  action: string;
  actionConfidence: number;
  trendDirection: string;
  fundamentalScore: number;
  valuationStance: string;
  momentumLevel: number;
  newsRisk: boolean | null;
  scanConviction: boolean | null;
  dataQualityLevel: number;
}

// ── Core engine helpers ──────────────────────────────────────────────────────

/**
 * Softmax over raw logits (rule strengths). Mirrors Laya's confidence_from_probs.
 */
export function softmax(logits: Record<string, number>): Record<string, number> {
  const vals = Object.values(logits);
  const max = Math.max(...vals);
  const exps = vals.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const keys = Object.keys(logits);
  const out: Record<string, number> = {};
  keys.forEach((k, i) => { out[k] = sum > 0 ? exps[i] / sum : 1 / keys.length; });
  return out;
}

/**
 * Clamp a value to [0,1] range.
 */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Evaluate a choice question given raw label scores (higher = more confident for that label).
 */
export function evalChoice(
  question: ChoiceQuestion,
  labelScores: Record<string, number>,
  evidence: string[]
): ChoiceAnswer {
  const probs = softmax(labelScores);
  const choice = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
  return { type: 'choice', choice, confidence: clamp01(probs[choice]), probabilities: probs, evidence };
}

/**
 * Evaluate a score question given a raw continuous signal (0=worst, N=best).
 */
export function evalScore(
  question: ScoreQuestion,
  rawScore: number,
  evidence: string[]
): ScoreAnswer {
  const N = question.criteria.length - 1;
  const level = Math.round(Math.max(0, Math.min(N, rawScore)));
  // confidence = 1 - fractional distance from nearest integer boundary
  const fractional = Math.abs(rawScore - level);
  const confidence = clamp01(1 - fractional / Math.max(1, N));
  return { type: 'score', level, label: question.criteria[level], confidence, evidence };
}

/**
 * Evaluate a noul (yes/no/unclear) question given a raw truth-signal [-1..1].
 * > 0.15  → true
 * < -0.15 → false
 * else    → unclear (null)
 */
export function evalNoul(
  _question: NoulQuestion,
  signal: number,
  evidence: string[]
): NoulAnswer {
  const THRESHOLD = 0.15;
  const absSignal = Math.abs(signal);
  const confidence = clamp01(absSignal);
  if (signal > THRESHOLD) return { type: 'noul', value: true,  label: 'true',    confidence, evidence };
  if (signal < -THRESHOLD) return { type: 'noul', value: false, label: 'false',   confidence, evidence };
  return { type: 'noul', value: null, label: 'unclear', confidence: clamp01(1 - absSignal / THRESHOLD), evidence };
}

// ── Decision runner ──────────────────────────────────────────────────────────

export type EvaluatorFn = (pack: any) => LayaResult;

export class LayaDecisionEngine {
  private evaluators: Map<string, EvaluatorFn> = new Map();

  /**
   * Register a typed evaluator for a question id.
   */
  register(questionId: string, fn: EvaluatorFn): this {
    this.evaluators.set(questionId, fn);
    return this;
  }

  /**
   * Run all registered evaluators against an evidence pack.
   */
  run(ticker: string, pack: any): LayaDecisionReport {
    const decisions: Record<string, LayaResult> = {};
    for (const [id, fn] of this.evaluators) {
      try {
        decisions[id] = fn(pack);
      } catch (err) {
        // Gracefully degrade: record an unclear noul so downstream always has a value
        decisions[id] = {
          questionId: id,
          questionType: 'noul',
          instructions: `Error evaluating ${id}: ${String(err)}`,
          answer: { type: 'noul', value: null, label: 'unclear', confidence: 0, evidence: [`error: ${String(err)}`] }
        };
      }
    }
    const summary = buildSummary(decisions);
    return {
      schema_version: '1.0',
      ticker: ticker.toUpperCase(),
      generatedAt: new Date().toISOString(),
      deterministic: true,
      llmUsed: false,
      modelSource: 'laya-js-rule-engine',
      decisions,
      summary
    };
  }
}

function buildSummary(decisions: Record<string, LayaResult>): LayaReportSummary {
  const get = <T>(id: string, field: keyof LayaAnswer): T | any => {
    const r = decisions[id];
    if (!r) return null;
    return (r.answer as any)[field];
  };

  return {
    action:              get<string>('action_recommendation', 'choice') ?? 'Insufficient-Data',
    actionConfidence:    get<number>('action_recommendation', 'confidence') ?? 0,
    trendDirection:      get<string>('trend_direction', 'choice') ?? 'Mixed',
    fundamentalScore:    get<number>('fundamental_quality', 'level') ?? 0,
    valuationStance:     get<string>('valuation_stance', 'choice') ?? 'Indeterminate',
    momentumLevel:       get<number>('momentum_strength', 'level') ?? 0,
    newsRisk:            get<boolean | null>('news_risk', 'value') ?? null,
    scanConviction:      get<boolean | null>('scan_conviction', 'value') ?? null,
    dataQualityLevel:    get<number>('data_quality_gate', 'level') ?? 0
  };
}

// ── Markdown renderer ────────────────────────────────────────────────────────

export function renderLayaReportMarkdown(report: LayaDecisionReport): string {
  const lines: string[] = [
    `# Laya Decision Report: ${report.ticker}`,
    `Generated: ${report.generatedAt}`,
    `Model: ${report.modelSource}`,
    '',
    '## Summary',
    '',
    `| Decision | Value | Confidence |`,
    `|---|---|---|`,
    `| Action Recommendation | **${report.summary.action}** | ${(report.summary.actionConfidence * 100).toFixed(0)}% |`,
    `| Trend Direction | ${report.summary.trendDirection} | — |`,
    `| Fundamental Quality | Score ${report.summary.fundamentalScore}/4 | — |`,
    `| Valuation Stance | ${report.summary.valuationStance} | — |`,
    `| Momentum Strength | Level ${report.summary.momentumLevel}/3 | — |`,
    `| News Risk | ${report.summary.newsRisk === null ? 'Unclear' : report.summary.newsRisk ? 'Yes (risk present)' : 'No'} | — |`,
    `| Scan Conviction | ${report.summary.scanConviction === null ? 'Unclear' : report.summary.scanConviction ? 'Yes (≥2 bullish scans)' : 'No'} | — |`,
    `| Data Quality | Level ${report.summary.dataQualityLevel}/3 | — |`,
    '',
    '## Detailed Decisions',
    ''
  ];

  for (const [id, result] of Object.entries(report.decisions)) {
    lines.push(`### ${id.replace(/_/g, ' ').toUpperCase()}`);
    lines.push(`*${result.instructions}*`);
    lines.push('');
    const ans = result.answer;
    if (ans.type === 'choice') {
      lines.push(`**Choice**: ${ans.choice} (confidence: ${(ans.confidence * 100).toFixed(1)}%)`);
      lines.push('');
      lines.push('Probabilities:');
      for (const [lbl, prob] of Object.entries(ans.probabilities).sort((a, b) => b[1] - a[1])) {
        const bar = '█'.repeat(Math.round(prob * 20)) + '░'.repeat(20 - Math.round(prob * 20));
        lines.push(`- \`${lbl}\`: ${bar} ${(prob * 100).toFixed(1)}%`);
      }
    } else if (ans.type === 'score') {
      lines.push(`**Score**: ${ans.level} — ${ans.label} (confidence: ${(ans.confidence * 100).toFixed(1)}%)`);
    } else {
      lines.push(`**Noul**: ${ans.label} (confidence: ${(ans.confidence * 100).toFixed(1)}%)`);
    }
    if (ans.evidence.length > 0) {
      lines.push('');
      lines.push(`Evidence: ${ans.evidence.slice(0, 6).join(' · ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
