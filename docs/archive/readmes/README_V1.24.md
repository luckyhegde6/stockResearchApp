# v1.24 — Chartink CSV-First Strategy Collector

Run:

```cmd
npm install
npm run research:chartink -- RELIANCE
```

For every strategy, the collector attempts CSV first. If CSV is unavailable or unusable, it falls back to Chartink's Copy → Table → OK workflow.

Useful debug output:

```text
CHARTINK/CSV
  captured=true/false
  bytes=...
  method=download-event|network-response|click-no-capture|error

CHARTINK/COPY
  attempted=true/false
  tableSelected=true/false
  confirmationDetected=true/false
  okClicked=true/false
  clipboardChars=...

CHARTINK/STRATEGY_01
  resultSource=csv-download|ui-copy-table|dom-table|network:/screener/process
  stocks=...
```
