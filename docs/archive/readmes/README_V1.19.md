# v1.19 Screener Public Screen Collection — Export Disabled

This release changes the Screener market-wide screen collector so it **never clicks, calls, or depends on the Screener Export control**. Public screen HTML pagination is the only collection path.

Why: on public Screener pages, Export can redirect to a login screen. The collector therefore uses the visible result table across all public pages and stores page-level evidence.

## Collection mode
- Export attempted: **false**
- Source mode: `html-pagination`
- Pagination: `?page=N`
- Login automation: none
- LLM: none

## Output
```text
research/market-screens/screener/
├── index.json
├── technical/<screen>/
│   ├── results.json
│   ├── metadata.json
│   ├── page-01.json
│   ├── screen-page-01.png
│   └── pages/page-01.json ... page-N.json
├── results/<screen>/...
└── debug/
```

## Accuracy checks
For every screen, the collector records:
- declared result count
- page count
- rows captured per page
- deduplicated row count
- row-count delta
- column headers
- query text when publicly displayed

It warns when the deduplicated row count differs from the page's declared total.

## Command
```cmd
npm run research:screener-screens
```

The existing `--with-market-screens` option also uses this export-free collector.
