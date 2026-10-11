import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { auditResearchEvidence } from '../src/lib/evidence-auditor.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'stockresearch-evidence-audit-'));
const research = path.join(root, 'research', 'ITC');
const put = async (file: string, value: unknown) => {
  const target = path.join(research, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2));
};
try {
  const manifest = {
    ticker: 'ITC',
    sourceArtifacts: [{ id: 'nse-quote', type: 'market_data', provider: 'NSE', status: 'ok', retrievedAt: '2026-10-10T00:00:00.000Z' }],
    dataGaps: [], warnings: [],
  };
  const readiness = { ready: true, blockingReasons: [], missingFiles: [] };
  const pack = {
    ticker: 'ITC',
    canonicalFacts: [{ id: 'price', field: 'lastPrice', evidenceRole: 'source_fact', value: 400, sourceArtifact: 'nse-quote' }],
    calculatedMetrics: [{ id: 'change', field: 'changePct', value: 1.2, method: '((current - previous) / previous) * 100', sourceArtifact: 'nse-quote' }],
    sourceFreshness: [{ id: 'nse-quote' }],
  };
  await put('manifest.json', manifest);
  await put('analysis-readiness.json', readiness);
  await put('evidence-quality.json', { status: 'complete' });
  await put('source-health.json', { overallStatus: 'healthy' });
  await put('normalized/analysis-evidence-pack.json', pack);

  const ready = await auditResearchEvidence('itc', { repositoryRoot: root, now: () => new Date('2026-10-11T00:00:00.000Z') });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.counts.sourceArtifacts, 1);
  assert.equal(ready.counts.checkedClaims, 2);
  assert.equal(ready.issues.length, 0);

  const brokenPack = structuredClone(pack);
  brokenPack.canonicalFacts[0].sourceArtifact = 'unknown-source';
  brokenPack.calculatedMetrics[0].method = '';
  await put('normalized/analysis-evidence-pack.json', brokenPack);
  const broken = await auditResearchEvidence('ITC', { repositoryRoot: root });
  assert.equal(broken.status, 'blocked');
  assert.ok(broken.issues.some((issue) => issue.includes('unknown sourceArtifact')));
  assert.ok(broken.issues.some((issue) => issue.includes('has no method')));

  await put('normalized/analysis-evidence-pack.json', pack);
  await put('analysis-readiness.json', { ready: false, blockingReasons: ['missing-required-files'], missingFiles: ['normalized/valuation.json'] });
  const blocked = await auditResearchEvidence('ITC', { repositoryRoot: root });
  assert.equal(blocked.status, 'blocked', 'auditor must not override deterministic readiness');
  assert.equal(blocked.readiness?.ready, false);
  assert.deepEqual(blocked.readiness?.blockingReasons, ['missing-required-files']);

  await assert.rejects(() => auditResearchEvidence('../../etc/passwd', { repositoryRoot: root }));
  const absent = await auditResearchEvidence('INFY', { repositoryRoot: root });
  assert.equal(absent.status, 'not_found');
  console.log('evidence auditor tests passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
