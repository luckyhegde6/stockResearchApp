# v1.32

BSE is ignored by policy. The production source set is NSE, Screener, Tijori, TradingView and Chartink.

```cmd
npm install
npm run test:nse-market-transformers
npm run test:tradingview-url
npm run research -- ITC
npm run prepare:analysis -- ITC
npm run analyze -- ITC
```

`prepare:analysis` is self-healing when a ticker manifest does not yet exist. No LLM is called during acquisition, normalization, ingestion, reconciliation or readiness.
