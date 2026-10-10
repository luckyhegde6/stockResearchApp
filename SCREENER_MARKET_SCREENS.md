# Screener Market-Wide Screens — v1.18

This module captures the user-specified public Screener screens into a separate market-wide evidence tree. It is intentionally not part of a single ticker's normal research folder unless `--with-market-screens` is supplied.

Configured screens:

- Golden Crossover — technical
- RSI - Oversold Stocks — technical
- Quarterly Growers — results
- All Latest QTR Results [Date Wise] — results
- The Bull Cartel — results

## Commands

```cmd
npm run research:screener-screens
```

or:

```cmd
npm run screener-screens
```

To collect them as part of a ticker research run:

```cmd
npm run research -- RELIANCE --with-market-screens
```

## Output

```text
research/market-screens/screener/
├── index.json
├── debug/
├── technical/
│   ├── golden-crossover/
│   │   ├── page JSON snapshots
│   │   ├── results.json
│   │   ├── metadata.json
│   │   ├── page.json
│   │   └── screen.png
│   └── rsi-oversold-stocks/
└── results/
    ├── quarterly-growers/
    ├── all-latest-qtr-results-date-wise/
    └── the-bull-cartel/
```

## Export-first behavior

The adapter opens each screen with Playwright, captures the screen description/query/result count, then uses the visible **Export** control and saves the downloaded CSV. The CSV is the preferred full-result evidence. If Export cannot be downloaded, the adapter records the reason and uses the visible HTML table only as a fallback/audit artifact.

Screener's own support documentation states that Export downloads a CSV with all columns and all results, and also notes that Export is a premium feature. Therefore a logged-in/premium Playwright storage state can be supplied with `SCREENER_STORAGE_STATE` when required.

The adapter never treats an HTML first-page table as equivalent to a successful full export without recording `sourceMode=html-table-fallback`.
