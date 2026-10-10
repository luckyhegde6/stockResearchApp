import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

async function main() {
  const ticker = (process.argv[2] || '').toUpperCase();
  if (!ticker) throw new Error('Usage: npm run quality -- RELIANCE');
  const dir = path.join(process.cwd(), 'research', ticker, 'raw', 'nse-api');
  const file = path.join(dir, 'historical-quality.json');
  const report = JSON.parse(await readFile(file, 'utf8'));
  console.log(JSON.stringify({
    ticker,
    status: report.qualityStatus,
    finalRows: report.finalRows,
    coverageRatio: report.coverageRatio,
    duplicateDates: report.duplicateDates,
    chronologyErrors: report.chronologyErrors,
    invalidOhlcRows: report.invalidOhlcRows,
    invalidVolumeRows: report.invalidVolumeRows,
    invalidDeliveryRows: report.invalidDeliveryRows,
    issueCount: report.issues?.length || 0,
    file,
  }, null, 2));
  if (report.qualityStatus === 'error') process.exitCode = 1;
}
main().catch(e => { console.error(e?.stack || e); process.exitCode = 1; });
