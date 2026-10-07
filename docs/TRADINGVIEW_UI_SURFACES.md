# TradingView UI Surface Capture

Current Supercharts layout used by the adapter:

`chart → right stock details card → four-square/grid launcher → surface`

The launcher opens categories including Fundamentals, Analysis and Assets. The requested surfaces are selected from that menu.

## Debug files

For each requested surface the adapter creates:

- `raw/tradingview/debug-ui-<surface>-launcher.json` — launcher detection strategy and candidate details.
- `raw/tradingview/ui-<surface>.json` — before/after state, selection state, route/content confirmation and screenshot metadata.
- `screenshots/tradingview-<surface>.png` — visual evidence.

## Important

UI screenshots are visual/audit evidence. Numeric facts must continue to come from structured NSE/TradingView data rather than pixel interpretation.
