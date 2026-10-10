# NSE Historical Data Chunking

The NSE historical endpoint may return only a bounded recent period even when a longer date interval is supplied. v1.12 therefore splits a three-year request into small overlapping windows.

## Configuration

Environment variables:

```cmd
set NSE_HISTORICAL_CHUNK_DAYS=85
set NSE_HISTORICAL_OVERLAP_DAYS=2
```

The defaults are intentionally below a typical three-month server-side window.

## Stored evidence

```text
research/<TICKER>/raw/nse-api/
  historical-3y.json
  historical-normalized.json
  historical-validation.json
  historical-chunks/
    historical-01.json
    historical-02.json
    ...
```

`historical-3y.json` preserves every raw returned row and chunk metadata. `historical-normalized.json` contains only `EQ` records, merged and deduplicated by symbol/series/date.

## Validation

Coverage is calculated from the earliest to latest successfully acquired trading-date span relative to the requested calendar-date span. A coverage ratio below `0.90` is reported as a warning. The pipeline does not invent missing rows.
