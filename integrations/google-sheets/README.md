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

## Quick fix for the dashboard's “SHEETS: NOT CONFIGURED” status

The dashboard in this state is behaving as designed: the local research run completed, but external publishing cannot start until both the Apps Script **web-app URL** and the matching **private token** are configured. The workbook ID alone is not enough.

Follow all three setup sections below, then restart the dashboard process. The page should change from **MISSING** to configured for both credentials. Do not put the token in the browser, source code, screenshots, or GitHub.

## 1. Create the Apps Script sink

Open the [StockResearch workbook](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0) using the Google account that should own/run the integration.

1. Open **Extensions → Apps Script**. This creates/opens the script project associated with the workbook. If the menu is unavailable, ensure you have edit access to the spreadsheet.
2. In the Apps Script editor, open the default `Code.gs`. Replace its contents with the complete current contents of this repository's [`integrations/google-sheets/Code.gs`](https://github.com/luckyhegde6/stockResearchApp/blob/init/integrations/google-sheets/Code.gs), then click **Save project** (or press Ctrl+S). Do not paste only part of the file.
3. Click **Project Settings** (gear icon) on the left. Under **Script Properties**, click **Add script property** and create both properties exactly as written below. Property names are case-sensitive.

| Property | Value |
|---|---|
| `SHEET_ID` | `1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak` |
| `API_TOKEN` | Your own private 64-character random token |

Generate a token in PowerShell from your project directory (Node.js must be installed):

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

Copy the output to the `API_TOKEN` Script Property, then keep it private. You will paste the same value into your local `.env` file in the next section. Do not send it to anyone or commit it.

## 2. Deploy the web app and copy the webhook URL

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear/type selector next to “Select type” and choose **Web app**.
3. Set **Execute as** to **Me** (the Google account that can edit the StockResearch workbook).
4. Set **Who has access** to an option that lets your local Node process call the script without an interactive Google sign-in. For a local/private integration this is commonly **Anyone** where the account and Workspace policy allow it. If the option is unavailable or prohibited, use an access mode permitted by your organization and confirm the Node exporter can authenticate to it; a browser login page is not a working webhook for this integration.
5. Click **Deploy**. If prompted, review/authorize the requested permissions with the intended Google account.
6. Copy the **Web app URL** ending in `/exec`, shaped like `https://script.google.com/macros/s/AKfycb.../exec`. Use this URL, not the Apps Script editor URL, deployment-management URL, or a URL ending in `/dev`.

Test it by opening the copied `/exec` URL in a browser. It should return JSON similar to:

~~~json
{"ok":true,"service":"stock-research-sheet-sink","workbookUrl":"https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit"}
~~~

The GET test only verifies that the deployed endpoint responds; it does **not** prove token-authenticated writes work. Run the test export in section 4 to verify a real write.

Important: after editing `Code.gs`, click **Deploy → Manage deployments → Edit** (pencil icon), select **New version**, then deploy the update. Saving the code editor alone does not update an existing versioned deployment.

## 3. Put the endpoint and token in the local `.env`

In the root of your local `stockResearchApp` checkout, create or edit a file named exactly `.env` (same folder as `package.json`). You can start from `.env.example`, but do **not** put real credentials in that example file. Keep these four settings in `.env`:

~~~dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID/exec
GOOGLE_SHEETS_WEBHOOK_TOKEN=PASTE_THE_EXACT_SAME_TOKEN_AS_API_TOKEN
GOOGLE_SHEETS_ID=1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
GOOGLE_SHEETS_AUTO_EXPORT=true
~~~

Replace both placeholders; do not leave the words `PASTE_...` in place and do not include angle brackets. The webhook token must match the Apps Script `API_TOKEN` character-for-character. Do not add spaces around the `=` or wrap the values in quotes. Keep existing unrelated environment settings in your `.env` file.

To check that the file exists in PowerShell:

~~~powershell
Test-Path .env
notepad .env
~~~

If the repository was launched from another directory, make sure `.env` is in the actual project root and you run commands with that directory as the working directory. The status endpoint deliberately reports only whether credentials are present; it never returns their values to the browser.



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
