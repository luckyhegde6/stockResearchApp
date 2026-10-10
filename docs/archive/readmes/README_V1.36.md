# Stock Research Pipeline — v1.36

## NSE Securities Master + 52-Week High + Hardened Market Scans

v1.36 establishes the long-lived market-scan layer separately from the short-lived `research/<TICKER>/` evidence package.

### Long-lived market data

```text
scans/
├── Fundamental-DD-MM-YYYY/
├── Candlestick-DD-MM-YYYY/
├── Range-Breakouts-DD-MM-YYYY/
├── Bullish-DD-MM-YYYY/
├── Bearish-DD-MM-YYYY/
├── Intraday-DD-MM-YYYY/
└── 52-Week-High-DD-MM-YYYY/
```

### Short-lived individual research

```text
research/<TICKER>/
```

The `research` directory can be wiped and rebuilt. The `scans` directory is designed to be retained as a dated scan history.

## Commands

### NSE securities master

```cmd
npm run nse:securities
npm run nse:lookup -- ITC
npm run nse:validate-symbol -- ITC
npm run refresh:nse-securities
```

### NSE 52-week highs

```cmd
npm run nse:52week-high
```

The adapter uses the NSE page and API endpoint supplied for this project:

```text
https://www.nseindia.com/market-data/52-week-high-equity-market
https://www.nseindia.com/api/live-analysis-data-52weekhighstock
```

### Chartink market scans

Run one scan family:

```cmd
npm run chartink:scans -- fundamental
npm run chartink:scans -- candlestick
npm run chartink:scans -- range-breakouts
npm run chartink:scans -- bullish
npm run chartink:scans -- bearish
npm run chartink:scans -- intraday
```

Run all six families:

```cmd
npm run chartink:scans -- all
```

Disable TradingView evidence capture for a fast scan-only run:

```cmd
npm run chartink:scans -- all --no-charts
```

### Existing consensus top-20 commands

```cmd
npm run chartink:top20 -- swing
npm run chartink:top20 -- long
npm run chartink:top20 -- short
```

## Acquisition policy

Chartink order:

1. CSV button / real browser download.
2. Copy → Table → OK fallback.
3. Visible table fallback.

No Chartink login automation is used.

TradingView screenshots are captured only after the scan data has been acquired, and are stored in the dated scan directory rather than under `research/<TICKER>/`.

## Evidence policy

Every scan retains:

- raw page snapshot metadata
- detected scan condition/`scan_clause` when available
- CSV when downloaded
- copied table text when used
- normalized rows
- page screenshot
- deduplicated market universe
- optional TradingView 1D/5Y/All screenshots

The scan layer is deterministic. `llmUsed=false` is recorded in generated metadata.
