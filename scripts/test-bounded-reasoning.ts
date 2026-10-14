import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runBoundedReasoning } from '../src/lib/bounded-reasoning.js';
import type { ModelGenerationRequest, ModelProvider } from '../src/lib/model-provider.js';

const repoRoot = process.cwd();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'stockresearch-bounded-reasoning-'));
try {
  await mkdir(path.join(tempRoot, '.agents', 'harness'), { recursive: true });
  await cp(
    path.join(repoRoot, '.agents', 'harness', 'agent-result.schema.json'),
    path.join(tempRoot, '.agents', 'harness', 'agent-result.schema.json'),
  );
  const auditPath = 'outputs/agent-runs/test-audit.jsonl';
  const makeResult = (agentId: string, status: 'complete' | 'partial' | 'blocked' | 'failed' = 'complete') => ({
    schema_version: '1.0',
    agent_id: agentId,
    run_id: `run-${agentId}`,
    symbol: 'RELIANCE',
    generated_at: '2026-10-15T00:00:00.000Z',
    status,
    summary: `Completed ${agentId} fixture step.`,
    claims: [{
      claim_id: `claim-${agentId}`,
      claim_type: 'sourced_fact',
      text: 'The supplied fixture artifact exists.',
      evidence_refs: ['artifact-1'],
    }],
    evidence_refs: [{
      id: 'artifact-1',
      kind: 'artifact',
      path: 'research/RELIANCE/manifest.json',
      as_of: '2026-10-14',
      retrieved_at: '2026-10-15T00:00:00.000Z',
    }],
    missing_data: [],
    conflicts: [],
    caveats: [],
    next_actions: [],
    validation: [{ check: 'fixture', status: 'pass' }],
  });

  const requests: ModelGenerationRequest[] = [];
  const outputs = [makeResult('evidence-auditor'), makeResult('decision-reviewer')];
  const provider: ModelProvider = {
    id: 'fixture-provider',
    generate: async (request) => {
      requests.push(request);
      return {
        content: JSON.stringify(outputs[(requests.length - 1) % outputs.length]),
        provider: 'fixture-provider',
        model: request.model,
      };
    },
  };
  const plan = [
    { id: 'audit', agentId: 'evidence-auditor', instruction: 'Inspect supplied evidence only.' },
    { id: 'review', agentId: 'decision-reviewer', instruction: 'Review the prior validated result.' },
  ];
  const result = await runBoundedReasoning({
    provider, model: 'fixture-model', task: 'Validate the bounded orchestration contract.',
    symbol: 'RELIANCE', steps: plan, maxSteps: 2, repositoryRoot: tempRoot, auditPath,
    now: () => new Date('2026-10-15T00:00:00.000Z'),
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.completedSteps, 2);
  assert.equal(result.steps.length, 2);
  assert.equal(result.result?.agent_id, 'decision-reviewer');
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages[1].content, /evidence-auditor/);
  assert.equal((await readFile(path.join(tempRoot, auditPath), 'utf8')).trim().split('\n').length, 2);

  await assert.rejects(() => runBoundedReasoning({
    provider, model: 'fixture-model', task: 'bad plan',
    steps: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, agentId: 'evidence-auditor', instruction: 'Inspect.' })),
    maxSteps: 5, repositoryRoot: tempRoot,
  }), /maxSteps must be an integer/);

  const blockedProvider: ModelProvider = {
    id: 'blocked-fixture',
    generate: async (request) => ({
      content: JSON.stringify(makeResult('evidence-auditor', 'blocked')),
      provider: 'blocked-fixture', model: request.model,
    }),
  };
  const blocked = await runBoundedReasoning({
    provider: blockedProvider, model: 'fixture', task: 'stop when blocked',
    steps: plan, maxSteps: 2, repositoryRoot: tempRoot, auditPath: 'outputs/agent-runs/blocked.jsonl',
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.completedSteps, 1);
  assert.equal(blocked.stopReason, 'step_blocked');

  const oversized = await runBoundedReasoning({
    provider, model: 'fixture', task: 'enforce output budget',
    steps: [plan[0]], maxSteps: 1, maxOutputBytes: 8, repositoryRoot: tempRoot,
    auditPath: 'outputs/agent-runs/oversized.jsonl',
  });
  assert.equal(oversized.status, 'failed');
  assert.equal(oversized.stopReason, 'budget_exhausted');

  const slowProvider: ModelProvider = {
    id: 'slow-fixture',
    generate: async () => new Promise((resolve) => setTimeout(() => resolve({
      content: JSON.stringify(makeResult('evidence-auditor')),
      provider: 'slow-fixture', model: 'fixture',
    }), 100)),
  };
  const timedOut = await runBoundedReasoning({
    provider: slowProvider, model: 'fixture', task: 'enforce timeout',
    steps: [plan[0]], maxSteps: 1, overallTimeoutMs: 10, repositoryRoot: tempRoot,
    auditPath: 'outputs/agent-runs/timeout.jsonl',
  });
  assert.equal(timedOut.status, 'failed');
  assert.equal(timedOut.stopReason, 'budget_exhausted');

  console.log('bounded reasoning tests passed');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
