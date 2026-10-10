# Handoff

Updated: 2026-10-11
Branch: fix/sheets-screenshot-evidence (targeting existing PR #1)
PR: [#1 → main](https://github.com/luckyhegde6/stockResearchApp/pull/1)

## Current state

The Google Sheets publishing boundary now has a visible local Control Center surface, in addition to the CLI exporter.

Completed in code:
- Structured transformer methods separate research and final analysis into classified workbook tabs.
- Apps Script receiver maintains a clickable `StockResearch` index, formatted rows and embedded screenshots; each research/analysis run uses one consolidated data tab, with no `_EXPORT_LOG` or `command-runs-*` tabs.
- The local dashboard has a **Google Sheets Sync** tab, a live status strip and a dynamic sixth **Google Sheets Sync** step after the five research stages.
- The dashboard can show `waiting`, `publishing`, `succeeded`, `failed`, `not_configured` and `skipped` states, plus recent attempts, row counts, tab names and screenshot counts.
- `GET /api/sheets/status` reports config booleans and local export history without revealing secrets. `POST /api/sheets/sync` allows controlled manual republishing of supported local artifacts and rejects non-local browser origins.
- All npm scripts are wrapped unless the command enters `src/index.ts`, which instruments its own CLI lifecycle. Command reports and lifecycle records stay local; they are not published as extra spreadsheet tabs.
- Dashboard-triggered research, batch, market-scan and analysis processes announce the Sheets step and finalize local lifecycle records on child exit. They also retain specialized exports for research/analysis/scan outputs.
- Dashboard Laya execution writes `research/<SYMBOL>/normalized/laya-decisions.json` and attempts publication.
- Google Sheets transformer and dashboard contract tests are included in `npm run test:all`.
- Task list/acceptance criteria live in [docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md](docs/GOOGLE_SHEETS_PUBLISHING_PLAN.md).

## Verification and blockers

- New changes include defensive screenshot byte/pixel validation, synchronized success/failure status cells, recursive local-path redaction, screenshot optimization metadata, and a canonical-values fallback when `normalized/analysis-evidence-pack.json` is absent. These newest changes still require CI verification.
- Live workbook contents, tab rows and screenshot insertion are **not yet verified** from this workspace. GitHub source changes do not deploy Apps Script automatically.
- The local endpoint/token values were previously empty. Unless both are configured in `.env`, the UI is expected to show **NOT CONFIGURED** and no external write should be implied.
- The latest Apps Script must be pasted/saved/deployed in the target workbook's Apps Script editor.
- The supplied AI Studio preview did not return inspectable app content through connected access. Its exact visual layout is still a reference to compare when viewable.

## Local steps after pulling latest `init`

1. Run `npm ci` if dependencies changed.
2. Configure `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_TOKEN`, `GOOGLE_SHEETS_ID` and `GOOGLE_SHEETS_AUTO_EXPORT=true` in your local `.env`.
3. Deploy the latest `integrations/google-sheets/Code.gs` version from the target workbook's Apps Script project. Configure Script Properties `SHEET_ID` and `API_TOKEN`.
4. Restart the server with `npm run dashboard`.
5. Open [http://localhost:3000](http://localhost:3000) and select **Google Sheets Sync**. The status strip below the progress stepper should also show the current Sheets state.
6. Run `npm run sheets:doctor`; it should report `serviceVersion: 2`. Then run `npm run sheets:export -- research HDFCBANK` and check the workbook index and the single generated run tab. Inspect the `SCREENSHOTS` section for actual images and matching `embedded_in_sheet`/`embed_failed` values. Try **Publish to Google Sheets** to republish an existing artifact.
7. Run the current deterministic test suite and review the matching GitHub Actions run.

## Caution areas

- A missing webhook or failed Sheet request must never invalidate local research output.
- Never display secrets in the dashboard or return them from the status API.
- The Apps Script is a separate deployment; GitHub changes alone do not update the live web app.
- Screenshot files are re-encoded as JPEG below 900,000 pixels and the configured byte threshold; rows preserve original filename/size/dimensions and record optimization. The receiver rechecks size/pixels and synchronizes `value`, `status`, and `embedding_status` after insertion.
- Keep reporting separate from order execution; no trade execution is added here.

## Handoff protocol

Record exact paths, tests run, known limits, and the next action. Do not paste large logs or secrets into this file.
