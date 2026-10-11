import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectResearchEvidence, runAgentValidation } from '../src/lib/agent-harness.js';

function usage(): never {
  throw new Error(
    'Usage: npm run agents:inspect -- SYMBOL | npm run agents:validate -- RESULT.json [--agent ID] [--symbol SYMBOL] [--task TYPE]',
  );
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];
if (command === 'inspect') {
  const symbol = process.argv[3];
  if (!symbol) usage();
  console.log(JSON.stringify(await inspectResearchEvidence(symbol), null, 2));
} else if (command === 'validate') {
  const file = process.argv[3];
  if (!file) usage();
  const root = process.cwd();
  const absoluteFile = path.resolve(root, file);
  if (absoluteFile !== root && !absoluteFile.startsWith(root + path.sep)) {
    throw new Error('Result file must be located within the repository root');
  }
  const input = await readFile(absoluteFile, 'utf8');
  const outcome = await runAgentValidation(input, {
    repositoryRoot: root,
    agentId: option('--agent'),
    symbol: option('--symbol'),
    taskType: option('--task') ?? 'cli-validation',
    inputArtifacts: [path.relative(root, absoluteFile)],
  });
  console.log(JSON.stringify({
    valid: outcome.validation.valid,
    issues: outcome.validation.issues,
    policyIssues: outcome.validation.policyIssues,
    auditPath: outcome.auditPath ? path.relative(root, outcome.auditPath) : null,
  }, null, 2));
  if (!outcome.validation.valid) process.exitCode = 1;
} else {
  usage();
}
