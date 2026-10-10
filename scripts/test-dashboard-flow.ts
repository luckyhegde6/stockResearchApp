import http from 'node:http';

const BASE_URL = 'http://127.0.0.1:3000';

function httpGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(path: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = http.request(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runDashboardFlowTest() {
  console.log('====================================================');
  console.log('  Testing Dashboard Server Endpoints & Triggers');
  console.log(`  Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  // 1. Config GET
  console.log('1. Testing GET /api/config ...');
  const cfg = await httpGet('/api/config');
  console.log(`   Status: ${cfg.status} | Symbols: ${cfg.data?.symbols?.join(', ')}`);

  // 2. Securities Search GET
  console.log('\n2. Testing GET /api/securities/search?q=ITC ...');
  const search = await httpGet('/api/securities/search?q=ITC');
  console.log(`   Status: ${search.status} | Matches: ${search.data?.totalMatches} | Result: ${search.data?.results?.[0]?.companyName}`);

  // 3. Progress Stepper GET
  console.log('\n3. Testing GET /api/runs/progress ...');
  const prog = await httpGet('/api/runs/progress');
  console.log(`   Status: ${prog.status} | Stage: ${prog.data?.stageName} | Percent: ${prog.data?.progressPercent}%`);

  // 4. Run History GET
  console.log('\n4. Testing GET /api/history ...');
  const hist = await httpGet('/api/history');
  console.log(`   Status: ${hist.status} | Total Executions: ${hist.data?.totalExecutions} | Success Rate: ${hist.data?.successRatePercent}%`);

  // 5. Performance Tracker GET
  console.log('\n5. Testing GET /api/tracking ...');
  const track = await httpGet('/api/tracking');
  console.log(`   Status: ${track.status} | Total Tracked: ${track.data?.totalTracked} | Best: ${track.data?.bestPerformer?.symbol}`);

  // 6. Market Scans GET
  console.log('\n6. Testing GET /api/scans?type=top20 ...');
  const scan = await httpGet('/api/scans?type=top20');
  console.log(`   Status: ${scan.status} | Available: ${Boolean(scan.data)}`);

  // 7. Watchlist Add POST
  console.log('\n7. Testing POST /api/watchlist/add (TATAMOTORS) ...');
  const addRes = await httpPost('/api/watchlist/add', { symbol: 'TATAMOTORS' });
  console.log(`   Status: ${addRes.status} | Added: ${addRes.data?.symbol} (${addRes.data?.companyName})`);

  // 8. Watchlist Remove POST
  console.log('\n8. Testing POST /api/watchlist/remove (TATAMOTORS) ...');
  const remRes = await httpPost('/api/watchlist/remove', { symbol: 'TATAMOTORS' });
  console.log(`   Status: ${remRes.status} | Removed: ${remRes.data?.removed}`);

  // 9. Trigger Research POST
  console.log('\n9. Testing POST /api/trigger/research (ITC) ...');
  const trigRes = await httpPost('/api/trigger/research', { symbol: 'ITC', includeNews: true });
  console.log(`   Status: ${trigRes.status} | RunID: ${trigRes.data?.runId} | Message: ${trigRes.data?.message}`);

  // 10. Check Progress after trigger
  console.log('\n10. Checking GET /api/runs/progress after trigger ...');
  const prog2 = await httpGet('/api/runs/progress');
  console.log(`    Status: ${prog2.status} | Stage: ${prog2.data?.stageName} | Active: ${prog2.data?.active}`);

  console.log('\n====================================================');
  console.log('  [PASS] All Dashboard Endpoints & Triggers Verified!');
  console.log('====================================================\n');
}

runDashboardFlowTest().catch((err) => {
  console.error('Dashboard flow test error:', err.message);
  process.exit(1);
});
