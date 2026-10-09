import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TEST_SUITES = [
  'scripts/test-research-config.ts',
  'scripts/test-symbol-agnostic.ts',
  'scripts/test-source-classifier.ts',
  'scripts/test-source-precedence.ts',
  'scripts/test-canonical-evidence.ts',
  'scripts/test-analysis-readiness.ts',
  'scripts/test-evidence-readiness.ts',
  'scripts/test-evidence-completeness.ts',
  'scripts/test-evidence-quality.ts',
  'scripts/test-market-scan-quality.ts',
  'scripts/test-individual-stock-evidence.ts',
  'scripts/test-analysis-evidence-pack.ts',
  'scripts/test-analysis-orchestration.ts',
  'scripts/test-investment-reasoning-contract.ts',
  'scripts/test-google-sheets-transformers.ts',
  'scripts/test-reasoning-readiness-rules.ts',
  'scripts/test-chartink-feature-flag.ts',
  'scripts/test-chartink-no-results.ts',
  'scripts/test-chartink-scan-registry.ts',
  'scripts/test-nse-market-transformers.ts',
  'scripts/test-nse-securities.ts',
  'scripts/test-nse-nextapi-normalizers.ts',
  'scripts/test-news-sentiment.ts',
  'scripts/test-tradingview-url.ts',
  'scripts/test-tradingview-ui-surfaces.ts',
  'scripts/test-tradingview-ui-confirmation.ts',
  'scripts/test-tradingview-ui-surface-routing.ts',
  'scripts/test-tradingview-ui-direct-pages.ts',
];

interface TestResult {
  file: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

async function runTestSuite(file: string): Promise<TestResult> {
  const start = Date.now();
  const fullPath = path.join(ROOT, file);

  return new Promise<TestResult>((resolve) => {
    const child = spawn('npx', ['tsx', fullPath], {
      cwd: ROOT,
      shell: true,
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      if (code === 0) {
        resolve({ file, success: true, durationMs });
      } else {
        resolve({ file, success: false, durationMs, error: stderr.trim() || `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ file, success: false, durationMs: Date.now() - start, error: err.message });
    });
  });
}

async function runFixtureSetup() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', path.join(ROOT, 'scripts/ensure-test-research-fixture.ts')], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
    });
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Fixture setup failed with code ${code}`)));
    child.on('error', reject);
  });
}

async function runAll() {
  await runFixtureSetup();
  console.log('====================================================');
  console.log('  Stock Research Pipeline - Unified Test Suite Runner');
  console.log(`  Total Suites to Run: ${TEST_SUITES.length}`);
  console.log('====================================================\n');

  const results: TestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const suite of TEST_SUITES) {
    process.stdout.write(` Running ${suite.padEnd(45)} ... `);
    const res = await runTestSuite(suite);
    results.push(res);

    if (res.success) {
      passedCount += 1;
      console.log(`\x1b[32mPASS\x1b[0m (${res.durationMs}ms)`);
    } else {
      failedCount += 1;
      console.log(`\x1b[31mFAIL\x1b[0m (${res.durationMs}ms)`);
      if (res.error) {
        console.log(`   \x1b[33mError details:\x1b[0m ${res.error.split('\n')[0]}`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('  Test Suite Summary');
  console.log('====================================================');
  console.log(`  Total Suites : ${TEST_SUITES.length}`);
  console.log(`  Passed       : \x1b[32m${passedCount}\x1b[0m`);
  console.log(`  Failed       : ${failedCount > 0 ? `\x1b[31m${failedCount}\x1b[0m` : '0'}`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
