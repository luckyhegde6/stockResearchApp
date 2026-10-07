# v1.23 — Public UI Extraction + Chart Capture

## Chartink
- Primary strategy capture: Copy → Table → wait for “All pages table data copied successfully” → OK.
- Clipboard capture is instrumented at page initialization and polled after the confirmation.
- CSV is captured only when a real non-empty download/network response is written to disk.
- Each strategy gets a fresh page; one failed strategy cannot close the shared browser context.
- Strategy definitions/results are stored under `research/chartink/strategies/`.
- Market-wide category baskets are stored under `research/market-screens/chartink/`.
- Per-ticker membership is stored under `research/<TICKER>/raw/chartink/`.

## Tijori
- Quarterly results use a persistent page and dynamic Show More/Load More detection; the same URL is never reloaded after a successful load-more click.
- Quarterly cards use broader DOM detection plus table fallback.
- Upcoming results use dynamic load-more detection.
- Ideas Dashboard is used for market/sector intelligence (`/ideas-dashboard/`).
- Zero-row datasets are never reported as complete.

## TradingView
- Direct chart URL: `https://in.tradingview.com/chart/?symbol=NSE%3A<TICKER>`.
- Automation clicks **Full chart** then captures both **5Y** and **All** by default.
- Screenshots are viewport chart evidence after the requested zoom selection.
- State metadata records whether `Full chart` and the range button were actually clicked.
- Structured Technicals page remains a separate capture.

## Commands

```cmd
npm install
npm run research:chartink -- RELIANCE
npm run research:tijori-market
npm run research:tradingview -- RELIANCE
npm run research -- RELIANCE
```

Environment knobs:

```text
CHARTINK_COPY_WAIT_MS=7000
CHARTINK_PAGE_TIMEOUT_MS=60000
TRADINGVIEW_CHART_RANGES=5Y,All
TIJORI_QUARTERLY_MAX_ITERATIONS=100
TIJORI_MARKET_MAX_ITERATIONS=30
```

No LLM is used by these acquisition/normalization steps.
