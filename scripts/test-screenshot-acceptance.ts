import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { assessScreenshotEmbedding } from '../src/lib/screenshot-acceptance.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const success = assessScreenshotEmbedding({
  ok: true,
  screenshotsEmbedded: 2,
  screenshotsFailed: 0,
  screenshotsSkipped: 0,
  screenshotResults: [
    { fileName: 'tradingview-1d.png', tabName: 'RELIANCE-research', rowIndex: 44, status: 'embedded_in_sheet' },
    { fileName: 'tradingview-fullchart-5y.png', tabName: 'RELIANCE-research', rowIndex: 45, status: 'embedded_in_sheet' },
  ],
}, ['tradingview-1d.png', 'tradingview-fullchart-5y.png']);
assert(success.ok, `Valid receiver outcomes should pass: ${success.errors.join('; ')}`);

const skipped = assessScreenshotEmbedding({
  screenshotsEmbedded: 0,
  screenshotsFailed: 0,
  screenshotsSkipped: 1,
  screenshotResults: [{ fileName: 'chart.png', tabName: 'RELIANCE-research', rowIndex: 44, status: 'skipped', reason: 'image_payload_missing' }],
}, ['chart.png']);
assert(!skipped.ok && skipped.skipped === 1, 'Skipped images must not pass strict screenshot acceptance.');
assert(skipped.errors.some(error => error.includes('image_payload_missing')), 'Skipped outcomes must surface their explicit reason.');

const aggregateMismatch = assessScreenshotEmbedding({
  screenshotsEmbedded: 1,
  screenshotsFailed: 0,
  screenshotsSkipped: 0,
  screenshotResults: [{ fileName: 'chart.png', tabName: 'RELIANCE-research', rowIndex: 44, status: 'embedded_in_sheet' }],
}, ['chart.png', 'second.png']);
assert(!aggregateMismatch.ok, 'Missing per-image outcomes must fail acceptance.');
assert(aggregateMismatch.errors.some(error => error.includes('second.png')), 'Missing expected screenshots must be named.');

const duplicate = assessScreenshotEmbedding({
  screenshotsEmbedded: 2,
  screenshotsFailed: 0,
  screenshotsSkipped: 0,
  screenshotResults: [
    { fileName: 'chart.png', tabName: 'tab', rowIndex: 2, status: 'embedded_in_sheet' },
    { fileName: 'chart.png', tabName: 'tab', rowIndex: 3, status: 'embedded_in_sheet' },
  ],
}, ['chart.png']);
assert(!duplicate.ok && duplicate.errors.some(error => error.includes('multiple outcomes')), 'Duplicate outcomes must fail acceptance.');

const legacyReceiver = assessScreenshotEmbedding({ ok: true, screenshotsEmbedded: 1 }, ['chart.png']);
assert(!legacyReceiver.ok, 'Old receiver responses without per-image outcomes must fail strict acceptance.');

const root = process.cwd();
const appsScript = await readFile(path.join(root, 'integrations', 'google-sheets', 'Code.gs'), 'utf8');
const exporter = await readFile(path.join(root, 'scripts', 'export-to-google-sheets.ts'), 'utf8');
assert(appsScript.includes('screenshotResults: screenshotResult.items'), 'Apps Script response must expose per-image outcomes.');
assert(appsScript.includes("status: 'embedded_in_sheet'"), 'Apps Script must report successful insertions per image.');
assert(appsScript.includes("status: 'skipped'") && appsScript.includes('image_payload_missing'), 'Apps Script must report skipped images with explicit reasons.');
assert(exporter.includes('--require-screenshot-embedding'), 'Exporter must expose a strict screenshot acceptance mode.');
assert(exporter.includes('assessScreenshotEmbedding(result'), 'Strict exporter mode must validate the receiver response.');

console.log(JSON.stringify({ ok: true, cases: 10, integrationContracts: 5 }, null, 2));
