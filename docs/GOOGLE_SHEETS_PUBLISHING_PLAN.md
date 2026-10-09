# Google Sheets Sync & UI Reference Plan

**Workbook:** [StockResearch](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0)  
**Requested UI reference:** [Google AI Studio app preview](https://aistudio.google.com/apps/bf7ddb4a-486d-46db-9e2a-4cc6cfcfee5c?showPreview=true&showAssistant=true)  
**Code branch:** `init` (PR #1 → `main`)

This plan keeps code work separate from Google-side deployment and final visual verification. Checkboxes describe the current implementation state rather than inferred live workbook state.

## Work plan

### Task 0 — Define the reference and completion gate
**Status: In progress**

- [x] Save the target StockResearch workbook URL in the README and integration guide.
- [x] Record the supplied AI Studio preview as the intended sync/UI reference.
- [ ] Compare the actual AI Studio preview against the desired experience. The provided URL did not return inspectable app content to the connected web fetcher; until the preview is publicly inspectable or screenshots are supplied, pixel-level similarity is unverified.
- [ ] Confirm whether the reference is primarily a sheet layout, a web UI, an Apps Script front end, or a combination. Do not assume the rendered implementation from the URL alone.

**Acceptance:** reference source and workbook are linked from project docs, with no unsupported claims about the inaccessible preview.

### Task 1 — Stable row transformer contract
**Status: Implemented; automated test added**

- [x] Publish the analysis summary with recommendation, price/time, valuation, scores, confidence and key thesis.
- [x] Split nested findings into classified domain/field/value rows.
- [x] Publish domain scores, ranked risks, catalysts, bull/base/bear scenarios, source provenance, calculation notes and conflict audit as separate tabs.
- [x] Publish deterministic research readiness, canonical evidence, source-health, source-artifact and quality rows.
- [x] Add fixture-backed assertions for required tabs and key columns.
- [ ] Expand edge-case tests for arrays of objects, missing sections, unusual symbols and 90-character sheet-name collisions.

**Acceptance:** stable headers; unknown/missing data stays blank or explicit rather than becoming a fabricated zero; recommendations remain clearly labeled as analysis rather than guaranteed outcomes.

### Task 2 — Workbook index and audit log
**Status: Implemented in Apps Script; live behavior not yet verified**

- [x] Maintain a `StockResearch` landing/index tab with clickable links to published tabs.
- [x] Maintain `_EXPORT_LOG` with run ID, timestamp, dataset, tab name, row count, mode and screenshot status.
- [x] Require a configured API token and reject mismatched spreadsheet IDs.
- [ ] Verify indexing/logging against the actual workbook after Apps Script deployment.
- [ ] Test replace and append behavior on an existing tab and confirm filters/header formatting survive re-exports.

**Acceptance:** each exporter response marked `ok: true` corresponds to matching rows in the workbook and a matching audit entry.

### Task 3 — Screenshot and visual evidence
**Status: Implemented with limits; live embedding not yet verified**

- [x] Collect screenshots from `research/<SYMBOL>/screenshots/`.
- [x] Prioritize 1D, 5-year and all-history TradingView charts.
- [x] Embed screenshots directly into the `*-visual-evidence` tab (not public Drive links).
- [x] Publish file name, chart period, size, path and an embedding status.
- [x] Add configurable single-file, total-byte and screenshot-count limits.
- [ ] Test empty/corrupt image files and Apps Script image insertion failures.
- [ ] Confirm visual size and row height in desktop/mobile sheet views.

**Acceptance:** every expected screenshot is embedded or has an explicit skip/failure reason; screenshots are not silently misreported as embedded.

### Task 4 — Automatic run publishing
**Status: Implemented as best-effort post-run hooks; live end-to-end status pending**

- [x] On a successful standalone research run, publish the deterministic research package.
- [x] For the combined research + analysis flow, publish research evidence before the analysis readiness gate.
- [x] After a schema-valid analysis, publish the full investment analysis.
- [x] Require both webhook URL and token; allow `GOOGLE_SHEETS_AUTO_EXPORT=false` to disable hooks.
- [x] Keep the local research/analysis result valid if Sheets publishing fails.
- [ ] Verify a run ID can be traced from CLI output to every published tab and `_EXPORT_LOG`.

**Acceptance:** no duplicate research acquisition for the combined `--analyze` path; export failures warn and permit local output to remain available.

### Task 5 — Live configuration and end-to-end verification
**Status: Waiting on the deployed endpoint/local secrets; cannot be verified from this repository**

1. Deploy the latest `integrations/google-sheets/Code.gs` version from the linked workbook's Apps Script project.
2. Set Script Properties `SHEET_ID` and `API_TOKEN`.
3. Set `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_TOKEN` and `GOOGLE_SHEETS_ID` locally. Never commit credentials.
4. Run `npm run research -- ITC` and check its response/logs.
5. Run `npm run analyze -- ITC` only if the deterministic readiness gate passes and the configured LLM is available.
6. Compare the `StockResearch` index, generated tabs, `_EXPORT_LOG`, and image previews.

**Acceptance:** actual sheet contents, row counts, recommendation/findings classifications and screenshot embedding are verified for a known run. Until these steps are complete, do not describe the live sync as confirmed.

### Task 6 — Match the AI Studio UI reference
**Status: Blocked on reference visibility**

- [ ] Inspect the reference's layout and interaction patterns (navigation, summary cards, data tables, filters, colors, density, responsive behavior).
- [ ] Map each visible component to workbook tabs and export fields; identify UI-only versus sheet-backed fields.
- [ ] Implement the exact necessary sheet sync/schema changes without coupling analysis logic to presentation.
- [ ] Add UI acceptance checks using screenshots or a publicly accessible preview.

**Acceptance:** a documented field-to-component map and a before/after review against the actual reference.

### Task 7 — Reliability and scale
**Status: Backlog**

- [ ] Add a dry-run mode that outputs planned tab names, row counts and screenshot byte totals without network writes.
- [ ] Add a payload-size preflight and optional screenshot downscaling before upload.
- [ ] Make retries idempotent using run ID + tab name, without duplicating audit records.
- [ ] Add a fixture/mock receiver integration test for HTTP errors, invalid JSON, token mismatch and partial tab failures.
- [ ] Add a per-tab schema/version field and a migration strategy if headers change.
- [ ] Add optional compact one-tab export for users who prefer a single worksheet.

## Current commands

~~~powershell
# deterministic evidence + automatic publish (requires the local endpoint and token)
npm run research -- ITC

# fresh research, readiness gate, validated analysis + automatic publish
npm run analyze -- ITC

# manual re-publish/retry
npm run sheets:export -- research ITC
npm run sheets:export -- analysis ITC

# pure transformer contract test
npm run test:google-sheets-transformers
~~~

## Reference limitation

The AI Studio URL is saved above as the requested source of truth for the next UI pass, but its app preview could not be fetched by the connected web tool in this session. No claim is made that the current workbook styling matches it. Continue implementing the verified sheet-sync contract first; finish the design comparison when the actual preview is inspectable.
