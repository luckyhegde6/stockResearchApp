import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { auditResearchEvidence } from '../src/lib/evidence-auditor.js';
import { extractScreenerCompany } from '../src/lib/evidence-contract.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'stockresearch-evidence-audit-'));
const research = path.join(root, 'research', 'ITC');
const put = async (file: string, value: unknown) => {
  const target = path.join(research, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2));
};
try {
  assert.equal(extractScreenerCompany({ text: 'HOME\nITC Limited' }), null, 'navigation text must not become company identity');
  assert.equal(extractScreenerCompany({ links: [{ name: 'HOME' }] }), null, 'generic nested name keys must not become company identity');
  assert.equal(extractScreenerCompany({ title: 'ITC Limited share price' }), 'ITC Limited share price');

  const manifest = {
    ticker: 'ITC',
    sourceArtifacts: [{ id: 'nse-quote', type: 'market_data', provider: 'NSE', status: 'ok', retrievedAt: '2026-10-10T00:00:00.000Z' }],
    dataGaps: [], warnings: [],
  };
  const readiness = { ready: true, blockingReasons: [], missingFiles: [], actionableWarnings: [], advisoryReasons: [], qualityStatus: 'ok', allowPartial: false };
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
  assert.deepEqual(ready.readiness?.actionableWarnings, []);

  const derivedManifest = structuredClone(manifest);
  derivedManifest.derivedArtifacts = [{ id: 'nse-equity-universe', type: 'derived_data', provider: 'NSE Securities Master', status: 'ok', retrievedAt: '2026-10-10T00:00:00.000Z' }];
  const derivedPack = structuredClone(pack);
  derivedPack.canonicalFacts.push({ id: 'identity-symbol', field: 'symbol', evidenceRole: 'source_fact', value: 'ITC', sourceArtifact: 'nse-equity-universe' });
  await put('manifest.json', derivedManifest);
  await put('normalized/analysis-evidence-pack.json', derivedPack);
  const derivedAudit = await auditResearchEvidence('ITC', { repositoryRoot: root });
  assert.equal(derivedAudit.status, 'ready', 'registered derived artifacts are valid provenance references');
  assert.equal(derivedAudit.counts.checkedClaims, 3);
  assert.ok(derivedAudit.checks.some((item) => item.id === 'claim-provenance' && item.severity === 'pass'));

  await put('manifest.json', manifest);
  await put('normalized/analysis-evidence-pack.json', pack);
  const brokenPack = structuredClone(pack);
  brokenPack.canonicalFacts[0].sourceArtifact = 'unknown-source';
  brokenPack.calculatedMetrics[0].method = '';
  await put('normalized/analysis-evidence-pack.json', brokenPack);
  const broken = await auditResearchEvidence('ITC', { repositoryRoot: root });
  assert.equal(broken.status, 'blocked');
  assert.ok(broken.issues.some((issue) => issue.includes('unknown sourceArtifact')));
  assert.ok(broken.issues.some((issue) => issue.includes('has no method')));

  await put('normalized/analysis-evidence-pack.json', pack);
  await put('analysis-readiness.json', { ready: false, blockingReasons: ['missing-required-files', 'actionable-source-warnings'], missingFiles: ['normalized/valuation.json'], actionableWarnings: ['Screener financial snapshot failed'], advisoryReasons: ['optional markdown missing'], qualityStatus: 'partial', allowPartial: false });
  const blocked = await auditResearchEvidence('ITC', { repositoryRoot: root });
  assert.equal(blocked.status, 'blocked', 'auditor must not override deterministic readiness');
  assert.equal(blocked.readiness?.ready, false);
  assert.deepEqual(blocked.readiness?.blockingReasons, ['missing-required-files', 'actionable-source-warnings']);
  assert.deepEqual(blocked.readiness?.actionableWarnings, ['Screener financial snapshot failed']);
  assert.deepEqual(blocked.readiness?.advisoryReasons, ['optional markdown missing']);
  assert.equal(blocked.readiness?.qualityStatus, 'partial');

  await assert.rejects(() => auditResearchEvidence('../../etc/passwd', { repositoryRoot: root }));
  const absent = await auditResearchEvidence('INFY', { repositoryRoot: root });
  assert.equal(absent.status, 'not_found');
  console.log('evidence auditor tests passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
