# NSE NextApi Reusable Guide — v1.45

## Endpoint families

### Identity
- `getSymbolName`
- `getMetaData`

### Market
- `getSymbolData`
- `getYearwiseData`
- `getSymbolChartData`

### Financials
- `getFinancialResultData`
- `getFinancialStatus`

### Corporate
- `getCorporateAnnouncementSubject`
- `getCorporateAnnouncement`
- `getCorpBoardMeeting`
- `getCorpAction`
- `getCorpEventCalender`

### Reports / compliance
- `getCorpAnnualReport`
- `getCorpBrsr`

### Ownership
- `getShareholdingPattern`

### Peers
- `getPeerComparisonQuaters`
- `getPeerComparisonData`

## Reuse pattern

1. Resolve/validate a symbol from the official NSE equity security master.
2. Call identity endpoints to determine company, ISIN, active series and market type.
3. Resolve the canonical identifier (for example `ITCEQN`).
4. Fetch the market, performance and 1D chart endpoints.
5. Fetch corporate, financial, ownership, annual-report and peer endpoints.
6. Preserve raw JSON unchanged.
7. Normalize into deterministic DTOs.
8. Attach source artifact ID, URL, retrieval time and `asOf` where available.

## Datewise storage

Individual research is disposable:

```text
research/<SYMBOL>/
  raw/nse-api/nextapi/
  normalized/
  markdown/
  screenshots/
```

For historical snapshots, preserve a date-index file:

```text
research/<SYMBOL>/snapshots/YYYY-MM-DD/nse-api-index.json
```

The index should reference raw artifacts rather than copy their contents.

## Evidence rules

- A missing optional endpoint is not a fabricated fact.
- Source values remain `source_extraction`.
- Calculated values remain `deterministic_calculation`.
- Never infer a financial value from a screenshot.
- Store both `retrievedAt` and source `asOf` where the source supplies it.
