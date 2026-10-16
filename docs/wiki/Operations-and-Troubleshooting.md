# Operations & Troubleshooting

## Health check

Run the read-only endpoint check before attempting any export:

```bash
npm run sheets:doctor
```

Expected fields:

```json
{
  "ok": true,
  "service": "stock-research-sheet-sink",
  "serviceVersion": "3",
  "spreadsheetIdMatches": true
}
```

The doctor performs a GET health check; it does not write research data to the workbook. It verifies the deployed endpoint, service version and expected spreadsheet identity.

### Doctor reports serviceVersion 2 or missing serviceVersion

**Known failure and verified fix (2026-10-16):** the local `integrations/google-sheets/Code.gs` contained `serviceVersion: '3'`, but the deployed `/exec` endpoint returned version `2`. The source file and deployed Web App version are separate. Updating the source in GitHub or saving the Apps Script editor does not guarantee that the current deployment serves it.

1. Open the Apps Script project used by `GOOGLE_SHEETS_WEBHOOK_URL`.
2. Copy the complete current `integrations/google-sheets/Code.gs` into the editor and save.
3. Open **Deploy → Manage deployments**, edit the web-app deployment and select **New version**, then deploy.
4. Preserve the required access settings and ensure the local `.env` still points to the correct `/exec` endpoint.
5. Run `npm run sheets:doctor` again. Continue only when `ok: true`, `serviceVersion: "3"`, and `spreadsheetIdMatches: true`.

A successful HTTP 200 is not sufficient if the body is old, HTML, malformed JSON or reports the wrong service/version. Do not paste webhook URLs, tokens or other credentials into logs or issue reports.

### Safely inspect the configured endpoint

This PowerShell-friendly Node snippet reports only endpoint health fields, not the secret URL or token:

```powershell
@'
require('dotenv').config();
(async () => {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const body = await response.text();
    console.log('HTTP status:', response.status);
    console.log('Content type:', response.headers.get('content-type'));
    try {
      const data = JSON.parse(body);
      console.log({
        ok: data.ok,
        service: data.service,
        serviceVersion: data.serviceVersion,
        hasWorkbookUrl: Boolean(data.workbookUrl),
        error: data.error
      });
    } catch {
      console.log('Response is not JSON; first 300 characters:', body.slice(0, 300));
    }
  } catch (error) {
    console.log('Request failed:', error.name, error.message);
  } finally {
    clearTimeout(timeout);
  }
})();
'@ | node
```

The process-level PowerShell environment can be empty while Node still loads these values from `.env` through `dotenv/config`. Check configuration from the repository root, and print only whether values are configured—not their values.

## Research export

```bash
npm run sheets:export -- research HDFCBANK
```

Run the doctor first. If doctor passes but export fails, preserve the concise error and the local command audit. Check the response body and exporter output; do not infer success from HTTP 200 alone.

## End-to-end acceptance

Inspect and validate an existing local research run without new acquisition or external publishing:

```bash
npm run acceptance:e2e -- RELIANCE
```

The inspection mode requires `research/SYMBOL/manifest.json`. It refreshes deterministic preparation/quality/readiness artifacts but does not intentionally reacquire data or publish.

Run a fresh acquisition only when needed:

```bash
npm run acceptance:e2e -- RELIANCE --acquire
```

Run fresh acquisition plus model analysis only when explicitly intended and a model provider is configured:

```bash
npm run acceptance:e2e -- RELIANCE --analysis
```

**Important:** `--analysis` performs its own fresh acquisition. Do not combine `--acquire` and `--analysis`. If `research/SYMBOL` already exists, acquisition/analysis refuses to replace it unless `--replace-existing` is supplied. This guard is intentional. Preserve any needed artifacts and verify the target directory before authorizing replacement; do not add `--replace-existing` just to get past the warning.

Publish only after the local acceptance checks and Sheets doctor pass:

```bash
npm run acceptance:e2e -- RELIANCE --publish
```

After the command reports receiver-confirmed insertions and a workbook URL, open that exact workbook/run and visually inspect the screenshot-gallery tab (dataset `visual-evidence`). Only after confirming the image objects are visible and legible should you run:

```bash
npm run acceptance:e2e -- RELIANCE --confirm-visible
```

The confirmation command consumes the pending report from the previous successful publish; it does not republish. If `outputs/acceptance/SYMBOL-pending-visibility.json` does not exist, `--confirm-visible` is expected to fail. Run a successful `--publish` first, then inspect that exact workbook run. Do not run another acquisition/export between inspection and confirmation. This is an operator attestation, not automated UI verification.

The acceptance runner disables automatic publishing for its internal pipeline commands. A live Google Sheets write is requested only with `--publish`. Command audits may be kept locally with a message that external publishing was suppressed; that message is not evidence of a successful publish. The runner never places trades.

## Acceptance appears stuck after “[sheets] step started”

**Known behavior:** the outer `scripts/with-google-sheets-step.ts` prints the start message, but `scripts/research-publishing-acceptance.ts` launches child commands with piped stdout/stderr and buffers the output until each child exits. Long-running acquisition, preparation or analysis can therefore leave the terminal quiet. A quiet terminal alone does not prove a deadlock.

1. Do not immediately launch a second acceptance/publishing run.
2. In a second PowerShell window, from the repository root, inspect matching processes:

   ```powershell
   Get-CimInstance Win32_Process |
     Where-Object {
       $_.Name -eq 'node.exe' -and
       $_.CommandLine -match 'research-publishing-acceptance|export-to-google-sheets|src[\\/]+index\.ts'
     } |
     Select-Object ProcessId, ParentProcessId, CreationDate, CommandLine |
     Format-List
   ```

3. If no matching process is listed, the command may already have exited or the filter may not match its invocation. Check the original terminal for a final error and inspect the newest report/audit files before retrying.
4. If a matching process remains, record its PID, command line and start time. Do not terminate unrelated Node processes (for example, Next.js, Playwright or MCP services).
5. If the process is still active, inspect the relevant source/data timestamps and CPU activity. Because output is buffered, allow the child to complete unless there is evidence it is genuinely stalled.
6. If the command fails, preserve its final stdout/stderr and local audit; fix the failing stage before rerunning.

The acceptance wrapper's current buffered-output behavior is a usability limitation. A future code fix should stream child stdout/stderr while retaining bounded diagnostic tails, and add a documented timeout/termination policy. Until that change is implemented and tested, do not claim the quiet-terminal problem is fixed.

## Screenshot failures

### Error: Blob too large

Likely causes include an old Apps Script deployment or invalid/oversized image payload.

1. Redeploy current `Code.gs` as a new Web App version.
2. Confirm `serviceVersion: "3"` with the doctor.
3. Inspect the optimized screenshot metadata.
4. Retry the export only after correcting the cause.

### Error: pixel limit exceeded

The receiver rejects images over 1,000,000 pixels. The exporter should normally resize to at most 900,000 pixels. Inspect the original and optimized dimensions and the export result before retrying.

### Status says pending while embedding says embedded

This indicates an old receiver or inconsistent previous export. The current receiver synchronizes the status fields and version 3 returns per-image `screenshotResults` and aggregate counts. Redeploy, run doctor, and generate a fresh export.

### Evidence section is empty

Check for `normalized/analysis-evidence-pack.json`. The exporter can fall back to `normalized/canonical-values.json` for deterministic facts and calculated metrics. If both are empty, the sheet must show missing evidence rather than fabricate rows.

### Analysis says NOT_READY

Do not bypass readiness merely to make the workbook look complete. Inspect missing required artifacts, source warnings, unresolved conflicts, data freshness and acquisition failures. A blocked readiness result should remain research-only/no-call.

## MarkItDown document ingestion

The deterministic ingestion step uses Microsoft's MarkItDown CLI to convert PDF, Word, Excel, PowerPoint, HTML, text and CSV files into Markdown. MarkItDown is a Python dependency; installing the Node dependencies alone does not install it. A missing package can leave an individual document unconverted while the rest of ingestion continues, so inspect the ingestion report rather than assuming every document was parsed.

Install the repository's declared format-specific dependency into the Python environment used by the pipeline. From the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-markitdown.txt
.\.venv\Scripts\python.exe -m pip show markitdown
markitdown --version
npm run markitdown:doctor
```

The requirements file pins MarkItDown and includes PDF, DOCX, PPTX, XLSX and XLS format extras without installing unrelated optional integrations. The currently supported package release accepts Python 3.10–3.14. If the project's Python environment is different, create or select a supported virtual environment and ensure its `Scripts` directory appears first on `PATH`.

If the doctor fails, check which executable PowerShell resolves and whether it belongs to the intended environment:

```powershell
Get-Command python, py, markitdown -ErrorAction SilentlyContinue |
  Select-Object Name, Source
.\.venv\Scripts\python.exe -m pip show markitdown
```

Do not rerun a full stock acquisition just to test installation. First get `npm run markitdown:doctor` passing. Then test conversion of one existing PDF to a temporary Markdown file and inspect the resulting text. Finally, rerun only the affected deterministic preparation/ingestion step and confirm the annual-report conversion failure is gone in its report. Preserve the existing `research/SYMBOL` source artifacts; do not use `--replace-existing` for this repair.

The current `markitdown:doctor` converts a temporary text file and verifies that representative Unicode characters survive a UTF-8 round trip. It also converts a small synthetic PDF and checks for expected extracted text. Passing the doctor verifies the configured CLI and PDF extra, but a real report should still be spot-checked before relying on its extracted financial tables.

#### Windows CMD: test one existing PDF without touching research artifacts

Run from the repository root and replace the example `PDF` value with the path to an existing PDF. The output is written to the Windows temporary directory.

```bat
set "PDF=%CD%\\research\\SYMBOL\\raw\\path\\report.pdf"
set "OUT=%TEMP%\\markitdown-report-test.md"
..venv\Scripts\python.exe -m markitdown "%PDF%" -o "%OUT%"
if errorlevel 1 exit /b %ERRORLEVEL%
dir "%OUT%"
powershell -NoProfile -Command "$p=$env:TEMP+'\\markitdown-report-test.md'; $s=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); 'Characters: '+$s.Length; 'Replacement characters: '+([regex]::Matches($s,[char]0xFFFD)).Count; $s.Substring(0,[Math]::Min(500,$s.Length))"
```

A zero replacement-character count and readable text are useful encoding checks, not proof that every page or table was extracted accurately. Search for expected statement headings and validate important values, reporting periods and units separately. Do not rerun acquisition solely to test conversion.

## Local-path leakage

Published rows must never expose local filesystem paths. The sanitizer handles path-valued fields and paths embedded in strings/serialized data. If a path appears in the workbook, treat it as a publishing bug and add a regression test before changing the sanitizer.

## Deployment rule

GitHub source and Apps Script deployment are separate.

After changing `Code.gs`:

1. Deploy a new Web App version.
2. Run `npm run sheets:doctor`.
3. Export a new run.
4. Inspect the workbook, including screenshots.

## Recovery philosophy

The local research artifacts are the source of truth. If Google Sheets fails, preserve local artifacts and command reports, fix the publishing layer, then retry the export. Do not rerun acquisition unnecessarily just because publication failed.
