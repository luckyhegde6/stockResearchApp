# Stock Research Pipeline v1.29

## TradingView screenshot diagnostics

v1.29 clarifies the difference between URL generation tests and actual TradingView acquisition. `test:tradingview-url` does not create screenshots. Use `research:tradingview -- ITC` or the new `tradingview-doctor -- ITC` command to run the adapter.

The adapter now records an open-chart debug state and a failure screenshot if Supercharts acquisition fails. The TradingView instrument is generated dynamically from the ticker; ITC resolves to `https://in.tradingview.com/chart/?symbol=NSE%3AITC`.

## Commands

```cmd
npm run test:tradingview-url
npm run tradingview-doctor -- ITC
npm run research:tradingview -- ITC
npm run research -- ITC
```
