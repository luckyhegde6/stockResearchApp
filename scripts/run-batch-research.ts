import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadAppConfig } from '../src/lib/config-manager.js';

const ROOT = process.cwd();

async function runSingleStock(symbol: string): Promise<boolean> {
  const start = Date.now();
  console.log(`\n====================================================`);
  console.log(`  Starting Batch Research for: ${symbol}`);
  console.log(`====================================================`);

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'src/index.ts', 'research', symbol], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      const durationSec = Math.round((Date.now() - start) / 1000);
      if (code === 0) {
        console.log(`\x1b[32m[SUCCESS]\x1b[0m Research completed for ${symbol} in ${durationSec}s`);
        resolve(true);
      } else {
        console.log(`\x1b[31m[FAILED]\x1b[0m Research failed for ${symbol} (code ${code}) in ${durationSec}s`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.error(`[ERROR] Failed to launch research for ${symbol}:`, err.message);
      resolve(false);
    });
  });
}

async function runBatch() {
  const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const config = await loadAppConfig();
  const targetSymbols = cliArgs.length > 0 ? cliArgs : config.symbols;

  console.log('====================================================');
  console.log('  Stock Research Pipeline - Batch Research Runner');
  console.log(`  Target Symbols: ${targetSymbols.join(', ')}`);
  console.log('====================================================\n');

  const results: Record<string, boolean> = {};

  for (const sym of targetSymbols) {
    const ok = await runSingleStock(sym);
    results[sym] = ok;
  }

  console.log('\n====================================================');
  console.log('  Batch Execution Summary');
  console.log('====================================================');
  for (const [sym, ok] of Object.entries(results)) {
    console.log(`  ${sym.padEnd(15)} : ${ok ? '\x1b[32mSUCCESS\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}`);
  }
  console.log('====================================================\n');
}

runBatch().catch((err) => {
  console.error('Fatal error running batch research:', err);
  process.exit(1);
});
