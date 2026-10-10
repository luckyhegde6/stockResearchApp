# Walkthrough — Individual Stock Research

The ticker workflow remains short-lived and can be wiped/rebuilt.

```text
npm run analyze -- ITC
```

Internally:

```text
input
 ↓
NSE EQUITY_L validation
 ↓
NSE + Screener + Tijori + TradingView + Chartink
 ↓
normalization
 ↓
MarkItDown
 ↓
evidence contract
 ↓
readiness gate
 ↓
LLM only after deterministic preparation
```

The market scan archive is not overwritten by individual research.

Ticker-specific Chartink evidence is limited to membership/provenance under `research/<TICKER>/raw/chartink/`; long-lived scan universes live under `scans/`.
