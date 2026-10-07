# Google Sheets Export

This integration uses a small Google Apps Script web-app sink instead of putting Google service-account credentials into the repository.

Target spreadsheet:

https://docs.google.com/spreadsheets/d/1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak/edit

## 1. Create the Apps Script sink

Open the target Google Sheet, then open **Extensions → Apps Script**.

Copy [Code.gs](Code.gs) into the Apps Script editor.

Create Script Properties:

- `SHEET_ID` = `1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak`
- `API_TOKEN` = a private random token

Deploy the Apps Script as a **Web app**. Use a versioned deployment for production. Use a versioned Apps Script deployment for production; Google documents versioned deployments under **Deploy → Manage deployments**.

The web app must be reachable by the pipeline. Do not put the spreadsheet ID or token in source code outside the script properties.

## 2. Configure the pipeline

Add to your private `.env`:

```dotenv
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
GOOGLE_SHEETS_WEBHOOK_TOKEN=your_same_token
GOOGLE_SHEETS_ID=1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak
```

The connector cannot read/write this sheet directly in the current ChatGPT workspace, so the Apps Script sink is the repository-side integration boundary.

## 3. Export examples

```powershell
# Existing individual-stock research package
npm run sheets:export -- research ITC

# Validated analysis output
npm run sheets:export -- analysis ITC

# Explicit full-scan JSON/CSV-normalized JSON file
npm run sheets:export -- fullscan ITC --file research/ITC/fullscan.json

# Chartink market scan
npm run sheets:export -- chartinkScan --file scans/chartink-market-scans.json

# Arbitrary dataset
npm run sheets:export -- custom --tab my-custom-tab --file path/to/data.json
```

## Tab naming

The exporter creates dated tabs:

| Dataset | Tab |
|---|---|
| Research | `<SYMBOL>-YYYY-MM-DD-research` |
| Analysis | `<SYMBOL>-YYYY-MM-DD-analysis` |
| Full scan | `<SYMBOL>-YYYY-MM-DD-fullscan` |
| Chartink scan | `chartinkScan-YYYY-MM-DD` |
| NSE 52-week scan | `nse52wScan-YYYY-MM-DD` |
| Screener scan | `screenerScan-YYYY-MM-DD` |
| Tijori scan | `tijoriScan-YYYY-MM-DD` |
| News | `<SYMBOL>-YYYY-MM-DD-news` |
| Laya | `<SYMBOL>-YYYY-MM-DD-laya` |
| Custom | supplied with `--tab` |

If the same tab is exported again, the default mode replaces the tab contents. Use `--append` for append behavior.

## Data shape

Array-of-object JSON becomes one spreadsheet row per object.

A JSON object becomes one row with nested values serialized as JSON strings.

Research exports use the compact deterministic artifacts rather than raw screenshots/PDFs by default.

## Security

- `.env` remains gitignored.
- Never commit the webhook token.
- Keep the Apps Script project owned by the Google account that should control the sheet.
- The repository never needs a Google service-account key.
