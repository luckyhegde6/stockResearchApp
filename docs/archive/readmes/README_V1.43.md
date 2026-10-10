# Stock Research Pipeline v1.43

This release makes NSE `GetQuoteApi` the canonical individual-stock instrument source and enriches the stock evidence package with instrument metadata, full market/sector/index information, yearwise performance and 1D chart data.

## Canonical request sequence

For `ITC`:

```text
getSymbolName(symbol=ITC)
getMetaData(symbol=ITC)
getSymbolData(marketType=N, series=EQ, symbol=ITC)
  ↓ resolves identifier ITCEQN
getYearwiseData(symbol=ITCEQN)
getSymbolChartData(symbol=ITCEQN, days=1D)
```

## Outputs

```text
research/ITC/raw/nse-api/
├── symbol-name.json
├── symbol-name-normalized.json
├── symbol-metadata.json
├── symbol-metadata-normalized.json
├── quote-nextapi.json
├── quote-normalized.json
├── symbol-data-normalized.json
├── quote-facts.json
├── yearwise.json
├── yearwise-normalized.json
├── symbol-chart-1d.json
├── symbol-chart-1d-normalized.json
└── nextapi-normalized.json
```

## Individual evidence

The normalized stock package now includes:

- live market facts from `GetQuoteApi`
- sector/macro/industry and primary/full index membership
- 52-week high/low
- yearwise stock-vs-benchmark performance
- 1D NSE chart points

## Testing

```cmd
npm run test:nse-nextapi
npm run version:check
npm run test:nse-market-transformers
npm run test:nse-52week-high
npm run test:chartink-scan-registry
```

## Analysis boundary

`npm run analyze -- ITC` remains the single end-to-end command. All acquisition and normalization steps remain deterministic; only the final reasoning stage invokes the LLM after evidence preparation and readiness checks.
