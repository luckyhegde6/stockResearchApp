# End-to-End Research and Publishing Acceptance

## Purpose

This is the acceptance contract for the existing StockResearchApp pipeline. Local research artifacts remain the source of truth. Google Sheets is a distribution/review layer, and a polished workbook must not imply that the research is decision-ready.

## Command modes

Run from a clean checkout after `npm ci`.

| Command | Side effects | Required result |
|---|---|---|
| `npm run acceptance:e2e -- SYMBOL` | Reads an existing run and refreshes deterministic preparation artifacts; no new acquisition or external publish | Reports acquisition artifacts, recomputed evidence quality/readiness, evidence-pack consistency, and analysis freshness |
| `npm run acceptance:e2e -- SYMBOL --acquire` | Runs full acquisition; replaces `research/SYMBOL` only with `--replace-existing` if the directory already exists | Manifest ticker matches, at least one successful source artifact, and preparation/quality/readiness artifacts are produced |
| `npm run acceptance:e2e -- SYMBOL --analysis` | Performs fresh acquisition and invokes the configured model; requires `--replace-existing` when the research directory already exists | Readiness passes before the model call and the current analysis output validates against `analysisSchema` |
| `npm run acceptance:e2e -- SYMBOL --publish` | Writes research and any current schema-valid analysis to the configured Google Sheet | Strict per-image receiver outcomes and aggregate counts agree; every uploaded image is receiver-confirmed inserted |
| `npm run acceptance:e2e -- SYMBOL --confirm-visible` | Updates the pending acceptance report only; does not republish | Operator confirms the images in the exact workbook run are visible; research manifest must not have changed since publishing |

The runner disables automatic publishing in its pipeline subprocesses. A Sheets write occurs only when `--publish` is supplied. `--analysis` explicitly invokes the configured model and performs fresh acquisition. Never use `--replace-existing` before preserving any local artifacts that must be retained.

## Stage-by-stage acceptance

### 1. Acquisition

- `research/SYMBOL/manifest.json` exists and its ticker matches the requested symbol.
- The manifest contains source artifacts and records source status, retrieval time, warnings and data gaps.
- Failed and fallback sources remain visible; a partial acquisition must not be relabelled complete.
- The acceptance runner must not silently reacquire in inspection-only mode.

### 2. Evidence quality and readiness

- Recomputed evidence quality agrees with the persisted report status.
- Recomputed readiness agrees with `analysis-readiness.json`.
- The normalized evidence pack exists, matches the requested ticker, and reports fact/metric/conflict counts.
- Missing evidence, source failures, warnings and conflicts remain explicit. Zero, blank, missing, stale and not-applicable are not interchangeable.
- If deterministic readiness is blocked, the outcome is `RESEARCH_ONLY / NO CALL`; do not invoke the model to force a recommendation.

### 3. Analysis

- Analysis is optional and must be explicitly requested.
- The analysis timestamp must not predate the current research manifest.
- The analysis JSON must validate against the repository's `analysisSchema`; presence of a JSON file or a recommendation-shaped field is not sufficient.
- The analysis stage must fail when readiness is blocked, the model call fails, or schema validation fails.
- The existing bounded-reasoning feature remains opt-in and fail-closed. Intermediate model output never replaces primary evidence.

### 4. Google Sheets publishing

- Configure `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_TOKEN`, and the expected `GOOGLE_SHEETS_ID` locally; do not commit credentials.
- Deploy the current `integrations/google-sheets/Code.gs` as a new Web App version. `npm run sheets:doctor` must report `ok: true`, `service: stock-research-sheet-sink`, `serviceVersion: 3`, and a matching workbook ID.
- The exporter must reject HTTP errors, HTML responses, invalid JSON and `ok: false` sink responses even when the HTTP status is 200.
- Preserve the consolidated run-tab layout and the `StockResearch` index. Published rows must not expose local filesystem paths.
- Publishing success and screenshot completeness are separate statuses. A row export can succeed while screenshots remain partial/failed.

### 5. Screenshot insertion and visibility

- The exporter preserves filename and optimization metadata, targets at most 900,000 pixels, and keeps the payload within the configured byte cap (hard-capped at 1,800,000 bytes).
- Apps Script independently rejects images above 1,000,000 pixels or 1,800,000 bytes.
- Strict mode requires at least one eligible screenshot upload, a unique per-image outcome for every uploaded filename, consistent aggregate counts, and `embedded_in_sheet` for every uploaded image.
- Failed and skipped images must include a reason; when a row can be addressed, its status fields and notes must reflect that outcome rather than remain `pending_embedding`.
- A receiver-confirmed `insertImage` call is **not** proof of UI visibility. The acceptance report stays `PENDING_MANUAL_VISIBILITY_CHECK` until the operator opens the workbook, inspects the run's screenshot-gallery tab (dataset `visual-evidence`), and confirms that image objects are visible and legible. The investor dashboard and consolidated research/analysis data tab are supporting views, not the image-visibility target.
- The separate `--confirm-visible` invocation consumes the pending report without republishing and refuses confirmation if the research manifest changed after the export.

## Negative cases that must fail acceptance

- Empty or mismatched manifest / missing evidence pack.
- Persisted quality/readiness reports disagree with recomputed results.
- Stale analysis artifact, schema-invalid JSON, blocked readiness, or failed model invocation when analysis was requested.
- Missing screenshot outcomes, duplicate or unexpected filenames, mismatched aggregate counts, failed/skipped image outcomes, or no eligible images in strict mode.
- Old Apps Script deployments that do not return `screenshotResults`.
- A successful HTTP response with `ok: false`, malformed JSON, or no per-image receiver evidence.
- A publish whose images cannot be found or viewed in the workbook UI after the receiver claims insertion.

## Exit status

- `0`: local acceptance passed (`PASS_DECISION_READY` or `PASS_RESEARCH_ONLY_NO_CALL`).
- `1`: required checks failed or requested operation could not complete.
- `2`: receiver-side publishing succeeded, but manual workbook visibility confirmation is still pending.

## Evidence required for a final sign-off

Attach or retain the JSON report under `outputs/acceptance/SYMBOL-latest.json`, the exact workbook URL/run tab, the per-image receiver outcomes, the screenshot metadata/status rows, and an operator confirmation of visible images. Automated CI validates deterministic code and fixture contracts; it does not perform live NSE acquisition, call a live model, deploy Apps Script, write to the real workbook, or verify the Google Sheets UI.
