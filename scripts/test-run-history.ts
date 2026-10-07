import { loadRunHistory, recordRunStart, recordRunComplete, getActiveProgress } from '../src/lib/run-history.js';

async function testHistory() {
  console.log('Testing Run History & Progress Module...');
  const initial = await loadRunHistory();
  console.log(`Initial executions: ${initial.totalExecutions}`);

  const runId = `test-run-${Date.now()}`;
  await recordRunStart(runId, 'individual_research', 'TCS');
  const active = getActiveProgress();
  console.log(`Active progress step: ${active.step}/5 - ${active.stageName}`);

  const completedDb = await recordRunComplete(runId, 'completed', 95);
  console.log(`Updated total executions: ${completedDb.totalExecutions}`);
  console.log(`Success rate: ${completedDb.successRatePercent}%`);
  console.log(`Average duration: ${completedDb.averageDurationSeconds}s`);

  if (completedDb.totalExecutions >= 6 && completedDb.successRatePercent > 0) {
    console.log('\n[PASS] Run History test completed successfully.');
  } else {
    throw new Error('Run History test assertion failed.');
  }
}

testHistory().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
