# v1.25.1 — TradingView Full-Chart Capture + Tijori Runtime Fix

## TradingView

For a ticker such as RELIANCE the adapter now uses:

`https://in.tradingview.com/chart/?symbol=NSE%3ARELIANCE`

For each run it captures:

- `tradingview-fullchart-5y.png`
- `tradingview-fullchart-all.png`

The adapter attempts to select the Candles/Candlestick chart type and then selects `5Y` and `All`. Each action is recorded in the matching JSON metadata file. The screenshots are visual evidence; no numbers are fabricated from pixels.

The existing visible-text technicals page and deterministic NSE-derived technical metrics remain separate.

## Chartink

Chartink remains enabled. Market-wide strategy files remain under `research/chartink/strategies/` and target membership remains under `research/<TICKER>/raw/chartink/`.

## Tijori

The market adapter no longer calls `page.goto('')` during same-page capture. Quarterly results remain on one live page while `Show More` is clicked and content growth is verified. The loop is bounded and cannot repeatedly reload the same URL.

## Tests

Recommended:

```cmd
npm install
npm run research:tradingview -- RELIANCE
npm run research:chartink -- RELIANCE
npm run research:tijori-market
```

## Why 1.25.1

The quarterly-results collector now supplements DOM table parsing with body-text block parsing because the public Tijori page renders company result cards as text blocks. This avoids the previous `rows=0` false result. Same-page capture never navigates to an empty URL.
