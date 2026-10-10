# Google Sheets Setup

## 1. Purpose

StockResearchApp publishes research and analysis into Google Sheets through a private Google Apps Script Web App.

The integration has two components:

- **Node/TypeScript exporter** in the repository
- **Google Apps Script receiver** in `integrations/google-sheets/Code.gs`

The receiver writes to the configured spreadsheet and embeds optimized screenshots directly into the consolidated run tab.

## 2. Recommended workbook structure

The workbook should contain:

- `StockResearch` — clickable run index
- one consolidated tab per research run
- one consolidated tab per analysis run when analysis is exported

Do **not** create or depend on:

- `_EXPORT_LOG`
- `command-runs-YYYY-MM-DD`
- separate research/evidence/source/screenshot tabs for the same run

Command lifecycle records remain local under the application's output area.

## 3. Apps Script deployment

Open the Google Apps Script project associated with the target workbook.

Copy the repository version of:

`integrations/google-sheets/Code.gs`

into the Apps Script project.

Save the project and deploy it as:

**Deploy → New deployment → Web app**

Use the deployment settings required by the project, then copy the generated `/exec` URL.

After changing `Code.gs`, create a new deployment/version. Editing the source alone does not update an already deployed Web App.

## 4. Script properties

Configure the Apps Script Script Properties expected by the receiver, including:

- `SHEET_ID` — target spreadsheet ID
- `API_TOKEN` — private token shared with the Node exporter

Never commit these values to Git.

The Node environment uses:

`GOOGLE_SHEETS_WEBHOOK_URL`

and

`GOOGLE_SHEETS_WEBHOOK_TOKEN`

The token must match the Apps Script API token.

## 5. Node environment

The screenshot defaults are intentionally conservative:

```text
GOOGLE_SHEETS_MAX_SCREENSHOT_SOURCE_BYTES=20000000
GOOGLE_SHEETS_MAX_SCREENSHOT_BYTES=1400000
GOOGLE_SHEETS_MAX_SCREENSHOT_TOTAL_BYTES=5000000
GOOGLE_SHEETS_MAX_SCREENSHOTS=8
```

Screenshots are resized to no more than 900,000 pixels and JPEG-compressed before transmission.

The Apps Script receiver independently rejects payloads above:

- 1,800,000 bytes
- 1,000,000 pixels

The two layers are intentional: the exporter optimizes; the receiver enforces.

## 6. Health check

Run:

```bash
npm run sheets:doctor
```

A healthy current deployment should report:

```json
{
  "ok": true,
  "service": "stock-research-sheet-sink",
  "serviceVersion": "2",
  "spreadsheetIdMatches": true
}
```

If the service version is not `2`, redeploy the current Apps Script.

## 7. Publish a research run

```bash
npm run sheets:export -- research HDFCBANK
```

The exporter creates a consolidated tab such as:

`HDFCBANK-2026-10-10-<run>-research`

The tab contains labelled sections:

- SUMMARY
- EVIDENCE
- SOURCES
- FINDINGS
- QUALITY
- SCREENSHOTS

## 8. Security model

The browser never needs the Apps Script token.

The token is used by the server/CLI publishing boundary.

Published rows are recursively sanitized so local paths such as:

- `C:\\Local\\...`
- `/Users/...`
- `/home/...`
- `research/...`
- `outputs/...`

do not become part of the public workbook.

Public URLs remain URLs; they are not treated as local paths.

## 9. Deployment rule

Treat Apps Script as a separately deployed component.

GitHub CI validates the source code but does not automatically deploy the Apps Script Web App.

Therefore every receiver change requires:

1. update `Code.gs`
2. save Apps Script
3. deploy a new Web App version
4. run `npm run sheets:doctor`
5. perform a fresh export
6. inspect the resulting workbook
