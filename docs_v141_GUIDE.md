# v1.41 Guide

## End-to-end
`npm run analyze -- TICKER` runs deterministic acquisition, individual-stock normalization, quality checks, MarkItDown ingestion, canonical evidence pack generation, readiness validation, and only then the final LLM analysis.

## Direct diagnostics
- `npm run stock:evidence -- TICKER`
- `npm run evidence:quality -- TICKER`
- `npm run test:evidence-completeness -- TICKER`
- `npm run evidence:pack -- TICKER`

## Canonical evidence
`research/TICKER/normalized/analysis-inputs.json` is the compact hand-off. It contains identity, market, fundamentals, period-aware financials, valuation, ownership, technicals, screening, catalysts, canonical facts, calculated metrics, reconciliation, quality and source health.

## Accuracy rules
- Never replace a missing value with an inference.
- Preserve as-of periods.
- Numeric technical indicators are deterministic calculations from NSE historical data.
- TradingView screenshots provide visual evidence only.
- Chartink scans are point-in-time screen evidence, not recommendations.
