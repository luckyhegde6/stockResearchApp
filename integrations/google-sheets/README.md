# Google Sheets Publishing

**StockResearch workbook:** [Open StockResearch — Research & Analysis](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0)

The ID in the link matches the default `GOOGLE_SHEETS_ID`. Publishing is optional and remains outside the deterministic research/analysis pipeline: if Sheets is unavailable, research artifacts remain on disk.

## What is published

| Export | Published tabs | Contents |
|---|---|---|
| `research SYMBOL` | `summary`, `evidence`, `sources`, `findings`, `quality`, `visual-evidence` | Readiness, deterministic canonical facts/calculations, source provenance, fundamental/valuation/technical/news/catalyst findings, blocking and advisory gaps, chart screenshots |
| `analysis SYMBOL` | `summary`, `findings`, `scores`, `risks`, `catalysts`, `scenarios`, `sources`, `audit`, `visual-evidence` | Decision and confidence, reasons, metric-by-metric findings, 0–10 domain scores, ranked risks/catalysts, bull/base/bear scenarios, source URLs, conflicts/calculation audit and embedded chart screenshots |
| scans/news/custom | requested dataset tab | One record per row with data columns preserved |

Tab names are prefixed with the symbol and run date, for example `ITC-2026-10-09-analysis-summary`. Each tab contains a proper header row, frozen headers, wrapped cells, an active filter, and resized columns. The landing tab named `StockResearch` indexes every published tab with a clickable **Open tab** link. The hidden-from-the-workflow log tab is named `_EXPORT_LOG` and records one entry for each tab written, including the export run ID, time, row count, mode, and screenshot status.

Chart screenshots are embedded directly as sheet images in `*-visual-evidence`. They are not made public Drive files. The exporter prioritizes `tradingview-1d.png`, `tradingview-fullchart-5y.png`, and `tradingview-fullchart-all.png`, then other PNG/JPEG/WebP screenshots. Oversized files are still listed with a skip status so the missing image is visible rather than silently dropped.

## Repository files

- `integrations/google-sheets/Code.gs` — Apps Script web-app sink and workbook index.
- `scripts/export-to-google-sheets.ts` — CLI export and screenshot collection.
- `scripts/google-sheets-transformers.ts` — pure transformer methods for analysis and research artifacts.
- `scripts/test-google-sheets-transformers.ts` — deterministic transformer contract tests.
- `.env` — private runtime configuration. Never commit it.

## 1. Create the Apps Script sink

Open the [StockResearch workbook](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0) using the Google account that should own/run the integration.

1. Open **Extensions → Apps Script**.
2. Replace the default code with the current repository version of `integrations/google-sheets/Code.gs`.
3. Save the project.
4. Under **Project Settings → Script Properties**, add the following two properties:

| Property | Value |
|---|---|
| `SHEET_ID` | `1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak` |
| `API_TOKEN` | A private 64-character random token |

Generate a token locally with Node.js:

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

Keep the token private. The deployed script rejects POST requests if `API_TOKEN` is missing or does not match.

## 2. Deploy the web app

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Configure it to execute as an account that has edit permission to the workbook.
4. Choose the narrowest access setting that permits your Node.js runner to call the endpoint.
5. Deploy and complete any Google authorization prompts.
6. Copy the web-app URL, normally shaped like `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`.

When you edit `Code.gs` in the future, save the changes and update the existing versioned deployment (or create a new deployment). Merely saving the editor does not necessarily update the version that a deployed web app runs.

A browser GET to the endpoint should return JSON similar to:

~~~json
{"ok":true,"service":"stock-research-sheet-sink","workbookUrl":"https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit"}
~~~

## 3. Configure local `.env`

Set the following values in `stockResearchApp/.env`:

~~~dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
GOOGLE_SHEETS_WEBHOOK_TOKEN=<same private token as Apps Script API_TOKEN>
GOOGLE_SHEETS_ID=1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
GOOGLE_SHEETS_AUTO_EXPORT=true

# Optional screenshot publish limits
GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES=1500000
GOOGLE_SHEETS_MAX_SCREENSHOT_TOTAL_BYTES=5000000
GOOGLE_SHEETS_MAX_SCREENSHOTS=8
~~~

The first two keys already appear blank in `.env.example`. Configure the real values only in your local `.env` or your secret manager. With both URL and token populated, the standard `npm run research -- SYMBOL` and `npm run analyze -- SYMBOL` commands auto-publish after the primary run succeeds. Set `GOOGLE_SHEETS_AUTO_EXPORT=false` to opt out. Manual `npm run sheets:export` commands remain useful for retries and re-publishing older artifacts. Never add them to `.env.example`, GitHub, the agent manifest, issues, or pull-request text.

## 4. Export and verify a research run

With webhook URL/token configured, a research command automatically exports its results. You can still invoke the exporter manually to retry or re-publish:

~~~powershell
npm run research -- ITC
npm run sheets:export -- research ITC
~~~

Open the [StockResearch workbook](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0). The `StockResearch` tab should contain an **Open tab** link for every generated tab, and `_EXPORT_LOG` should show each tab write with the same run ID.

Expected research tabs include:

~~~text
ITC-YYYY-MM-DD-research-summary
ITC-YYYY-MM-DD-research-evidence
ITC-YYYY-MM-DD-research-sources
ITC-YYYY-MM-DD-research-findings
ITC-YYYY-MM-DD-research-quality
ITC-YYYY-MM-DD-research-visual-evidence
~~~

The standard analysis command auto-exports its detailed report after schema validation; the manual command below is for retries or re-publishing:

~~~powershell
npm run analyze -- ITC
npm run sheets:export -- analysis ITC
~~~

Expected analysis tabs include:

~~~text
ITC-YYYY-MM-DD-analysis-summary
ITC-YYYY-MM-DD-analysis-findings
ITC-YYYY-MM-DD-analysis-scores
ITC-YYYY-MM-DD-analysis-risks
ITC-YYYY-MM-DD-analysis-catalysts
ITC-YYYY-MM-DD-analysis-scenarios
ITC-YYYY-MM-DD-analysis-sources
ITC-YYYY-MM-DD-analysis-audit
ITC-YYYY-MM-DD-analysis-visual-evidence
~~~

Other supported dataset examples:

~~~powershell
npm run sheets:export -- fullscan ITC --file research/ITC/fullscan.json
npm run sheets:export -- chartinkScan --file scans/chartink-market-scans.json
npm run sheets:export -- nse52w --file path/to/scan.json
npm run sheets:export -- screenerScan --file path/to/scan.json
npm run sheets:export -- tijoriScan --file path/to/scan.json
npm run sheets:export -- news ITC --file research/ITC/normalized/news-sentiment.json
npm run sheets:export -- laya ITC --file path/to/laya.json
npm run sheets:export -- custom --tab my-custom-tab --file path/to/data.json
npm run sheets:export -- chartinkScan --file scans/chartink-market-scans.json --append
~~~

The exporter prints a JSON result containing the workbook URL, run ID, tab names, row counts, and screenshot counts returned by Apps Script.

## 5. What each analysis tab means

- **summary** — one-row decision snapshot: recommendation, conviction/confidence, current price/timestamp, valuation, technical regime, scores, key thesis and risks.
- **findings** — normalized one-finding-per-row records grouped by domain, with field path, value, confidence and evidence/source IDs.
- **scores** — score by analytical domain on the schema's 0–10 scale.
- **risks** and **catalysts** — dedicated ranked tables with probability/impact/confirmation conditions.
- **scenarios** — one row each for bull, base and bear.
- **sources** — source ID, source type, link, retrieved/published timestamps, reporting period and artifact provenance.
- **audit** — facts without a primary source, conflicts, and calculation formulas/inputs.
- **visual-evidence** — screenshot name/period/size/artifact path and images embedded directly in the sheet.
- **StockResearch** — workbook landing page linking all published tabs.
- **_EXPORT_LOG** — run-level operational audit trail.

The transformer methods are deterministic; they do not invent missing facts, score values, or fill unavailable numbers with zero.

## Troubleshooting

### The run did not create tabs
Check that `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_WEBHOOK_TOKEN` are both populated in local `.env`. A successful CLI response must include `ok: true` and a `tabs` array. Confirm the same run appears in `_EXPORT_LOG`.

### Unauthorized
The local token must exactly match the Apps Script `API_TOKEN` Script Property. If a token was rotated, update both sides.

### The endpoint returns success, but old behavior persists
Update the deployment under **Deploy → Manage deployments** to point at the saved/latest version. Re-test the GET health endpoint and perform a small export.

### The script cannot edit the workbook
Use an execution account that has editor access to the target workbook. Check the workbook ID in Apps Script Script Properties.

### A screenshot is listed but not embedded
Check the row's `embedding_status`. Files larger than `GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES` or the aggregate limit are intentionally skipped; raise the limits cautiously if needed. Check Apps Script execution logs if the response reports screenshot failures.

### Multiple Google accounts
Test with the same account that has edit permission to the workbook. Google-account session and deployment permissions can make a correct-looking endpoint fail authorization.

## Security and publication policy

- Never commit `.env` or the webhook token.
- Never make chart screenshots publicly accessible just to display them.
- The exporter only uploads local screenshot files to the configured workbook as embedded images; it does not create public Drive links.
- Treat the sheet as a research report, not an execution signal or investment recommendation.
- Keep this reporting integration separate from any future order execution integration.
