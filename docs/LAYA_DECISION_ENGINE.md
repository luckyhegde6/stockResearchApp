# Laya Decision Engine — TypeScript Adaptation & Architecture

## Overview

The **Laya Decision Engine** in this repository is an adaptation of the typed question framework from [Laya](https://github.com/NandhaKishorM/laya).

While the original Python project implements a 421M-parameter ModernBERT transformer model executing non-autoregressive single-forward-pass inference over arbitrary structured state strings, this TypeScript engine adapts **Laya's architectural decision principles** for deterministic, evidence-driven stock research.

```
+-------------------------------------------------------------+
|                AnalysisEvidencePack (JSON)                  |
|     (NSE, Screener, Trendlyne, Chartink, News, Techs)       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                 Laya Decision Engine (JS/TS)                |
|  Evaluates 8 Typed Questions with Calibrated Probabilities  |
+-------------------------------------------------------------+
            |                                    |
            v                                    v
+-----------------------+              +-----------------------+
|  LLM Prompt Injection |              |   Dashboard UI & API  |
|  (System 1 Pre-Score) |              |  (Confidence Bars &   |
|   src/lib/prompt.ts   |              |    Evidence Traces)   |
+-----------------------+              +-----------------------+
```

---

## 1. Typed Question Framework

The engine implements Laya's three core question primitives in [`src/lib/laya-decision-engine.ts`](file:///f:/Local_git/stock-research-app/src/lib/laya-decision-engine.ts):

### 1.1 `choice` (Categorical Selection)
- Selects exactly one label from $N$ named criteria options.
- Calculates an unnormalized logit for each choice based on evidence factors.
- Applies a numerically stable **softmax function** with temperature scaling ($T=1.0$) to produce a probability distribution across all choices.
- Output:
  ```json
  {
    "type": "choice",
    "choice": "Bullish",
    "confidence": 0.84,
    "probabilities": {
      "Bullish": 0.84,
      "Bearish": 0.04,
      "Sideways": 0.08,
      "Mixed": 0.04
    },
    "evidence": ["technical.indicators.rsi14", "technical.emas.ema50"]
  }
  ```

### 1.2 `score` (Ordinal Scale)
- Rates on an integer scale from $0$ to $N$ (e.g. $0$ to $4$ for fundamental quality).
- Evaluates ordinal boundary criteria monotonically.
- Output:
  ```json
  {
    "type": "score",
    "level": 4,
    "label": "Excellent: Best-in-class margins, net cash or low debt",
    "confidence": 0.90,
    "evidence": ["fundamentals.roce", "fundamentals.debtToEquity"]
  }
  ```

### 1.3 `noul` (Binary Judgment: Yes / No / Unclear)
- Evaluates a boolean hypothesis: returns `true`, `false`, or `null` (unclear/insufficient data).
- Accompanied by a calibrated confidence score $\in [0, 1]$.
- Output:
  ```json
  {
    "type": "noul",
    "value": false,
    "confidence": 0.85,
    "rationale": "No critical risk events detected across recent headlines",
    "evidence": ["news.sentiment.score", "news.headlineCount"]
  }
  ```

---

## 2. Stock Decision Question Taxonomy

The 8 stock-specific decision questions are defined and evaluated in [`src/lib/laya-stock-questions.ts`](file:///f:/Local_git/stock-research-app/src/lib/laya-stock-questions.ts):

| Question ID | Type | Options / Scale | Primary Evidence Fields |
| :--- | :--- | :--- | :--- |
| `trend_direction` | `choice` | Bullish, Bearish, Sideways, Mixed | `technical.emas`, `rsi14`, `macd`, `deliveryPercentage` |
| `fundamental_quality` | `score` | Level 0 (Poor) → Level 4 (Excellent) | `roce`, `roe`, `debtToEquity`, `opmPercent`, `profitGrowth` |
| `valuation_stance` | `choice` | Overvalued, Fairly-Valued, Undervalued, Indeterminate | `peRatio`, `industryPE`, `pbRatio`, `evEbitda` |
| `momentum_strength` | `score` | Level 0 (None) → Level 3 (Strong) | `rsi14`, `macdHist`, `priceChange1W`, `priceChange1M` |
| `news_risk` | `noul` | `true` (risk detected), `false` (no risk), `null` | `news.sentiment.score`, `news.riskKeywords` |
| `scan_conviction` | `noul` | `true` ($\ge 2$ bullish scans), `false`, `null` | `chartink.matchingBaskets`, `scans.52wHigh` |
| `data_quality_gate` | `score` | Level 0 (Critical) → Level 3 (Production Complete) | `evidenceContract.coveragePercent`, `missingDomains` |
| `action_recommendation` | `choice` | Strong-Buy, Buy, Hold, Sell, Strong-Sell, Insufficient-Data | Multi-factor synthesis of all above 7 decisions |

---

## 3. Integration Points

### 3.1 LLM Prompt Injection ([`src/lib/prompt.ts`](file:///f:/Local_git/stock-research-app/src/lib/prompt.ts))
When building the analysis prompt (`buildAnalysisPrompt`), the Laya decision engine runs deterministically on `analysis-evidence-pack.json`. Its structured outputs are injected into the prompt as:
```text
--- LAYA SYSTEM 1 DECISIONS (Deterministic Pre-Analysis) ---
Source: laya-js-rule-engine (typed decision framework, no LLM)
These are deterministic pre-scored decisions. Cite them in your analysis using their question IDs.

Summary:
  action_recommendation : Buy (confidence: 78%)
  trend_direction       : Bullish
  fundamental_quality   : Score 3/4
  valuation_stance      : Fairly-Valued
  momentum_strength     : Level 2/3
  news_risk             : false
  scan_conviction       : true (≥2 bullish scans)
  data_quality_gate     : Level 3/3
```
This forces the downstream LLM to ground its reasoning against calibrated pre-computed baselines rather than hallucinating subjective impressions.

### 3.2 Server REST API ([`src/server.ts`](file:///f:/Local_git/stock-research-app/src/server.ts))
- **`GET /api/laya/:ticker`**: Evaluates the ticker's `analysis-evidence-pack.json` on-the-fly and returns full JSON report.
- **`GET /api/laya/:ticker?format=markdown`**: Returns formatted Markdown report.
- **`POST /api/trigger/laya`**: Triggers execution for specified symbol.

### 3.3 Dashboard UI ([`public/index.html`](file:///f:/Local_git/stock-research-app/public/index.html))
The "Laya Decisions" tab in the dashboard provides:
- Ticker selector with dynamic researched symbol loading.
- High-level metric summary cards for Action, Trend, Fundamentals, and Valuation.
- Detailed question breakdown with confidence progress bars, question instructions, criteria matching, and citation badges.
- Live view/toggle for Markdown report export.

---

## 4. CLI Execution & Testing

### Running Standalone Decisions
```bash
# Evaluate a specific ticker
npx tsx scripts/laya-decision-run.ts ITC

# Generate markdown report
npx tsx scripts/laya-decision-run.ts HDFC --format markdown

# Via package script
npm run laya:decisions -- HPCL
```

### Running Test Suite
```bash
# Validates primitives (softmax, scoring, noul), synthetic packs, and real artifacts
npm run test:laya
```
