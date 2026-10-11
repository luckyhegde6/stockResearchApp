import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { inspectResearchEvidence, runAgentValidation, validateAgentResult } from '../src/lib/agent-harness.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'stockresearch-agent-harness-'));
try {
  await mkdir(path.join(root, '.agents', 'harness'), { recursive: true });
  await writeFile(
    path.join(root, '.agents', 'harness', 'agent-result.schema.json'),
    await readFile(path.resolve('.agents/harness/agent-result.schema.json'), 'utf8'),
  );

  const validResult = {
    schema_version: '1.0',
    agent_id: 'evidence-auditor',
    run_id: 'test-run-001',
    generated_at: '2026-10-11T00:00:00.000Z',
    status: 'complete',
    summary: 'Evidence pack inspected without modifying research artifacts.',
    claims: [{
      claim_id: 'claim-1',
      claim_type: 'sourced_fact',
      text: 'Source artifact exists for the claim.',
      evidence_refs: ['artifact-1'],
    }],
    evidence_refs: [{
      id: 'artifact-1',
      kind: 'artifact',
      path: 'research/ITC/manifest.json',
      as_of: '2026-10-10',
      retrieved_at: '2026-10-11T00:00:00.000Z',
    }],
    missing_data: [],
    conflicts: [],
    caveats: [],
    next_actions: [],
    validation: [{ check: 'schema', status: 'pass' }],
  };

  const valid = await validateAgentResult(validResult, { repositoryRoot: root });
  assert.equal(valid.valid, true, 'valid structured result should pass');

  const unsupportedFact = structuredClone(validResult);
  unsupportedFact.claims[0].evidence_refs = [];
  assert.equal((await validateAgentResult(unsupportedFact, { repositoryRoot: root })).valid, false, 'sourced fact without evidence should fail');

  const unknownRef = structuredClone(validResult);
  unknownRef.claims[0].evidence_refs = ['missing-ref'];
  assert.equal((await validateAgentResult(unknownRef, { repositoryRoot: root })).valid, false, 'unknown evidence reference should fail');

  const missingCalculationMethod = structuredClone(validResult);
  missingCalculationMethod.claims[0].claim_type = 'deterministic_calculation';
  missingCalculationMethod.claims[0].evidence_refs = ['artifact-1'];
  assert.equal((await validateAgentResult(missingCalculationMethod, { repositoryRoot: root })).valid, false, 'calculation without method should fail');

  const unknownAgent = await validateAgentResult(validResult, { repositoryRoot: root, allowedAgentIds: ['orchestrator'] });
  assert.equal(unknownAgent.valid, false, 'agent allow-list must be enforced');

  const huge = await validateAgentResult({ message: 'x'.repeat(600) }, { repositoryRoot: root, maxResultBytes: 128 });
  assert.equal(huge.valid, false, 'oversize result must fail closed');

  const parseError = await runAgentValidation('{bad json', { repositoryRoot: root, now: () => new Date('2026-10-11T00:00:00.000Z') });
  assert.equal(parseError.validation.valid, false);
  assert.equal(parseError.result, null);

  const audited = await runAgentValidation(validResult, {
    repositoryRoot: root,
    now: () => new Date('2026-10-11T00:00:00.000Z'),
    inputArtifacts: ['research/ITC/manifest.json'],
  });
  assert.equal(audited.validation.valid, true);
  assert.ok(audited.auditPath);
  const auditLines = (await readFile(audited.auditPath!, 'utf8')).trim().split('\n');
  assert.equal(auditLines.length, 1);
  const audit = JSON.parse(auditLines[0]);
  assert.equal(audit.agent_id, 'evidence-auditor');
  assert.equal(audit.status, 'complete');

  await mkdir(path.join(root, 'research', 'ITC', 'normalized'), { recursive: true });
  await writeFile(path.join(root, 'research', 'ITC', 'manifest.json'), JSON.stringify({
    ticker: 'ITC', runId: 'sample-run', generatedAt: '2026-10-10T00:00:00.000Z',
    acquisitionOnly: true, sourceArtifacts: [{ id: 'a' }], dataGaps: ['financial gap'], warnings: [],
  }));
  await writeFile(path.join(root, 'research', 'ITC', 'analysis-readiness.json'), JSON.stringify({
    ready: false, deterministic: true, blockingReasons: ['missing-required-files'], missingFiles: ['normalized/valuation.json'],
  }));
  const snapshot = await inspectResearchEvidence('itc', { repositoryRoot: root });
  assert.equal(snapshot.status, 'blocked_or_partial');
  assert.equal((snapshot.manifest as any).sourceArtifactCount, 1);
  assert.deepEqual((snapshot.readiness as any).blockingReasons, ['missing-required-files']);

  await assert.rejects(() => inspectResearchEvidence('../../etc/passwd', { repositoryRoot: root }));
  console.log('agent harness tests passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
