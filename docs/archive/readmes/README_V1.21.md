# v1.21 — Chartink Copy Workflow + Stable Page Lifecycle

The v1.21 release fixes the two major issues observed in v1.20:

1. Chartink strategies reported `stocks=0` even when the UI displayed results.
2. After a few strategies, the shared Chartink page was closing, causing later strategies and search discovery to fail.

## Main change
The Chartink collector now uses the public UI workflow:

`Copy` → `Table` → `OK` → browser clipboard → deterministic table parser

and also attempts the public `CSV` button as an additional captured artifact.

The UI copy and CSV workflow does not require the premium Screener-style export mechanism.

## Commands

```cmd
npm install
npm run research:chartink -- RELIANCE
```

or as part of a full run:

```cmd
npm run research -- RELIANCE
```

## Expected debug checkpoints

```text
CHARTINK/STRATEGY_01
CHARTINK/COPY
CHARTINK/STRATEGY_02
...
CHARTINK/SEARCH
CHARTINK/CATEGORY/LONG
CHARTINK/CATEGORY/SHORT
CHARTINK/CATEGORY/INTRADAY
CHARTINK/CATEGORY/SWING
CHARTINK/VALIDATION
```

For each strategy, inspect:

- `copyCaptured`
- `csvCaptured`
- `visibleRows`
- `resultSource`
- `stocks`

A successful result should no longer depend on `/screener/process` returning a particular JSON shape.
