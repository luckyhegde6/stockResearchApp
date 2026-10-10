# v1.30 — Deterministic Analysis Boundary + TradingView Diagnostics

## Purpose

v1.30 stabilizes the transition from acquisition to final reasoning. It also fixes two concrete regressions found in the ITC run:

1. `tradingview-doctor` no longer erases an existing `research/<TICKER>` directory.
2. `prepare-analysis` and `research` now create/refresh the evidence bundle before the readiness gate is evaluated.
3. Chartink CSV capture no longer calls `.catch()` on Playwright's synchronous `download.suggestedFilename()` return value.
4. MarkItDown ingestion includes CSV files.
5. TradingView captures record screenshot existence/byte size and save detailed state before/after candlestick/range selection.
6. `analysis-readiness.json` requires non-empty required files.
7. `analyze` can deterministically prepare the evidence package if readiness is missing, but it still refuses to invoke the LLM while readiness is false.

## Test order

```cmd
npm install
npm run test:tradingview-capture
npm run tradingview-doctor -- ITC
npm run research -- ITC
npm run prepare:analysis -- ITC
npm run analyze -- ITC
```

`research -- ITC` owns reset/reacquire semantics.
`tradingview-doctor -- ITC` is additive and must preserve the ticker evidence directory.

## TradingView debug files

```text
research\\ITC\\raw\\tradingview\\debug-state-open-chart.json
research\\ITC\\raw\\tradingview\\debug-5y-before.json
research\\ITC\\raw\\tradingview\\debug-5y-after-candles.json
research\\ITC\\raw\\tradingview\\debug-5y-after-range.json
research\\ITC\\raw\\tradingview\\debug-all-before.json
research\\ITC\\raw\\tradingview\\debug-all-after-candles.json
research\\ITC\\raw\\tradingview\\debug-all-after-range.json
```

Screenshots:

```text
research\\ITC\\screenshots\\tradingview-1d.png
research\\ITC\\screenshots\\tradingview-fullchart-5y.png
research\\ITC\\screenshots\\tradingview-fullchart-all.png
research\\ITC\\screenshots\\tradingview-technicals.png
```

## Analysis boundary

The LLM should only run when `analysis-readiness.json` reports `ready=true`.
Acquisition, normalization, MarkItDown conversion, evidence contract creation, bundle creation and readiness evaluation remain deterministic.
