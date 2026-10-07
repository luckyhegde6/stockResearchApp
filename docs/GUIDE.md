# Market Scan Guide — v1.36

## Directory contract

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

`research/<TICKER>/` is a disposable individual-stock evidence tree; `scans/` is the long-lived market archive.

## All Chartink scans

There are currently 104 configured Chartink scans:

```text
Fundamental       13
Candlestick       13
Range Breakouts   26
Bullish           13
Bearish           13
Intraday          26
--------------------
Total            104
```

The registry is maintained in `src/lib/chartink-scan-registry.ts` and its generated JSON mirror is `config/chartink-market-scans.json`.

## Acquisition order

1. Open the public scan page with Playwright.
2. Attempt the real CSV download first.
3. If CSV is unavailable, execute Copy → Table → OK.
4. If Copy is unavailable, use the visible table.
5. Save the scan condition/scan clause when exposed.
6. Normalize rows and retain the raw row.
7. Deduplicate by canonical NSE symbol.
8. Capture TradingView screenshots for configured technical scan families.

## Hardening

A failed scan is isolated to its own fresh Playwright page. A download timeout never terminates the entire scan batch. A scan with zero normalized rows is never reported as a normal successful acquisition.

## NSE 52-week high

The raw source is:

```text
https://www.nseindia.com/market-data/52-week-high-equity-market
https://www.nseindia.com/api/live-analysis-data-52weekhighstock
```

The API response is preserved before transformation. Series are retained because the payload can contain EQ, BE, SM, ST and BZ records.
