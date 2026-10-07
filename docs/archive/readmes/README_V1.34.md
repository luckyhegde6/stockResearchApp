# v1.34 — Chartink Top-20 Screening Commands + Analysis Orchestrator Fix

## Single-stock analysis
`npm run analyze -- ITC` remains the end-to-end command. It runs deterministic research and preparation first, then crosses the LLM boundary only after the readiness gate.

## Chartink market screening (separate from ticker research)
These commands do not run NSE/Screener/Tijori/TradingView and do not invoke the LLM. They operate only on the Chartink strategy catalog/results.

### Category top 20
- `npm run chartink:top20 -- swing`
- `npm run chartink:top20 -- long`
- `npm run chartink:top20 -- short`
- `npm run chartink:top20 -- all`

Use `--refresh` to refresh the 19 configured Chartink strategies before ranking:
`npm run chartink:top20 -- swing --refresh`

### Ranking
Within a category, a stock is ranked by deterministic scanner consensus:
1. number of distinct configured strategies matched (higher first)
2. sum of rank positions across matching strategies (lower first)
3. symbol as stable final tie-breaker

### Outputs
`research/chartink/top20/swing.json`
`research/chartink/top20/long.json`
`research/chartink/top20/short.json`
`research/chartink/top20/strategies/*.json`
`research/chartink/top20/index.json`

Each per-strategy file contains its top 20 rows; category files contain the aggregated top 20 by cross-strategy consensus.

## Scope separation
`research/chartink/strategies/` = global strategy definitions/results
`research/market-screens/chartink/` = market-wide category baskets
`research/<TICKER>/raw/chartink/` = ticker-specific membership only

No TradingView or Tijori data is touched by the top-20 commands. No final analysis prompt is executed by these commands.
