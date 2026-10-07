# Stock Research Pipeline — v1.37

## Market Scan Quality & Individual Stock Evidence

v1.37 freezes the market acquisition layer and strengthens the deterministic evidence boundary for individual stock analysis.

### Market scans

`scans/` is long-lived and date-stamped. It contains Chartink scan families, NSE 52-week-high snapshots and optional TradingView visual evidence. `research/<TICKER>/` remains disposable.

### Quality rules

- A scan with zero normalized rows is not `ok`.
- CSV success requires a real non-empty downloaded file.
- Chartink classification is driven by the registry, not scan-name inference.
- TradingView screenshots are visual evidence; a candlestick claim is only verified when the control selection is confirmed.
- NSE `EQUITY_L.csv` is the security identity master.

### Individual stock evidence

`npm run analyze -- ITC` remains the single end-to-end command. Internally it runs deterministic acquisition, canonicalization, reconciliation, MarkItDown ingestion, readiness, and only then the LLM.

The canonical individual package is:

```text
research/ITC/normalized/
├── identity.json
├── market.json
├── financials.json
├── ownership.json
├── technicals.json
├── screening.json
├── catalysts.json
├── canonical-values.json
├── reconciliation.json
├── individual-stock-evidence.json
└── analysis-inputs.json
```

### Commands

```cmd
npm run scan:quality
npm run stock:evidence -- ITC
npm run stock:reconcile -- ITC
npm run test:market-scan-quality
npm run test:individual-stock-evidence -- ITC
```

### Source precedence

- Identity / ISIN / series: NSE securities master.
- Current exchange data: NSE.
- Historical OHLCV: NSE.
- Numeric technical calculations: deterministic NSE history.
- Financial statements: NSE filings with Screener/Tijori cross-checks.
- Ownership: NSE shareholding.
- Visual chart confirmation: TradingView.
- Scanner membership: Chartink.

### LLM boundary

The LLM receives the compact `analysis-inputs.json`, evidence contract, quality reports and MarkItDown documents. It does not perform source acquisition or primary fact extraction.
