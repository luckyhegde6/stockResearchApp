# Stock Research Pipeline Testing & Quality Assurance Guide

This guide details the **Testing & Quality Assurance Framework** of the **Stock Research Pipeline** (v1.49.5), outlining test execution, diagnostic CLIs, data quality validation, and scan metrics scoring.

---

## 🧪 Unified Test Runner

The project contains a comprehensive set of test scripts in `scripts/`. To execute all test suites sequentially using the unified test runner:

```powershell
# Run the complete test suite
npm run test:all

# Alternatively run using tsx directly
npx tsx scripts/test-all.ts
```

### Test Suite Summary

| Test Script | Tested Subsystem | Key Verifications |
| :--- | :--- | :--- |
| `test-nse-nextapi.ts` | NSE NextAPI Client | Cookie acquisition, endpoints, historical chunking. |
| `test-tradingview-ui-surfaces.ts` | TradingView Adapter | Symbol URL routing, 1D chart capture, technical summaries. |
| `test-individual-stock-evidence.ts` | Evidence Engine | Canonical facts extraction, metric precedence, research score. |
| `test-evidence-completeness.ts` | Evidence Contract | Mandatory pack presence, data gap taxonomy, readiness gate. |
| `test-market-scan-quality.ts` | Scan Quality Engine | Chartink scan output completeness, row counts, null metrics. |
| `test-analysis-readiness.ts` | Readiness Gate | Decision gate rules, missing pack reporting, threshold scores. |
| `test-nse-securities.ts` | Security Master | Symbol input normalization, `EQUITY_L` lookup, series checks. |
| `test-news-sentiment.ts` | News Sentiment Adapter | Headline extractions, sentiment scoring, polarity bounds. |

---

## 🩺 System Diagnostic Tools

Before running live research, verify pipeline dependencies using the diagnostic tools:

### 1. Playwright CLI Doctor (`npm run playwright:doctor`)
Validates that `playwright-cli` is installed, Chromium browser binaries are available, and browser session spawn works:
```powershell
npm run playwright:doctor
```

### 2. MarkItDown Doctor (`npm run markitdown:doctor`)
Validates that Python virtual environment `.venv` and Microsoft MarkItDown (`markitdown[all]`) executable are accessible:
```powershell
npm run markitdown:doctor
```

### 3. TradingView Doctor (`npm run tradingview-doctor`)
Performs a dry-run check of TradingView browser navigation, chart rendering latency, and screenshot capture:
```powershell
npm run tradingview-doctor
```

### 4. Source Doctor (`npm run source:doctor`)
Diagnoses network connectivity, latency, and HTTP status codes across all 12 data source providers.
```powershell
npm run source:doctor
```

---

## 📈 Quality Metrics & Scoring Systems

### 1. Evidence Quality Scoring (`src/lib/evidence-quality.ts`)
Evaluates evidence quality per stock run (0 to 100% score) based on:
- **Completeness**: Ratio of acquired artifacts to requested sources.
- **Freshness**: Age of financial statement files (annual report within 12 months, concalls within 90 days).
- **Depth**: Presence of both quantitative tables and MD&A qualitative text.

### 2. Market Scan Quality (`src/lib/market-scan-quality.ts`)
Evaluates long-lived Chartink and NSE market scans based on:
- **Scan Coverage**: Total stocks passing technical filters.
- **Data Integrity**: Percentage of non-null OHLCV, volume, and percentage gain fields.
- **Duplicate Prevention**: Verification of unique symbol keys per scan date.
