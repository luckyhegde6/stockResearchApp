# Stock Research Pipeline v1.38

v1.38 is a deterministic evidence-quality release. Acquisition sources are NSE, Screener, Tijori, TradingView and Chartink. BSE is intentionally excluded from the production evidence path.

## Individual stock

`npm run analyze -- ITC` is the intended one-command workflow:

1. Validate ticker against `data/EQUITY_L.csv`.
2. Acquire NSE, Screener, Tijori, TradingView and Chartink evidence.
3. Normalize technicals and source financial tables.
4. Build individual-stock evidence and financial-period records.
5. Reconcile cross-source numeric values using deterministic source precedence.
6. Ingest supported documents with MarkItDown.
7. Build evidence contract, bundle and analysis inputs.
8. Run readiness gate.
9. Only when ready, invoke the final LLM.

## Market scans

Market-wide scan archives live under `scans/` and are not mixed into `research/<TICKER>/`.

- `npm run chartink:scans -- all`
- `npm run nse:52week-high`
- `npm run scan:quality`

## Regression tests

- `npm run test:nse-securities`
- `npm run test:nse-market-transformers`
- `npm run test:nse-52week-high`
- `npm run test:chartink-scan-registry`
- `npm run test:source-precedence`

## Evidence rules

- Source-derived values retain source, artifact, method and as-of metadata.
- Deterministic indicators are marked as calculated metrics.
- Conflicts are never silently hidden.
- TradingView screenshots are visual evidence, not numeric truth.
- Chartink is screening evidence, not an investment recommendation.
- BSE is not a required or requested source for production analysis.
