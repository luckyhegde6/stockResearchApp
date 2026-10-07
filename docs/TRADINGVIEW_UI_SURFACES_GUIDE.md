# TradingView Public UI Surface Guide

## Default
`TRADINGVIEW_UI_SURFACES=forecast,news,documents,seasonals,community`

## Standalone
`npm run tradingview:ui -- ITC`

## Full stock research
`npm run analyze -- ITC`

The standard analysis command runs the direct public symbol-page surface capture automatically.

## Outputs
- `raw/tradingview/ui-surfaces.json` — run summary
- `raw/tradingview/ui-forecast.json`
- `raw/tradingview/ui-news.json`
- `raw/tradingview/ui-documents.json`
- `raw/tradingview/ui-seasonals.json`
- `raw/tradingview/ui-community.json`
- `screenshots/tradingview-forecast.png`
- `screenshots/tradingview-news.png`
- `screenshots/tradingview-documents.png`
- `screenshots/tradingview-seasonals.png`
- `screenshots/tradingview-community.png`

## Capture method

Surface URLs are built centrally by `src/lib/tradingview-url.ts`; the adapter does not click the Metrics/More launcher.

## Evidence rule
Use structured sources for numeric facts. Use these screenshots for context, visible labels, forecast displays, document listings, news surface, seasonality, community context, and later multimodal analysis.
