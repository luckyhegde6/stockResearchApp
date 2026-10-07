import { loadPerformanceTracker, recordScannedStockList, updatePricesAndPerformance } from '../src/lib/performance-tracker.js';

async function testTracker() {
  console.log('Testing Performance Tracker module...');
  const initial = await loadPerformanceTracker();
  console.log(`Initial total tracked: ${initial.totalTracked}`);

  const updated = await recordScannedStockList('test-scan', [
    { symbol: 'RELIANCE', companyName: 'Reliance Industries', price: 3000 },
    { symbol: 'TCS', companyName: 'Tata Consultancy Services', price: 4200 },
  ]);

  console.log(`Updated total tracked: ${updated.totalTracked}`);
  const refreshed = await updatePricesAndPerformance({
    RELIANCE: 3300, // +10% gain
    TCS: 4116,      // -2% loss
  });

  console.log(`Refreshed report status:`);
  console.log(`Total Gains: ${refreshed.totalGains}, Total Losses: ${refreshed.totalLosses}`);
  console.log(`Average Return: ${refreshed.averageReturnPercent}%`);
  console.log(`Best Performer: ${refreshed.bestPerformer?.symbol} (${refreshed.bestPerformer?.returnPercent}%)`);

  if (refreshed.totalTracked >= 4 && refreshed.bestPerformer) {
    console.log('\n[PASS] Performance Tracker test completed successfully.');
  } else {
    throw new Error('Performance Tracker test failed assertion checks.');
  }
}

testTracker().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
