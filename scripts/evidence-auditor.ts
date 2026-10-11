import { auditResearchEvidence } from '../src/lib/evidence-auditor.js';

const symbol = process.argv[2];
if (!symbol || symbol.startsWith('-')) {
  throw new Error('Usage: npm run agents:audit -- SYMBOL');
}
const report = await auditResearchEvidence(symbol);
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'ready') process.exitCode = 1;
