import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildAnalysisReadiness } from '../src/lib/analysis-readiness.js';
import type { ResearchManifest } from '../src/types/research.js';

const ticker = process.argv[2]?.trim().toUpperCase();

if (!ticker) {
  // The unified test runner invokes every test script without arguments.
  // Keep that invocation as a module smoke test; pass a ticker for live readiness evaluation.
  console.log('analysis-readiness module smoke test: run npm run test:analysis-readiness -- <TICKER> to evaluate a research directory');
} else {
  if (!/^[A-Z0-9._-]+$/.test(ticker)) {
    throw new Error('Ticker may contain only letters, numbers, dot, underscore, and hyphen.');
  }

  const researchDir = path.join(process.cwd(), 'research', ticker);
  const manifestPath = path.join(researchDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ResearchManifest;
  const report = await buildAnalysisReadiness(researchDir, manifest);

  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
