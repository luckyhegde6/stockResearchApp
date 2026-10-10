import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const [server, html, launcher, publisher, index, laya, exporter, wrapper, packageSource, doctor, appsScript] = await Promise.all([
  readFile(path.join(root, 'src', 'server.ts'), 'utf8'),
  readFile(path.join(root, 'public', 'index.html'), 'utf8'),
  readFile(path.join(root, 'src', 'lib', 'process-launcher.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'lib', 'google-sheets-publish.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'index.ts'), 'utf8'),
  readFile(path.join(root, 'scripts', 'laya-decision-run.ts'), 'utf8'),
  readFile(path.join(root, 'scripts', 'export-to-google-sheets.ts'), 'utf8'),
  readFile(path.join(root, 'scripts', 'with-google-sheets-step.ts'), 'utf8'),
  readFile(path.join(root, 'package.json'), 'utf8'),
  readFile(path.join(root, 'scripts', 'google-sheets-doctor.ts'), 'utf8'),
  readFile(path.join(root, 'integrations', 'google-sheets', 'Code.gs'), 'utf8'),
]);

assert(server.includes("pathname === '/api/sheets/status'"), 'Dashboard must expose GET /api/sheets/status');
assert(server.includes("pathname === '/api/sheets/sync'"), 'Dashboard must expose POST /api/sheets/sync');
assert(server.includes('resolveGoogleSheetsExportFile(kind, ROOT)'), 'Dashboard scan export must resolve the newest scan artifact');
assert(server.includes('Sheets sync is only available to a local dashboard origin.'), 'Dashboard publish endpoint must reject non-local browser origins');

assert(html.includes("switchTab('sheets')"), 'Dashboard navigation must include Google Sheets Sync');
assert(html.includes('id="tab-sheets"'), 'Dashboard must render the Google Sheets Sync tab');
assert(html.includes('id="sheets-live-pill"'), 'Dashboard must show the Google Sheets step in the progress banner');
assert(html.includes('id="sheets-step-pill"'), 'Dashboard must include Google Sheets as the sixth pipeline stage');
assert(html.includes('6. Publishing to Sheets'), 'Dashboard must show publishing as an explicit stepper state');
assert(html.includes('function refreshSheetsStatus()'), 'Dashboard must poll and render sync status');
assert(html.includes('setInterval(refreshSheetsStatus, 2500);'), 'Dashboard must keep sync status fresh');
assert(html.includes('function triggerSheetsSync()'), 'Dashboard must support manual publish/retry');
assert(html.includes("fetch('/api/trigger/laya'"), 'Run Laya Decisions button must use the publishing-aware endpoint');
assert(html.includes('GOOGLE_SHEETS_WEBHOOK_TOKEN'), 'Dashboard must explain token configuration without displaying the secret');

assert(publisher.includes('google-sheets-sync-status.json'), 'Publish state must be persisted for dashboard polling');
assert(publisher.includes('announceGoogleSheetsStep'), 'Publisher must track the pre-publication stage');
assert(publisher.includes("'not_configured'"), 'Missing credentials must be surfaced explicitly');
assert(launcher.includes("beginGoogleSheetsCommandStep('dashboard:research'"), 'Single research runs must expose the Sheets step');
assert(launcher.includes("beginGoogleSheetsCommandStep('dashboard:batch-research'"), 'Batch research must expose the Sheets step');
assert(launcher.includes('beginGoogleSheetsCommandStep(\`dashboard:market-scan:\${scanType}\`'), 'Market scans must expose the Sheets step');
assert(launcher.includes("beginGoogleSheetsCommandStep('dashboard:analysis'"), 'Analysis runs must expose the Sheets step');
assert(launcher.includes('makeSheetsStepFinalizer(sheetsStep)'), 'Every dashboard-launched process must finalize its Sheets step exactly once');
assert(index.includes("publishDatasetFile('chartinkScan'"), 'Chartink market scan commands must publish their generated index');
assert(index.includes("publishDatasetFile('nse52w'"), 'NSE 52-week-high commands must publish their normalized result');
assert(index.includes("case 'screener-screens':"), 'Screener shortcut must remain available');
assert(index.includes("publishDatasetFile('screenerScan'"), 'Both Screener command aliases must publish their result index');
assert(index.includes("publishDatasetFile('tijoriScan'"), 'Tijori market-screen commands must publish their result index');

assert(index.includes("publishAfterPipelineRun('research'"), 'CLI research must auto-publish its evidence');
assert(index.includes("publishAfterPipelineRun('analysis'"), 'CLI analysis must auto-publish its validated analysis');
assert(laya.includes("publishAfterPipelineRun('laya'"), 'CLI Laya decisions must auto-publish');
assert(exporter.includes("kind === 'laya'"), 'Laya export must resolve its generated JSON by default');
assert(wrapper.includes('beginGoogleSheetsCommandStep'), 'Non-central npm commands must use the universal Sheets lifecycle wrapper');
assert(wrapper.includes('completeGoogleSheetsCommandStep'), 'Every wrapped process must finalize its Sheets status after exit');

assert(publisher.includes("spawn(process.execPath, [tsxCli, ...args]"), 'Sheets publisher must launch TSX directly through Node');
assert(publisher.includes('shell: false'), 'Sheets publisher must not spawn npx through a shell on Windows');
assert(exporter.includes('returned HTTP') && exporter.includes('HTML'), 'Exporter must identify HTML error pages without dumping full HTML');
assert(exporter.includes("chromium.launch({ headless: true })"), 'Screenshot exporter must use the installed Playwright Chromium to resize images');
assert(exporter.includes("const pixelLimit = 900_000"), 'Screenshot exporter must stay below Apps Script one-million-pixel image ceiling');
assert(exporter.includes("canvas.toDataURL('image/jpeg', quality)"), 'Screenshot exporter must re-encode images to JPEG before upload');
assert(exporter.includes('GOOGLE_SHEETS_MAX_SCREENSHOT_SOURCE_BYTES'), 'Screenshot exporter must distinguish source-file caps from compressed upload caps');
assert(exporter.includes("mimeType: 'image/jpeg'"), 'Compressed screenshot attachments must declare JPEG MIME type');

assert(appsScript.includes('screenshotErrors: screenshotResult.errors'), 'Apps Script must return per-image embed errors for screenshot troubleshooting');
assert(appsScript.includes("result.errors.push({") && appsScript.includes("fileName: String(item.fileName || 'unknown')"), 'Apps Script must identify each screenshot that failed to embed');

assert(doctor.includes("method: 'GET'") && doctor.includes('stock-research-sheet-sink'), 'Sheets doctor must verify the Apps Script GET health response');
assert(doctor.includes("parsedUrl.pathname") && doctor.includes("DEPLOYMENT_ID/exec"), 'Sheets doctor must validate the deployed /exec endpoint');
assert(wrapper.includes("publishAudit: args.includes('--publish-audit')"), 'Wrapper must keep command-run audit tabs disabled unless explicitly requested');
assert(publisher.includes('publishAudit: options.publishAudit ?? false'), 'Command-run audit publishing must remain disabled by default');
assert(appsScript.includes('cleanupLegacyManagedTabs_'), 'Apps Script must clean previously generated split tabs and command-run tabs');
assert(!appsScript.includes("const name = '_EXPORT_LOG'"), 'Apps Script must not create an _EXPORT_LOG sheet');
assert(appsScript.includes('sanitizeRowsForSheet_'), 'Apps Script must prevent local paths from being written to the workbook');

assert(index.includes('beginGoogleSheetsCommandStep'), 'Every central CLI command must announce the Sheets step');
assert(index.includes('completeGoogleSheetsCommandStep(commandStep'), 'Every central CLI command must finalize the Sheets step');
const packageScripts = JSON.parse(packageSource).scripts as Record<string, string>;
assert(packageScripts['sheets:doctor']?.includes('--no-publish-audit'), 'Sheets doctor must not trigger a second POST while diagnosing the webhook');
for (const [name, command] of Object.entries(packageScripts)) {
  const handledByCentralCli = command.includes('src/index.ts');
  const handledByWrapper = command.includes('scripts/with-google-sheets-step.ts');
  assert(handledByCentralCli || handledByWrapper, `npm script "${name}" bypasses the shared Sheets command lifecycle`);
}
assert(html.includes("running: 'PROCESS RUNNING'"), 'Dashboard must show running command/process steps');

const smoke = spawnSync('npx', [
  'tsx', path.join(root, 'scripts', 'with-google-sheets-step.ts'),
  '--name', 'test:universal-wrapper-smoke',
  '--exec', 'node', '--', '--version',
], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  env: {
    ...process.env,
    GOOGLE_SHEETS_AUTO_EXPORT: 'false',
    GOOGLE_SHEETS_WEBHOOK_URL: '',
    GOOGLE_SHEETS_WEBHOOK_TOKEN: '',
  },
});
assert(smoke.status === 0, 'Universal wrapper must preserve child exit status for a successful command');
assert((String(smoke.stdout || '') + String(smoke.stderr || '')).includes('[sheets]'), 'Wrapper must report its Sheets step');
const syncState = JSON.parse(await readFile(path.join(root, 'outputs', 'google-sheets-sync-status.json'), 'utf8'));
assert(
  syncState.recentRuns.some((run: any) => run.symbol === 'TEST:UNIVERSAL-WRAPPER-SMOKE' && run.status === 'skipped'),
  'Wrapper must persist final Sheets status when automatic publishing is disabled',
);


console.log(JSON.stringify({
  ok: true,
  covered: [
    'dashboard endpoints',
    'visible sync tab and global status strip',
    'single, batch, scan, analysis and Laya trigger hooks',
    'CLI auto-publishing',
    'local-origin protection',
    'safe configuration status',
  ],
}, null, 2));
