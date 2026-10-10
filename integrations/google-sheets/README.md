# Google Sheets Publishing

**StockResearch workbook:** [Open StockResearch — Research & Analysis](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0)

The ID in the link matches the default `GOOGLE_SHEETS_ID`. Publishing is optional and remains outside the deterministic research/analysis pipeline: if Sheets is unavailable, research artifacts remain on disk.

## What is published

| Export | Published tabs | Contents |
|---|---|---|
| `research SYMBOL` | **One** run tab: `SYMBOL-YYYY-MM-DD-HHMMSSmmm-research` | Summary/readiness, canonical facts and calculations, source provenance and URLs, all research findings, quality checks, and screenshots embedded into the same tab |
| `analysis SYMBOL` | **One** run tab: `SYMBOL-YYYY-MM-DD-HHMMSSmmm-analysis` | Investment summary, findings, scores, risks, catalysts, scenarios, source URLs, reconciliation/calculation audit, and screenshots embedded into the same tab |
| scans/news/custom | One requested dataset tab per export | One record per row with local-path fields removed |

Each research or analysis run is consolidated vertically in a common, filterable table with a `section` column. Sections include `SUMMARY`, `EVIDENCE`, `SOURCES`, `FINDINGS`, `QUALITY`, and `SCREENSHOTS` (analysis also includes scores, risks, catalysts, scenarios and audit). Section-header rows are visually distinguished, and the standard header stays frozen. Source URLs are retained; local filesystem paths are never published.

The `StockResearch` tab remains as a clickable index to the **one data tab for each run**. No `_EXPORT_LOG` or `command-runs-YYYY-MM-DD` tabs are created. Command execution records remain local under `outputs/command-runs/` for diagnostics. After the updated Apps Script is redeployed, the next successful export removes legacy managed split tabs, old command-run tabs, and `_EXPORT_LOG` from previous exports.

Chart screenshots are embedded directly as sheet images in the same consolidated run tab, alongside their screenshot metadata rows. They are not made public Drive files. The exporter prioritizes `tradingview-1d.png`, `tradingview-fullchart-5y.png`, and `tradingview-fullchart-all.png`, then other PNG/JPEG/WebP screenshots. Oversized files are still listed with a skip status so the missing image is visible rather than silently dropped.

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

## 4. Restart, test a real write, and refresh the dashboard

After saving `.env`, stop and restart the dashboard so the new environment variables are loaded. In PowerShell, press **Ctrl+C** in the terminal running the dashboard, then from the repository root run:

~~~powershell
npm run dashboard
~~~

Open or refresh the dashboard and select **Google Sheets Sync**. **Apps Script endpoint** and **Private token** should both show as configured. If either still says **MISSING**, see the troubleshooting section below before running a research job.

Then use the **Publish Existing Results** panel in the Google Sheets Sync tab to publish an existing dataset, or test via CLI:

~~~powershell
npm run sheets:export -- custom --tab setup-smoke-test --file integrations/google-sheets/setup-smoke-test.json
~~~

The smoke-test command above requires a JSON file. For a simple test without creating one, use an existing research artifact:

~~~powershell
npm run sheets:export -- research ITC
~~~

A successful command should report JSON containing `"ok": true`, a `tabs` array, and the spreadsheet URL. Open the workbook and verify that `StockResearch` links to the new consolidated run tab. No separate export-log tab is created. After this authenticated export succeeds, launch another command; its **Google Sheets Publish Step** should reach **SUCCEEDED** rather than **NOT CONFIGURED**. Every supported command also writes a local audit artifact under `outputs/command-runs/`, even if external sync is misconfigured.

## 4. Export and verify a research run

With webhook URL/token configured, a research command automatically exports its results. You can still invoke the exporter manually to retry or re-publish:

~~~powershell
npm run research -- ITC
npm run sheets:export -- research ITC
~~~

Open the [StockResearch workbook](https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit?gid=0#gid=0). The `StockResearch` tab should contain one **Open tab** link for the consolidated run tab.

Expected research tab:

~~~text
ITC-YYYY-MM-DD-HHMMSSmmm-HHMMSSmmm-research
~~~

Within that one tab, filter the `section` column to review `SUMMARY`, `EVIDENCE`, `SOURCES`, `FINDINGS`, `QUALITY`, or `SCREENSHOTS`.

The standard analysis command auto-exports its detailed report after schema validation; the manual command below is for retries or re-publishing:

~~~powershell
npm run analyze -- ITC
npm run sheets:export -- analysis ITC
~~~

Expected analysis tab:

~~~text
ITC-YYYY-MM-DD-HHMMSSmmm-HHMMSSmmm-analysis
~~~

Use the `section` column to filter analysis summary, findings, scores, risks, catalysts, scenarios, sources, audit, and screenshots.

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
- **SCREENSHOTS** — screenshot name/period/size/status and images embedded directly in the consolidated run sheet. Local paths are excluded.
- **StockResearch** — workbook landing page linking one data tab per run.
- Command audit artifacts remain local; no `_EXPORT_LOG` or `command-runs-*` sheet tabs are created.

The transformer methods are deterministic; they do not invent missing facts, score values, or fill unavailable numbers with zero.

## Troubleshooting

### Dashboard says `SHEETS: NOT CONFIGURED` or endpoint/token is MISSING
This is the state shown in the screenshot. Your local run succeeded; Google Sheets has not received it because the app does not have both publishing credentials. Follow sections 1–3 above, then restart the dashboard. Setting only `GOOGLE_SHEETS_ID` is insufficient: the exporter needs the deployed web-app URL and matching token as well.

If the app still reports a missing setting, verify:
- The file is named `.env`, not `.env.txt`, and lives in the project root beside `package.json`.
- Both `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_WEBHOOK_TOKEN` have real, non-empty values, without placeholders.
- The URL is the deployed Apps Script web-app URL ending in `/exec`, not the editor URL.
- The dashboard was stopped and restarted after the file was changed.
- `GOOGLE_SHEETS_AUTO_EXPORT=true` (or the value is omitted, which defaults to enabled).

### Endpoint GET does not return the expected JSON
Redeploy as a Web app and check that you are copying the `/exec` URL from **Deploy → Manage deployments**. Complete any authorization prompts. A GET health response does not by itself test writes or token correctness.

### Export returns Unauthorized
The local `GOOGLE_SHEETS_WEBHOOK_TOKEN` must exactly match Apps Script **Project Settings → Script Properties → API_TOKEN**. Check for missing characters or whitespace and update both places if you regenerate a token. Restart the dashboard after changing `.env`.

### Export returns HTTP 401 / Google Drive “Page not found” HTML

This exact response means the request is not reaching the deployed StockResearch sink's JSON handler. Treat the webhook URL as invalid/stale or the deployment as inaccessible; it is not proof that the token is wrong. The exporter now suppresses the large HTML body and prints a targeted message.

1. Run `npm run sheets:doctor` from the repository root. This performs a read-only GET check and does not write to your workbook.
2. If it says the endpoint returns HTML, open the workbook and choose **Extensions → Apps Script → Deploy → Manage deployments**.
3. Edit the intended Web app deployment and publish a **New version**. If the deployment was deleted or you cannot edit it, create a new **Web app** deployment instead.
4. Copy the current **Web app URL** ending in `/exec`; do not use `/dev`, an editor URL, or an old deployment URL.
5. Replace `GOOGLE_SHEETS_WEBHOOK_URL` in your local root `.env` with that exact URL, save it, and restart `npm run dashboard`.
6. Run `npm run sheets:doctor` again. Proceed only when it returns `"ok": true` and `"spreadsheetIdMatches": true`.
7. Then retry `npm run sheets:export -- research HDFCBANK`. If the health check succeeds but this POST reports `Unauthorized` in JSON, compare the local `GOOGLE_SHEETS_WEBHOOK_TOKEN` with the Apps Script `API_TOKEN` Script Property. Do not expose either token in logs or screenshots.

The doctor validates the URL shape, final HTTP response, sink identity, and workbook ID. It deliberately does not send a write request, so a passing health check confirms the deployment is reachable but the authenticated POST is verified only by the export command.

### Export returns an HTML sign-in or permissions page instead of JSON
The deployment's **Who has access** option is not permitting the Node process to call it without an interactive sign-in, or the deployment URL is wrong. Use an access setting permitted by your Google account/Workspace policy that supports this server-to-server call. Keep **Execute as** set to the workbook-owning/editor account. If your organization prohibits anonymous web apps, use an approved deployment/authentication design rather than sharing credentials publicly.

### The script cannot edit the workbook
Confirm `SHEET_ID` in Script Properties is the workbook ID from its URL and the account configured for **Execute as** has edit access. Re-authorize the script if Google asks for new permissions.

### Export succeeds, but old behavior persists
After editing `Code.gs`, choose **Deploy → Manage deployments → Edit → New version → Deploy**. Saving the editor alone does not update the deployed version.

### Dashboard keeps showing an old result
Click **Refresh Sync Status** or refresh the browser. If settings changed, restart the Node dashboard process as well; a browser refresh alone does not reload server environment variables. Check local status at `outputs/google-sheets-sync-status.json` and detailed command artifacts in `outputs/command-runs/`.

### Research data exports, but screenshots show `screenshotsFailed`

The tab and row write can succeed even when individual chart images fail. The Apps Script now returns a `screenshotErrors` array containing the filename and the actual Apps Script exception for each failed image, and the `SCREENSHOTS` section's `embedding_status` column records the same exception.

1. Copy the latest `integrations/google-sheets/Code.gs` from this branch into the Apps Script editor.
2. Save it, then choose **Deploy → Manage deployments → Edit → New version → Deploy**. A code save alone does not update the running deployment.
3. Retry `npm run sheets:export -- research HDFCBANK`.
4. Inspect the returned `response.screenshotErrors` entries. Use the specific exception to choose the fix rather than increasing size limits blindly.

Google's Apps Script `Sheet.insertImage(blobSource, column, row)` API has a maximum blob size of **2 MB**. This project's local upload filters currently cap a file at 1.5 MB, so an image that is actually larger than 2 MB should normally be marked as skipped before upload. If the returned error says the image format is unsupported, convert that image to PNG or JPEG before upload. If it reports authorization/permission errors, check Apps Script's execution logs and ensure the deployed script is authorized to edit the workbook. See the [official Apps Script Sheet reference](https://developers.google.com/apps-script/reference/spreadsheet/sheet#insertImage(BlobSource,Integer,Integer)).

### A screenshot is listed but not embedded
Check the row's `embedding_status`. Files larger than `GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES` or the aggregate limit are intentionally skipped; raise the limits cautiously if needed. Check Apps Script execution logs if the response reports screenshot failures.

### Multiple Google accounts
Use the Google account that owns the deployment and has edit permission to the workbook. Google-account session and deployment permissions can make a correct-looking endpoint fail authorization.

## Security and publication policy

- Never commit `.env` or the webhook token.
- Never make chart screenshots publicly accessible just to display them.
- The exporter only uploads local screenshot files to the configured workbook as embedded images; it does not create public Drive links.
- Treat the sheet as a research report, not an execution signal or investment recommendation.
- Keep this reporting integration separate from any future order execution integration.
