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

console.log(JSON.stringify({ ok: true, cases: 5 }, null, 2));
