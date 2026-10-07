# v1.18 Screener Market-Wide Screens

This release adds a separate deterministic collector for five user-specified Screener.in public screens. The collector does not use the Screener Export workflow. It crawls the public result table across all available `?page=N` pages and validates the collected row count against the declared result count.

Current public Screener pages expose an Export control and a visible result table; Screener's own support documentation states that Export downloads a HTML pagination containing all columns and all results and that Export is a premium feature.

Configured screens:
- Golden Crossover
- RSI - Oversold Stocks
- Quarterly Growers
- All Latest QTR Results [Date Wise]
- The Bull Cartel

Run:
```cmd
npm run research:screener-screens
```

Optional in a ticker research run:
```cmd
npm run research -- RELIANCE --with-market-screens
```

No premium/login session is required:
```cmd
npm run research:screener-screens
```

Each screen is stored under a separate folder:
```text
research/market-screens/screener/technical/golden-crossover/
research/market-screens/screener/technical/rsi-oversold-stocks/
research/market-screens/screener/results/quarterly-growers/
research/market-screens/screener/results/all-latest-qtr-results-date-wise/
research/market-screens/screener/results/the-bull-cartel/
```

`metadata.json` records `sourceMode`, declared result count, total pages, extracted result count, deduplication, and row-count validation. Export is disabled.
