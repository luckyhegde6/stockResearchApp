# Market Analysis Walkthrough — v1.37

1. Refresh/verify `data/EQUITY_L.csv`.
2. Run Chartink families into dated `scans/<Type-DD-MM-YYYY>/`.
3. Run NSE 52-week-high snapshot.
4. Run `npm run scan:quality`.
5. Use the generated deduped/top20 datasets as market-level inputs later.
6. Do not put market-wide rows in `research/<TICKER>/`.
7. Individual stock `analyze` consumes only the target ticker evidence plus already-acquired market context.
