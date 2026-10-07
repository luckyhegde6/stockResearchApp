import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { loadAppConfig, saveAppConfig } from './lib/config-manager.js';
import { loadNseEquityUniverse, resolveNseSecurity } from './lib/nse-securities.js';
import { loadPerformanceTracker, recordScannedStockList, updatePricesAndPerformance } from './lib/performance-tracker.js';
import { loadRunHistory, recordRunStart, recordRunComplete, getActiveProgress } from './lib/run-history.js';
import { launchResearchProcess, launchBatchResearchProcess, launchScanProcess, launchAnalyzeProcess } from './lib/process-launcher.js';
import { renderLayaReportMarkdown, LayaDecisionReport } from './lib/laya-decision-engine.js';
import { runStockDecisions } from './lib/laya-stock-questions.js';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');

async function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
  }
}

export async function startDashboardServer() {
  const config = await loadAppConfig();
  const port = config.server.port || 3000;
  const host = config.server.host || '127.0.0.1';

  let cachedUniverse: any[] = [];
  try {
    cachedUniverse = await loadNseEquityUniverse(ROOT);
  } catch (err) {
    console.warn('[SERVER] Could not pre-load NSE Equity Universe:', err);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Static Assets
    if (pathname === '/' || pathname === '/index.html') {
      return serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
    }

    // API: Config Read / Update
    if (pathname === '/api/config') {
      if (req.method === 'GET') {
        const currentConfig = await loadAppConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentConfig, null, 2));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            await saveAppConfig(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', message: 'Configuration saved successfully' }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }
    }

    // API: Trigger Actions
    if (pathname.startsWith('/api/trigger/')) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};

          if (pathname === '/api/trigger/research') {
            const result = await launchResearchProcess(payload.symbol || 'ITC', {
              includeNews: payload.includeNews ?? true,
              includeChartink: payload.includeChartink ?? false,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }

          if (pathname === '/api/trigger/batch') {
            const currentConfig = await loadAppConfig();
            const symbols = payload.symbols || currentConfig.symbols;
            const result = await launchBatchResearchProcess(symbols);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }

          if (pathname === '/api/trigger/scan') {
            const result = await launchScanProcess(payload.scanType || 'top20');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }

          if (pathname === '/api/trigger/analyze') {
            const result = await launchAnalyzeProcess(payload.symbol || 'ITC');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }

          if (pathname === '/api/trigger/laya') {
            const ticker = (payload.symbol || 'ITC').toUpperCase();
            const packPath = path.join(ROOT, 'research', ticker, 'normalized', 'analysis-evidence-pack.json');
            try {
              const packRaw = await readFile(packPath, 'utf8');
              const pack = JSON.parse(packRaw);
              const decisions = runStockDecisions(ticker, pack);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', ticker, decisions }));
            } catch (e: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Could not run Laya for ${ticker}: ${e.message}` }));
            }
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown trigger endpoint' }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Trigger failed' }));
        }
      });
      return;
    }

    // API: Symbol Search against NSE Master
    if (pathname === '/api/securities/search') {
      const q = (url.searchParams.get('q') || '').trim().toUpperCase();
      if (!q) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results: [] }));
        return;
      }
      const matched = cachedUniverse
        .filter((r) => r.symbol.startsWith(q) || r.companyName.toUpperCase().includes(q))
        .slice(0, 15)
        .map((r) => ({
          symbol: r.symbol,
          companyName: r.companyName,
          series: r.series,
          isin: r.isin,
          preferred: r.preferredForStockResearch,
        }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query: q, totalMatches: matched.length, results: matched }));
      return;
    }

    // API: Watchlist Add
    if (pathname === '/api/watchlist/add' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { symbol } = JSON.parse(body);
          if (!symbol) throw new Error('Symbol parameter is required');

          const resolution = resolveNseSecurity(symbol, cachedUniverse);
          if (!resolution.record) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: `Invalid NSE Symbol: ${symbol}`,
              suggestions: resolution.suggestions.map((s) => `${s.symbol} (${s.companyName})`),
            }));
            return;
          }

          const currentConfig = await loadAppConfig();
          const targetSym = resolution.record.symbol;
          if (!currentConfig.symbols.includes(targetSym)) {
            currentConfig.symbols.push(targetSym);
            await saveAppConfig(currentConfig);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            symbol: targetSym,
            companyName: resolution.record.companyName,
            symbols: currentConfig.symbols,
          }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Invalid payload' }));
        }
      });
      return;
    }

    // API: Watchlist Remove
    if (pathname === '/api/watchlist/remove' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { symbol } = JSON.parse(body);
          if (!symbol) throw new Error('Symbol parameter is required');

          const currentConfig = await loadAppConfig();
          const targetSym = symbol.trim().toUpperCase();
          currentConfig.symbols = currentConfig.symbols.filter((s) => s.toUpperCase() !== targetSym);
          await saveAppConfig(currentConfig);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            removed: targetSym,
            symbols: currentConfig.symbols,
          }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Invalid payload' }));
        }
      });
      return;
    }

    // API: Performance Tracker
    if (pathname === '/api/tracking') {
      if (req.method === 'GET') {
        const report = await loadPerformanceTracker();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(report, null, 2));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { action, scanType, stocks, priceMap } = JSON.parse(body);
            if (action === 'record') {
              const updated = await recordScannedStockList(scanType || 'manual-scan', stocks || []);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(updated));
              return;
            }
            if (action === 'update') {
              const updated = await updatePricesAndPerformance(priceMap || {});
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(updated));
              return;
            }
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid tracking action' }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Invalid payload' }));
          }
        });
        return;
      }
    }

    // API: Run History Database
    if (pathname === '/api/history') {
      if (req.method === 'GET') {
        const historyDb = await loadRunHistory();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(historyDb, null, 2));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { action, runId, type, target, status, readinessScore, error } = JSON.parse(body);
            if (action === 'start') {
              const item = await recordRunStart(runId, type, target);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(item));
              return;
            }
            if (action === 'complete') {
              const updated = await recordRunComplete(runId, status, readinessScore, error);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(updated));
              return;
            }
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid history action' }));
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Invalid payload' }));
          }
        });
        return;
      }
    }

    // API: Active Run Progress Stepper
    if (pathname === '/api/runs/progress') {
      const progress = getActiveProgress();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(progress, null, 2));
      return;
    }

    // API: Research Runs Listing
    if (pathname === '/api/runs') {
      try {
        const researchDir = path.join(ROOT, 'research');
        const entries = await readdir(researchDir);
        const symbols: string[] = [];
        const ignored = new Set(['history', 'chartink', 'market-screens', 'scans', 'debug', 'normalized', 'derived']);
        for (const entry of entries) {
          if (ignored.has(entry.toLowerCase())) continue;
          const s = await stat(path.join(researchDir, entry)).catch(() => null);
          if (s && s.isDirectory()) symbols.push(entry.toUpperCase());
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: symbols.length, symbols: symbols.sort() }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: 0, symbols: [] }));
      }
      return;
    }

    // API: Results per Symbol
    if (pathname.startsWith('/api/results/')) {
      const symbol = pathname.replace('/api/results/', '').trim().toUpperCase();
      const rDir = path.join(ROOT, 'research', symbol);
      try {
        const canonical = await readFile(path.join(rDir, 'normalized', 'canonical-values.json'), 'utf8')
          .catch(() => readFile(path.join(rDir, 'derived', 'CANONICAL_FACTS.json'), 'utf8'))
          .then(JSON.parse).catch(() => null);
        const readiness = await readFile(path.join(rDir, 'analysis-readiness.json'), 'utf8').then(JSON.parse).catch(() => null);
        const valuation = await readFile(path.join(rDir, 'normalized', 'valuation.json'), 'utf8').then(JSON.parse).catch(() => null);
        const technicals = await readFile(path.join(rDir, 'normalized', 'technicals.json'), 'utf8').then(JSON.parse).catch(() => null);
        const financials = await readFile(path.join(rDir, 'normalized', 'financials.json'), 'utf8').then(JSON.parse).catch(() => null);
        const sourceHealth = await readFile(path.join(rDir, 'source-health.json'), 'utf8').then(JSON.parse).catch(() => null);
        const manifest = await readFile(path.join(rDir, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => null);

        if (!canonical && !readiness && !manifest) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `No research data found for ${symbol}` }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          symbol,
          canonical,
          readiness,
          valuation,
          technicals,
          financials,
          sourceHealth,
          manifestSummary: manifest ? {
            acquiredAt: manifest.generatedAt || manifest.acquiredAt,
            companyName: manifest.companyName || manifest.name,
            sources: Object.keys(manifest.sources || {})
          } : null
        }, null, 2));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // API: Market Scans
    if (pathname === '/api/scans') {
      const scanType = url.searchParams.get('type') || 'chartink-top20';
      let targetFile = path.join(ROOT, 'scans', 'chartink-market-scans.json');
      if (scanType === '52w' || scanType === 'nse-52week-high') targetFile = path.join(ROOT, 'scans', 'nse-52week-high.json');
      if (scanType === 'top20' || scanType === 'chartink-top20') targetFile = path.join(ROOT, 'scans', 'chartink-top20.json');
      return serveFile(res, targetFile, 'application/json');
    }

    // API: Laya Decision Engine — GET /api/laya/:ticker
    const layaMatch = pathname.match(/^\/api\/laya\/([A-Z0-9&-]{1,20})$/i);
    if (layaMatch && req.method === 'GET') {
      const ticker = layaMatch[1].toUpperCase();
      const rDir = path.join(ROOT, 'research', ticker);
      const packPath = path.join(rDir, 'normalized', 'analysis-evidence-pack.json');
      try {
        let packRaw: string | null = null;
        try {
          packRaw = await readFile(packPath, 'utf8');
        } catch {
          // If pack file missing, try auto-synthesizing via writeAnalysisEvidencePack
          const manifestPath = path.join(rDir, 'manifest.json');
          const manifestRaw = await readFile(manifestPath, 'utf8').catch(() => null);
          if (manifestRaw) {
            const manifest = JSON.parse(manifestRaw);
            const { writeAnalysisEvidencePack } = await import('./lib/analysis-evidence-pack.js');
            const resPack = await writeAnalysisEvidencePack(rDir, manifest);
            packRaw = JSON.stringify(resPack.pack);
          }
        }

        if (!packRaw) {
          throw Object.assign(new Error(`No evidence pack or manifest found for ${ticker}`), { code: 'ENOENT' });
        }

        const pack = JSON.parse(packRaw);
        const decisions = runStockDecisions(ticker, pack);
        const summary = {
          action:           (decisions['action_recommendation']?.answer as any)?.choice ?? 'Insufficient-Data',
          actionConfidence: (decisions['action_recommendation']?.answer as any)?.confidence ?? 0,
          trendDirection:   (decisions['trend_direction']?.answer as any)?.choice ?? 'Mixed',
          fundamentalScore: (decisions['fundamental_quality']?.answer as any)?.level ?? 0,
          valuationStance:  (decisions['valuation_stance']?.answer as any)?.choice ?? 'Indeterminate',
          momentumLevel:    (decisions['momentum_strength']?.answer as any)?.level ?? 0,
          newsRisk:         (decisions['news_risk']?.answer as any)?.value ?? null,
          scanConviction:   (decisions['scan_conviction']?.answer as any)?.value ?? null,
          dataQualityLevel: (decisions['data_quality_gate']?.answer as any)?.level ?? 0
        };
        const report: LayaDecisionReport = {
          schema_version: '1.0', ticker, generatedAt: new Date().toISOString(),
          deterministic: true, llmUsed: false, modelSource: 'laya-js-rule-engine',
          decisions, summary
        };
        const format = url.searchParams.get('format') || 'json';
        if (format === 'markdown') {
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(renderLayaReportMarkdown(report));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(report, null, 2));
        }
      } catch (err: any) {
        const notFound = err?.code === 'ENOENT';
        res.writeHead(notFound ? 404 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: notFound
            ? `No research data found for ${ticker}. Run research pipeline first.`
            : `Failed to run Laya decisions: ${err.message}`
        }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route not found' }));
  });

  server.listen(port, host, () => {
    console.log('====================================================');
    console.log(`  Stock Research Control Center Server Active`);
    console.log(`  Dashboard URL : http://${host}:${port}`);
    console.log(`  Config File   : config/config.json`);
    console.log('====================================================');
  });
}

if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js')) && !process.argv[1].includes('test')) {
  startDashboardServer().catch((err) => {
    console.error('Fatal error launching dashboard server:', err);
    process.exit(1);
  });
}
