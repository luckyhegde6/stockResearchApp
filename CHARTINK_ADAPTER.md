# Chartink adapter

## Purpose

The Chartink adapter deterministically captures configured public strategies and their current matched stocks. It does not use an LLM.

## Acquisition order

1. Open the strategy page with Playwright.
2. Capture the page's `/screener/process` XHR response when available. This is the same data-loading endpoint used by the Chartink UI.
3. If the XHR is not observed, read the page's CSRF token and scan clause and POST to `/screener/process` from the same browser context.
4. Attempt the visible CSV button as an additional audit/export artifact.
5. Normalize rows into stock objects and aggregate them into Long, Short, Intraday and Swing baskets.
6. Capture the swing strategy search catalog for discovery/audit.

## Files

`raw/chartink/strategies.json` — configured strategies, scan clauses and current results.
`raw/chartink/chartink-summary.json` — acquisition summary.
`raw/chartink/stocks-long.json`
`raw/chartink/stocks-short.json`
`raw/chartink/stocks-intraday.json`
`raw/chartink/stocks-swing.json`
`raw/chartink/csv/` — CSV exports when the UI exposes a working CSV download.

## Important

Chartink scan results can be delayed depending on the site's data availability. The adapter records the acquisition timestamp and source URL. A matched stock is a screening signal only; downstream analysis must not treat it as a recommendation.


## Category mapping used by the application

- Long: bullish/uptrend/long-bias scans such as Ichimoku uptrend, 200 EMA, bullish moving-average and FNO bullish scans.
- Short: bearish scans such as closing below Supertrend.
- Intraday: scans explicitly oriented to intraday/morning/futures activity.
- Swing: swing, breakout, BTST and daily/weekly crossover scans.

The mapping is configuration-driven in `config/chartink-scans.json` so it can be changed without changing extraction code.

## Target ticker membership

For a per-stock research run, the adapter records whether the requested ticker is present in each category and the strategy names that matched it. This is included in `evidence-contract.json` as source-derived screening evidence.
