# Google Sheets Export

This integration sends compact pipeline results to the target Google Sheet through a small Google Apps Script web-app sink.

Target workbook:

1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak

Repository files:

- integrations/google-sheets/Code.gs — deploy this into Apps Script.
- scripts/export-to-google-sheets.ts — CLI exporter.
- .env — private runtime configuration. Never commit it.

## What you need

The two values you generate/configure are:

~~~dotenv
GOOGLE_SHEETS_WEBHOOK_URL=
GOOGLE_SHEETS_WEBHOOK_TOKEN=
~~~

The spreadsheet ID is already documented in .env.example:

~~~dotenv
GOOGLE_SHEETS_ID=1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
~~~

## Step 1 — Open the target Sheet

Open:

https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit

The value between /d/ and /edit is the spreadsheet ID.

## Step 2 — Create the Apps Script

Inside the Sheet:

1. Open Extensions → Apps Script.
2. Replace the default script with integrations/google-sheets/Code.gs.
3. Save the project.

The script uses two Apps Script Script Properties:

| Property | Value |
|---|---|
| SHEET_ID | 1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak |
| API_TOKEN | a private random token |

## Step 3 — Generate GOOGLE_SHEETS_WEBHOOK_TOKEN

Generate the token locally with Node:

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

Copy the generated 64-character hexadecimal value.

In Apps Script, open Project Settings → Script Properties and create:

~~~text
SHEET_ID = 1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
API_TOKEN = <generated token>
~~~

Keep API_TOKEN private.

## Step 4 — Deploy the Apps Script web app

In Apps Script:

1. Click Deploy → New deployment.
2. Select Web app.
3. Configure the execution identity so the script runs with an account that has edit permission to the target Sheet.
4. Choose the narrowest access option that permits your machine to call the endpoint.
5. Deploy and complete the Google authorization prompts.
6. Copy the Web app URL.

Google documents versioned deployments under Deploy → Manage deployments; use a versioned deployment for the endpoint used by the pipeline. The deployment has a URL and deployment ID. citeturn133453search3

The URL normally looks like:

~~~text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
~~~

That value becomes GOOGLE_SHEETS_WEBHOOK_URL.

## Step 5 — Configure your local .env

Edit:

stockResearchApp/.env

Your current .env already contains the two keys with empty values. Replace them with:

~~~dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
GOOGLE_SHEETS_WEBHOOK_TOKEN=<same token as Apps Script API_TOKEN>
GOOGLE_SHEETS_ID=1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
~~~

Do not put the real token into .env.example, GitHub, agent-manifest.json, or committed source. .env is gitignored.

## Step 6 — Test the endpoint

Open the Web app URL in a browser:

~~~text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
~~~

The endpoint should return JSON similar to:

~~~json
{"ok":true,"service":"stock-research-sheet-sink"}
~~~

Then run:

~~~powershell
npm run sheets:export -- research ITC
~~~

The Sheet should contain a dated tab:

ITC-YYYY-MM-DD-research

## Export commands

~~~powershell
npm run sheets:export -- research ITC
npm run sheets:export -- analysis ITC
npm run sheets:export -- fullscan ITC --file research/ITC/fullscan.json
npm run sheets:export -- chartinkScan --file scans/chartink-market-scans.json
npm run sheets:export -- nse52w --file path/to/scan.json
npm run sheets:export -- screenerScan --file path/to/scan.json
npm run sheets:export -- tijoriScan --file path/to/scan.json
npm run sheets:export -- news ITC --file research/ITC/normalized/news-sentiment.json
npm run sheets:export -- laya ITC --file path/to/laya.json
npm run sheets:export -- custom --tab my-custom-tab --file path/to/data.json
~~~

Append instead of replace:

~~~powershell
npm run sheets:export -- chartinkScan --file scans/chartink-market-scans.json --append
~~~

## Tab naming

| Dataset | Default tab |
|---|---|
| Research | SYMBOL-YYYY-MM-DD-research |
| Analysis | SYMBOL-YYYY-MM-DD-analysis |
| Full scan | SYMBOL-YYYY-MM-DD-fullscan |
| Chartink scan | chartinkScan-YYYY-MM-DD |
| NSE 52-week scan | nse52wScan-YYYY-MM-DD |
| Screener scan | screenerScan-YYYY-MM-DD |
| Tijori scan | tijoriScan-YYYY-MM-DD |
| News | SYMBOL-YYYY-MM-DD-news |
| Laya | SYMBOL-YYYY-MM-DD-laya |
| Custom | dataset-YYYY-MM-DD unless --tab is supplied |

The Apps Script also writes an _EXPORT_LOG tab with export time, tab name, dataset, row count, and mode.

## Data policy

Research export uses compact deterministic artifacts first:

~~~text
manifest.json
analysis-readiness.json
normalized/analysis-inputs.json
normalized/analysis-evidence-pack.json
normalized/reconciliation.json
source-health.json
evidence-quality.json
~~~

Screenshots and PDFs are not dumped into Sheets by the default research exporter.

## Troubleshooting

### Unauthorized

The token sent by Node does not match the Apps Script API_TOKEN.

Check that:

~~~dotenv
GOOGLE_SHEETS_WEBHOOK_TOKEN=<same value as API_TOKEN>
~~~

### The script cannot write the spreadsheet

Check that the deployed web app executes under a Google account with edit permission to the target Sheet. Web-app deployments explicitly carry execution identity and access configuration. citeturn133453search0turn133453search4

### Old code is still running

Update the existing versioned deployment under Deploy → Manage deployments so it points to the latest saved script version. Google versioned deployments remain tied to their selected project version until updated. citeturn133453search3

### Multiple Google accounts

Apps Script documents limitations around simultaneous Google-account sessions. When testing the deployment, use the Google account that owns or controls the Sheet. citeturn133453search8

## Security rules

- Never commit .env.
- Never commit GOOGLE_SHEETS_WEBHOOK_TOKEN.
- Never paste the token into issues or PRs.
- Never put the real token in .env.example.
- Treat the webhook URL as operational configuration.
- Keep this reporting integration separate from any future trading/execution integration.
