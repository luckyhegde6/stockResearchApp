# Stock Research Pipeline Evidence Contract Specification

This document details the **Evidence Contract Specification** (v1.49.5), defining the 6 required evidence packs, quality scoring metrics, canonical fact reconciliation, data gap taxonomy, and the analysis readiness gate.

---

## 📦 The 6 Core Evidence Packs

For any individual stock research run (`research/<SYMBOL>/`), the pipeline attempts to acquire six distinct evidence packs:

| Evidence Pack | Authoritative Source | Primary File Path | Requirements |
| :--- | :--- | :--- | :--- |
| **1. Fundamental Financials** | Screener.in | `raw/screener/screener-fundamentals.json` | 10-year P&L, balance sheet, cash flow, debt, ratios. |
| **2. Annual Reports** | NSE Archives | `raw/annual-reports/*.pdf` | Up to 3 recent full annual reports downloaded as PDF. |
| **3. Management Discussion (MDA)** | NSE / Screener | `markdown/MDA_EVIDENCE.md` | Extracted MD&A section from recent annual report/filing. |
| **4. Concall Transcripts** | Screener / Tijori | `raw/concalls/*.pdf` | Up to 3 recent earnings conference call transcripts. |
| **5. Technical Chart Snapshot** | TradingView | `screenshots/tradingview-1d-chart.png` | 1D technical chart screenshot with candle & volume data. |
| **6. Shareholding Pattern** | NSE NextAPI | `raw/nse-shareholding.json` | Promoter, DII, FII, and public holding breakdown. |

---

## ⚖️ Source Precedence & Reconciliation Rules

When conflicting metric values exist across multiple sources, the pipeline enforces strict **Source Precedence Rules** (`src/lib/source-precedence.ts`):

```text
1. Regulatory Filings / NSE Official NextAPI (Authoritative for Shareholding, Corporate Actions, Master Security)
2. Screener.in (Authoritative for Fundamental Financial Ratios, 10-Yr Historical Financial Statements)
3. Tijori Finance (Authoritative for Product Breakdown, Sector Operational Metrics)
4. TradingView (Authoritative for Technical Price Structure & Chart Screenshots ONLY)
```

> [!WARNING]
> **TradingView Restriction Rule**: TradingView page text is **never** used to infer fundamental financial metrics (e.g. Market Cap or PE ratio). It is restricted exclusively to technical price structure and screenshot capture.

---

## 🔍 Canonical Facts Engine (`CANONICAL_FACTS.json`)

The canonical facts engine (`src/lib/canonical-extract.ts` & `src/lib/canonical-financials.ts`) parses raw JSON and MarkItDown markdown into strongly typed canonical records:

```typescript
export interface CanonicalValue {
  id: string;
  evidenceRole: 'source_fact' | 'calculated_metric';
  field: string;
  value: number | string | boolean | null;
  unit: string | null;
  period: string | null;
  source: string;
  sourceArtifact?: string;
  method: 'source_extraction' | 'deterministic_calculation';
  verified: boolean;
  asOf: string | null;
  evidencePath: string | null;
  sourceUrl: string | null;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}
```

Key extracted canonical facts include:
- `market_cap` (in Cr INR)
- `pe_ratio`, `pb_ratio`
- `roce_percent`, `roe_percent`
- `debt_to_equity`
- `revenue_ttm`, `ebitda_ttm`, `pat_ttm`
- `promoter_holding_percent`, `fii_holding_percent`, `dii_holding_percent`

---

## 🛑 Analysis Readiness Gate (`analysis-readiness.json`)

Before an LLM analysis prompt is generated, the pipeline executes `writeAnalysisReadiness()` (`src/lib/analysis-readiness.ts`).

### Readiness Criteria
The readiness gate evaluates coverage across four weighted categories:

1. **Financial Completeness (35%)**: Screener P&L, balance sheet, and market cap present.
2. **Filings & Concalls (25%)**: At least 1 annual report and 1 concall transcript acquired.
3. **Technical Evidence (20%)**: TradingView 1D chart screenshot captured and verified.
4. **Shareholding & Context (20%)**: Shareholding pattern and NSE quote present.

### Decision Gate Output
```json
{
  "schema_version": "1.0",
  "symbol": "RELIANCE",
  "overallScore": 92.5,
  "isReadyForAnalysis": true,
  "missingMandatoryPacks": [],
  "warnings": [],
  "evaluatedAt": "2026-09-22T22:00:00.000Z"
}
```

If `isReadyForAnalysis` is `false`, the pipeline flags specific `missingMandatoryPacks` in `manifest.json` and halts before wasting LLM tokens.

---

## 🏷️ Data Gap & Warning Taxonomy

Data gaps and warnings are tracked in `manifest.json` under standardized categories:

| Category | Example Gap String | Cause / Impact |
| :--- | :--- | :--- |
| `NO_CONCALLS` | `"No concall transcripts found on Screener or Tijori"` | Company does not conduct quarterly earnings calls. |
| `NO_ANNUAL_REPORT` | `"NSE annual report PDF download timed out"` | Fallback to Screener annual report link. |
| `TRADINGVIEW_BLOCKED` | `"TradingView chart element failed to render in 45s"` | Soft warning; technical chart marked partial. |
| `MISSING_MDA` | `"MDA section could not be parsed from annual report PDF"` | MD&A fallback text generated from financial notes. |
