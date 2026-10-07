# v1.40 — Chartink No-Results Reliability

When Chartink shows an empty scanner table and one bounded Run Scan attempt still yields zero rows, the adapter records `no_results` and moves on. It does not attempt disabled CSV/Copy controls.

Example diagnostic:

```text
CHARTINK/RESULTS: Scanner table empty; clicking Run Scan
CHARTINK/RESULTS: Run Scan completed with no visible results; moving to next strategy
CHARTINK/STRATEGY_04: resultStatus=no_results
```
