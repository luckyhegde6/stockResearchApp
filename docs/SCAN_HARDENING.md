# Scan Hardening Contract

## Source truth

The configured URL/name/category registry is version-controlled in:

```text
src/lib/chartink-scan-registry.ts
config/chartink-market-scans.json
```

The registry currently contains 104 supplied Chartink entries across six scan families.

## Failure containment

- Each scan uses a fresh Playwright page.
- A failed CSV download does not terminate the run.
- Copy is only attempted after CSV failure/unavailability.
- One failed strategy does not abort subsequent strategies.
- A failed TradingView screenshot does not corrupt the scan CSV/JSON dataset.
- The scan run records failures in `debug/` and `index.json`.

## Provenance

Every normalized row retains the strategy name, strategy slug, scan type and raw row fields.

## Dedupe

Dedupe is by canonical NSE symbol after upper-casing and whitespace normalization. A deduplicated stock retains the list of source scans in which it appeared.

## Long-lived vs short-lived

```text
scans/       = dated market archive
research/    = disposable individual-stock evidence
```

Never write a full market scan into `research/<TICKER>/`.
