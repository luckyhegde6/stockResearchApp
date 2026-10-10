import path from 'node:path';
import { readText, writeText } from './fs.js';
import type { SourceArtifact } from '../types/research.js';
import { runStockDecisions } from './laya-stock-questions.js';


const MAX_EVIDENCE_CHARS = Number(process.env.PROMPT_EVIDENCE_LIMIT || 450000);

function looksTextual(filePath: string) { return /\.(md|txt|json|html?|csv|xml)$/i.test(filePath); }
async function readJson(file:string){ try{return JSON.parse(await readText(file));}catch{return null;} }

export async function buildAnalysisPrompt(
  skillPath: string,
  promptPath: string,
  researchDir: string,
  artifacts: SourceArtifact[],
  company: { name?: string; ticker: string; isin?: string }
) {
  const skill = await readText(skillPath);
  const promptTemplate = await readText(promptPath);
  const compactArtifacts = artifacts.map(a => ({ id:a.id,type:a.type,provider:a.provider,title:a.title,url:a.url,period:a.period,localPath:a.localPath,markdownPath:a.markdownPath,screenshotPath:a.screenshotPath,status:a.status,method:a.method,notes:a.notes }));
  const contract = await readJson(path.join(researchDir,'evidence-contract.json'));
  const health = await readJson(path.join(researchDir,'source-health.json'));
  const quality = await readJson(path.join(researchDir,'evidence-quality.json'));
  const analysisInputs = await readJson(path.join(researchDir,'normalized','analysis-inputs.json'));
  const analysisEvidencePack = await readJson(path.join(researchDir,'normalized','analysis-evidence-pack.json'));
  const newsSentiment = await readJson(path.join(researchDir,'normalized','news-sentiment.json'));
  const tradingViewSymbolSnapshot = await readJson(path.join(researchDir,'raw','tradingview','symbol-scanner-normalized.json'));

  const evidenceText: string[] = [];
  let used = 0;
  for (const a of artifacts) {
    const candidates = [a.markdownPath, a.localPath].filter(Boolean) as string[];
    for (const candidate of candidates) {
      if (!looksTextual(candidate)) continue;
      try {
        const txt = await readText(candidate);
        if (!txt.trim()) continue;
        const remaining = MAX_EVIDENCE_CHARS - used;
        if (remaining <= 0) break;
        const slice = txt.slice(0, Math.min(txt.length, remaining));
        const kind = candidate.endsWith('.json') ? 'STRUCTURED' : 'DOCUMENT';
        evidenceText.push(`\n\n===== ${a.id} | ${a.provider} | ${a.type} | ${kind} =====\n${slice}`);
        used += slice.length;
        break;
      } catch {}
    }
    if (used >= MAX_EVIDENCE_CHARS) break;
  }

  // Run Laya System 1 decisions (deterministic, no LLM)
  let layaSection = '';
  try {
    if (analysisEvidencePack) {
      const layaDecisions = runStockDecisions(company.ticker, analysisEvidencePack);
      const summary = {
        action:           (layaDecisions['action_recommendation']?.answer as any)?.choice ?? 'Insufficient-Data',
        actionConfidence: (layaDecisions['action_recommendation']?.answer as any)?.confidence ?? 0,
        trendDirection:   (layaDecisions['trend_direction']?.answer as any)?.choice ?? 'Mixed',
        fundamentalScore: (layaDecisions['fundamental_quality']?.answer as any)?.level ?? 0,
        valuationStance:  (layaDecisions['valuation_stance']?.answer as any)?.choice ?? 'Indeterminate',
        momentumLevel:    (layaDecisions['momentum_strength']?.answer as any)?.level ?? 0,
        newsRisk:         (layaDecisions['news_risk']?.answer as any)?.value ?? null,
        scanConviction:   (layaDecisions['scan_conviction']?.answer as any)?.value ?? null,
        dataQualityLevel: (layaDecisions['data_quality_gate']?.answer as any)?.level ?? 0
      };
      layaSection = `\n--- LAYA SYSTEM 1 DECISIONS (Deterministic Pre-Analysis) ---\nSource: laya-js-rule-engine (typed decision framework, no LLM)\nThese are deterministic pre-scored decisions. Cite them in your analysis using their question IDs.\n\nSummary:\n  action_recommendation : ${summary.action} (confidence: ${(summary.actionConfidence * 100).toFixed(0)}%)\n  trend_direction       : ${summary.trendDirection}\n  fundamental_quality   : Score ${summary.fundamentalScore}/4\n  valuation_stance      : ${summary.valuationStance}\n  momentum_strength     : Level ${summary.momentumLevel}/3\n  news_risk             : ${summary.newsRisk === null ? 'unclear' : summary.newsRisk ? 'true (risk present)' : 'false'}\n  scan_conviction       : ${summary.scanConviction === null ? 'unclear' : summary.scanConviction ? 'true (≥2 bullish scans)' : 'false'}\n  data_quality_gate     : Level ${summary.dataQualityLevel}/3\n\nFull decision objects (with evidence provenance):\n${JSON.stringify(layaDecisions, null, 2)}\n`;
    }
  } catch (_e) {
    layaSection = '\n--- LAYA SYSTEM 1 DECISIONS ---\n[Not available: evidence pack missing or incomplete]\n';
  }

  const finalPrompt = `${promptTemplate}

--- EXECUTION CONTRACT ---
- This is the final investment-reasoning stage. Do not browse or acquire new data.
- Treat normalized/analysis-evidence-pack.json as the primary compact evidence object.
- Treat evidence-contract.json as the provenance registry and normalized/reconciliation.json as the conflict authority.
- Material claims should cite real evidence identifiers in square brackets.
- Optional concall download failures are advisory when the core six domains are complete; do not let them block reasoning.
- BSE is excluded from the production model.

--- RUNTIME DATA ---
Company: ${company.name || 'Unknown'}
Ticker: ${company.ticker}
ISIN: ${company.isin || 'Unknown'}

--- CANONICAL EVIDENCE CONTRACT ---
The evidence-contract.json is the canonical index for analysis inputs. Prefer its FACTS and CALCULATED_METRICS over hunting through raw files. Every entry includes provenance, method and verification status.
${JSON.stringify(contract, null, 2)}

--- COMPACT ANALYSIS INPUTS ---
${JSON.stringify(analysisInputs, null, 2)}

--- ANALYSIS EVIDENCE PACK ---
${JSON.stringify(analysisEvidencePack, null, 2)}

--- NEWS & MARKET SENTIMENT ---
${JSON.stringify(newsSentiment, null, 2)}

--- TRADINGVIEW SYMBOL SNAPSHOT ---
${JSON.stringify(tradingViewSymbolSnapshot, null, 2)}

--- SOURCE HEALTH ---
${JSON.stringify(health, null, 2)}

--- EVIDENCE QUALITY ---
${JSON.stringify(quality, null, 2)}

--- ARTIFACT INDEX ---
${JSON.stringify(compactArtifacts,null,2)}

--- ANALYSIS RULES FOR EVIDENCE ---
- Source-derived values are facts observed from a source and tagged source_extraction.
- Deterministically computed indicators such as EMA50, EMA200 and RSI14 are calculated metrics and must be treated as calculated, not source quotes.
- A warning means an item was not verified in that specific source; it does not automatically mean the underlying information is unavailable from another source.
- NSE is the exchange-level source of record for this application.
- News sentiment is deterministic headline-level sentiment only; distinguish headline polarity from verified business impact.
- Use source diversity, recency and event type when assessing sentiment; do not treat a high headline score as a buy/sell signal.
- BSE is outside the production stock-analysis evidence model and must not be requested or relied upon.
- NSE quote-equity 403 does not mean quote data is missing when the deterministic GetQuoteApi fallback succeeded.
- Chartink strategy results are screening evidence, not investment recommendations; preserve the strategy name, category, scan rule/source context and matched-stock list.
- Chartink target-ticker membership in Long/Short/Intraday/Swing baskets is a point-in-time screening signal; do not treat membership as a buy/sell recommendation.
- Do not browse or invent missing evidence.
- LAYA SYSTEM 1 DECISIONS are deterministic pre-analysis outputs. Treat them as structured evidence, not as LLM outputs. You may agree or disagree with them, but you must explicitly acknowledge each decision in your analysis.
${layaSection}
--- NORMALIZED + STRUCTURED EVIDENCE ---
${evidenceText.join('\n')}

OUTPUT REQUIREMENT:
Return ONLY one valid JSON object matching skills/stock-analysis/JSON_SCHEMA.md. No Markdown fences. No commentary outside JSON.`;

  const out = path.join(researchDir, 'analysis-prompt.txt');
  await writeText(out, `SYSTEM SKILL\n========\n${skill}\n\nUSER ANALYSIS PROMPT\n===================\n${finalPrompt}`);
  return { out, prompt: finalPrompt };
}
