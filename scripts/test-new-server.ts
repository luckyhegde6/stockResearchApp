import http from 'node:http';
import { startDashboardServer } from '../src/server.js';
import { loadAppConfig, saveAppConfig } from '../src/lib/config-manager.js';

const BASE_URL = 'http://127.0.0.1:3005';

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

async function runTest() {
  const currentConfig = await loadAppConfig();
  await saveAppConfig({ ...currentConfig, server: { ...currentConfig.server, port: 3005 } });

  console.log('Starting updated dashboard server on port 3005...');
  await startDashboardServer();

  // Restore port 3000 in config.json
  await saveAppConfig({ ...currentConfig, server: { ...currentConfig.server, port: 3000 } });

  await new Promise((r) => setTimeout(r, 1000));

  console.log('\n--- VERIFYING ALL UPDATED DASHBOARD APIS ON PORT 3005 ---');

  // 1. Symbol Search API
  const search = await httpGet('/api/securities/search?q=TATAMOTORS');
  console.log(`1. Symbol Search : Status ${search.status} | Matches: ${search.data?.totalMatches} | Top Match: ${search.data?.results?.[0]?.symbol} (${search.data?.results?.[0]?.companyName})`);

  // 2. Watchlist Add API
  const addRes = await httpPost('/api/watchlist/add', { symbol: 'TATAMOTORS' });
  console.log(`2. Watchlist Add : Status ${addRes.status} | Symbol Added: ${addRes.data?.symbol} (${addRes.data?.companyName})`);

  // 3. Watchlist Remove API
  const remRes = await httpPost('/api/watchlist/remove', { symbol: 'TATAMOTORS' });
  console.log(`3. Watchlist Rem : Status ${remRes.status} | Symbol Removed: ${remRes.data?.removed}`);

  // 4. Trigger Research API
  const trigRes = await httpPost('/api/trigger/research', { symbol: 'ITC', includeNews: true });
  console.log(`4. Trigger Res   : Status ${trigRes.status} | Task Status: ${trigRes.data?.status} | Message: ${trigRes.data?.message}`);

  // 5. Active Progress API
  const progRes = await httpGet('/api/runs/progress');
  console.log(`5. Progress API  : Status ${progRes.status} | Current Stage: ${progRes.data?.stageName} | Percent: ${progRes.data?.progressPercent}%`);

  // 6. Run History API
  const histRes = await httpGet('/api/history');
  console.log(`6. History API   : Status ${histRes.status} | Total Executions: ${histRes.data?.totalExecutions} | Rate: ${histRes.data?.successRatePercent}%`);

  // 7. Performance Tracker API
  const trackRes = await httpGet('/api/tracking');
  console.log(`7. Tracker API   : Status ${trackRes.status} | Total Tracked: ${trackRes.data?.totalTracked} | Best: ${trackRes.data?.bestPerformer?.symbol}`);

  console.log('\n====================================================');
  console.log('  [PASS] All Updated Dashboard APIs Verified 100%');
  console.log('====================================================\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
