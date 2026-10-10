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
- [x] Consolidate summary, evidence, findings, quality, source provenance, risks, catalysts, scenarios, audit and screenshots into one labelled data tab per run.
- [x] Exclude local filesystem paths from published rows.
- [x] Add fixture-backed assertions for required tabs and key columns.
- [ ] Expand edge-case tests for arrays of objects, missing sections, unusual symbols and 90-character sheet-name collisions.

**Acceptance:** stable headers; unknown/missing data stays blank or explicit rather than becoming a fabricated zero; recommendations remain clearly labeled as analysis rather than guaranteed outcomes.

### Task 2 — Workbook index and single-run-tab layout
**Status: Updated in code; requires Apps Script redeployment and live verification**

- [x] Maintain a `StockResearch` landing/index tab with one clickable link per run.
- [x] Do not create `_EXPORT_LOG` or `command-runs-*` tabs; command records remain local.
- [x] Clean legacy managed split research/analysis tabs and prior command-run/log tabs on the next successful export after deployment.
- [x] Require a configured API token and reject mismatched spreadsheet IDs.
- [ ] Verify the consolidated tab and legacy cleanup against the actual workbook after Apps Script deployment.
- [ ] Test replace and append behavior on an existing tab and confirm filters/header formatting survive re-exports.

**Acceptance:** each research/analysis export creates one data tab with labelled sections and a matching `StockResearch` index row.

### Task 3 — Screenshot and visual evidence
**Status: Implemented with limits; live embedding not yet verified**

- [x] Collect screenshots from `research/<SYMBOL>/screenshots/`.
- [x] Prioritize 1D, 5-year and all-history TradingView charts.
- [x] Embed screenshots directly into the consolidated run tab (not public Drive links).
- [x] Publish file name, chart period, size and embedding status, without local paths.
- [x] Add configurable single-file, total-byte and screenshot-count limits.
- [ ] Test empty/corrupt image files and Apps Script image insertion failures.
- [ ] Confirm visual size and row height in desktop/mobile sheet views.

**Acceptance:** every expected screenshot is embedded or has an explicit skip/failure reason; screenshots are not silently misreported as embedded.

### Task 4 — Automatic run publishing
**Status: Implemented in code; live end-to-end status pending**

- [x] On a successful standalone research run, publish the deterministic research package.
- [x] Wrap every npm script that does not enter `src/index.ts` directly with a shared lifecycle wrapper; central CLI commands use the same lifecycle inside `src/index.ts`.
- [x] Keep command execution audit records local; do not create `command-runs-*` spreadsheet tabs.
- [x] For the combined research + analysis flow, publish research evidence before the analysis readiness gate.
- [x] After a schema-valid analysis, publish the full investment analysis.
- [x] Require both webhook URL and token; allow `GOOGLE_SHEETS_AUTO_EXPORT=false` to disable hooks.
- [x] Keep the local research/analysis result valid if Sheets publishing fails.
- [ ] Verify each successful run appears once in the `StockResearch` index and has exactly one data tab.

**Acceptance:** no duplicate research acquisition for the combined `--analyze` path; export failures warn and permit local output to remain available.

### Task 5 — Dashboard visibility and local sync state
**Status: Implemented in code; requires local restart to see it**

- [x] Add a `Google Sheets Sync` navigation tab and a global status strip beneath the pipeline stepper.
- [x] Add local APIs for status polling and explicit publish/retry.
- [x] Persist recent publish attempts locally with run IDs, tab names, row counts and screenshot counts.
- [x] Show running, waiting, publishing, succeeded, failed, not-configured and skipped states in the dashboard.
- [x] Finalize dashboard-launched research, batch, market-scan and analysis process records on child exit, including launch/exit failures.
- [x] Record the Sheets step when dashboard research, batch, scan and analysis processes are started; show the actual state in step 6.
- [x] Publish supported CLI market-screen and scan artifacts after successful generation.
- [ ] Deploy Apps Script and verify the actual workbook receives rows/images.

### Task 6 — Live configuration and end-to-end verification
**Status: Waiting on the deployed endpoint/local secrets; cannot be verified from this repository**

1. Deploy the latest `integrations/google-sheets/Code.gs` version from the linked workbook's Apps Script project.
2. Set Script Properties `SHEET_ID` and `API_TOKEN`.
3. Set `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_TOKEN` and `GOOGLE_SHEETS_ID` locally. Never commit credentials.
4. Run `npm run research -- ITC` and check its response/logs.
5. Run `npm run analyze -- ITC` only if the deterministic readiness gate passes and the configured LLM is available.
6. Confirm `StockResearch` links to one consolidated run tab; check its section counts and screenshot preview rows.

**Acceptance:** actual sheet contents, row counts, section classifications, path-free source provenance and screenshot embedding are verified for a known run. Until these steps are complete, do not describe the live sync as confirmed.

### Task 7 — Match the AI Studio UI reference
**Status: Blocked on reference visibility**

- [ ] Inspect the reference's layout and interaction patterns (navigation, summary cards, data tables, filters, colors, density, responsive behavior).
- [ ] Map each visible component to workbook tabs and export fields; identify UI-only versus sheet-backed fields.
- [ ] Implement the exact necessary sheet sync/schema changes without coupling analysis logic to presentation.
- [ ] Add UI acceptance checks using screenshots or a publicly accessible preview.

**Acceptance:** a documented field-to-component map and a before/after review against the actual reference.

### Task 8 — Reliability and scale
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
