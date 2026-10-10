import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapter = fs.readFileSync(path.join(root, 'src', 'adapters', 'nse.ts'), 'utf8');
const evidence = fs.readFileSync(path.join(root, 'src', 'lib', 'individual-stock-evidence.ts'), 'utf8');
const normalizer = fs.readFileSync(path.join(root, 'src', 'lib', 'nse-nextapi-normalizer.ts'), 'utf8');
const nextapi = fs.readFileSync(path.join(root, 'src', 'lib', 'nse-nextapi.ts'), 'utf8');

const checks = {
  quoteToFactsImported: /quoteToFacts/.test(adapter) && /from '\.\.\/lib\/nse-nextapi-normalizer\.js'/.test(adapter),
  catalystAnnouncementAwaited: /for\s*\(const r of await normalizeNextAnnouncements\(nextAnn\)\)/.test(evidence),
  quoteToFactsExported: /export function quoteToFacts/.test(normalizer),
  datewiseSnapshotIndex: /snapshots.*snapshotDate/s.test(nextapi) && /nse-api-index\.json/.test(nextapi),
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exitCode = 1;
