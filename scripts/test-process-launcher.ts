import { isProcessRunning, launchResearchProcess } from '../src/lib/process-launcher.js';
import { getActiveProgress } from '../src/lib/run-history.js';

async function testLauncher() {
  console.log('Testing Process Launcher engine...');
  console.log(`Is process running initially: ${isProcessRunning()}`);

  const res = await launchResearchProcess('ITC', { includeNews: true });
  console.log('Launch result status:', res.status);
  console.log('Launch message:', res.message);
  console.log('Active progress:', JSON.stringify(getActiveProgress(), null, 2));

  if (res.status === 'started' && isProcessRunning()) {
    console.log('\n[PASS] Process Launcher test completed successfully.');
  } else {
    throw new Error('Process Launcher test failed assertion checks.');
  }
}

testLauncher().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
