# Operations & Troubleshooting

## Health check

```bash
npm run sheets:doctor
```

Expected:

```text
ok: true
service: stock-research-sheet-sink
serviceVersion: 2
spreadsheetIdMatches: true
```

## Research export

```bash
npm run sheets:export -- research HDFCBANK
```

## End-to-end acceptance

Inspect an existing local research run without acquiring new data or publishing:

```bash
npm run acceptance:e2e -- RELIANCE
```

Run a fresh acquisition (this replaces `research/SYMBOL`; the runner requires explicit acknowledgement when that directory already exists):

```bash
npm run acceptance:e2e -- RELIANCE --acquire
```

Run acquisition plus model analysis only when explicitly requested; analysis includes a fresh acquisition and requires a configured model provider:

```bash
npm run acceptance:e2e -- RELIANCE --analysis
```

Publish research and any current analysis artifact to the configured workbook, requiring per-image receiver-confirmed insertion:

```bash
npm run acceptance:e2e -- RELIANCE --publish
```

After the command returns the workbook URL, open it and visually inspect the screenshot rows. Only after confirming images are visible should you mark the operator check:

```bash
npm run acceptance:e2e -- RELIANCE --confirm-visible
```

`--confirm-visible` is a separate invocation that consumes the pending report created by the previous `--publish` run; it does not republish. Do not run another acquisition/export between visual inspection and confirmation. The flag is an operator attestation, not an automated browser check. The acceptance runner disables automatic publishing for its pipeline subprocesses and performs explicit publishing only with `--publish`. It never places trades.

## Test suite

```bash
npm run version:check
npm run typecheck
npm run test:all
```

## Screenshot failures

### Error: Blob too large

Cause: old Apps Script deployment or invalid payload.

Fix:

1. redeploy current `Code.gs`
2. confirm service version 2
3. run doctor
4. rerun export

### Error: pixel limit exceeded

The receiver rejects images over 1,000,000 pixels.

The exporter should normally resize to ≤900,000 pixels.

If this occurs, inspect the screenshot metadata in the exported row.

### Status says pending while embedding says embedded

This indicates an old receiver or an inconsistent previous export.

The current receiver synchronizes all three status fields.

Redeploy Apps Script and generate a fresh run.

### Evidence section is empty

Check whether:

`normalized/analysis-evidence-pack.json`

exists.

If it does not, the exporter can fall back to:

`normalized/canonical-values.json`

for deterministic facts and calculated metrics.

If both are empty, the sheet should remain explicit about the missing evidence rather than fabricating rows.

### Analysis says NOT_READY

Do not bypass the readiness gate merely to make the workbook look complete.

Inspect:

- missing required artifacts
- source warnings
- unresolved conflicts
- data freshness
- acquisition failures

## Local-path leakage

Published rows must never expose local paths.

The sanitizer handles path-valued fields and paths embedded in strings/serialized data.

If a path appears in the workbook, treat it as a publishing bug and add a regression test before changing the sanitizer.

## Deployment rule

GitHub source and Apps Script deployment are separate.

After changing `Code.gs`:

1. deploy a new Web App version
2. run doctor
3. export a new run
4. inspect the workbook

## Recovery philosophy

The local research artifact is the source of truth.

If Google Sheets fails:

- keep the local artifact
- keep the command report
- fix the publishing layer
- retry the export

Do not rerun acquisition unnecessarily just because publication failed.
