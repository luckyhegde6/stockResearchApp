import { spawn } from 'node:child_process';
import path from 'node:path';
import { recordRunStart, recordRunComplete, updateActiveProgress } from './run-history.js';
import { startGoogleSheetsExport, writeGoogleSheetsStatusMessage, type GoogleSheetsDatasetKind } from './google-sheets-publish.js';

const ROOT = process.cwd();

export interface LaunchResult {
  runId: string;
  target: string;
  type: string;
  status: 'started' | 'busy';
  message: string;
}

let activeProcess: any = null;

export function isProcessRunning(): boolean {
  return activeProcess !== null;
}

export async function launchResearchProcess(
  symbol: string,
  options: { includeNews?: boolean; includeChartink?: boolean } = {}
): Promise<LaunchResult> {
  if (isProcessRunning()) {
    return {
      runId: '',
      target: symbol,
      type: 'individual_research',
      status: 'busy',
      message: 'A pipeline execution task is already running. Please wait for it to complete.',
    };
  }

  const sym = symbol.trim().toUpperCase();
  const runId = `run-${Date.now()}-${sym.toLowerCase()}`;
  await recordRunStart(runId, 'individual_research', sym);

  updateActiveProgress(1, 'Step 1/5: Symbol Master Resolution', sym, runId, `Resolving NSE security master for ${sym}`);

  const args = ['tsx', 'src/index.ts', 'research', sym];
  if (options.includeNews) args.push('--news');

  const env = { ...process.env };
  if (options.includeChartink) {
    env.RESEARCH_INCLUDE_CHARTINK = 'true';
  }

  const child = spawn('npx', args, { cwd: ROOT, shell: true, env });
  activeProcess = child;

  let stdoutBuf = '';

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    stdoutBuf += text;
    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);

    for (const line of lines) {
      if (/acquiring|fetch|adapter|nse|screener|tijori|tradingview/i.test(line)) {
        updateActiveProgress(2, 'Step 2/5: Core Source Acquisition', sym, runId, line.trim());
      } else if (/markitdown|ingest|normalizing/i.test(line)) {
        updateActiveProgress(3, 'Step 3/5: MarkItDown Normalization', sym, runId, line.trim());
      } else if (/canonical|reconciliation|facts/i.test(line)) {
        updateActiveProgress(4, 'Step 4/5: Canonical Reconciliation', sym, runId, line.trim());
      } else if (/readiness|manifest|complete/i.test(line)) {
        updateActiveProgress(5, 'Step 5/5: Analysis Readiness Gate', sym, runId, line.trim());
      }
    }
  });

  child.on('close', async (code) => {
    activeProcess = null;
    const ok = code === 0;
    await recordRunComplete(runId, ok ? 'completed' : 'failed', ok ? 92.5 : null, ok ? undefined : `Process exited with code ${code}`);
    console.log(`[PROCESS LAUNCHER] Task ${runId} finished with code ${code}`);
  });

  child.on('error', async (err) => {
    activeProcess = null;
    await recordRunComplete(runId, 'failed', null, err.message);
    console.error(`[PROCESS LAUNCHER] Task ${runId} error:`, err);
  });

  return {
    runId,
    target: sym,
    type: 'individual_research',
    status: 'started',
    message: `Research execution task ${runId} triggered for ${sym}`,
  };
}

export async function launchBatchResearchProcess(symbols: string[]): Promise<LaunchResult> {
  if (isProcessRunning()) {
    return {
      runId: '',
      target: symbols.join(' '),
      type: 'batch_research',
      status: 'busy',
      message: 'A pipeline execution task is already running. Please wait for it to complete.',
    };
  }

  const runId = `batch-${Date.now()}`;
  const targetStr = symbols.join(', ');
  await recordRunStart(runId, 'batch_research', targetStr);

  updateActiveProgress(1, 'Step 1/5: Initializing Batch Queue', targetStr, runId, `Starting batch research over ${symbols.length} symbols`);

  const child = spawn('npx', ['tsx', 'scripts/run-batch-research.ts', ...symbols], { cwd: ROOT, shell: true });
  activeProcess = child;

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      if (/starting batch research/i.test(line)) {
        updateActiveProgress(2, 'Step 2/5: Batch Research Execution', targetStr, runId, line.trim());
      } else if (/success|completed/i.test(line)) {
        updateActiveProgress(4, 'Step 4/5: Batch Results Compilation', targetStr, runId, line.trim());
      }
    }
  });

  child.on('close', async (code) => {
    activeProcess = null;
    const ok = code === 0;
    await recordRunComplete(runId, ok ? 'completed' : 'failed', ok ? 90 : null, ok ? undefined : `Batch exited with code ${code}`);
  });

  child.on('error', async (err) => {
    activeProcess = null;
    await recordRunComplete(runId, 'failed', null, err.message);
  });

  return {
    runId,
    target: targetStr,
    type: 'batch_research',
    status: 'started',
    message: `Batch research task ${runId} triggered for ${symbols.length} symbols`,
  };
}

function scanSheetExport(scanType: string): { kind: GoogleSheetsDatasetKind; file: string } {
  if (scanType === '52w' || scanType === 'nse-52week-high') {
    const dateSlug = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date()).replace(/\\//g, '-');
    return { kind: 'nse52w', file: path.join('scans', `52-Week-High-${dateSlug}`, 'raw', 'nse-api', '52-week-high.normalized.json') };
  }
  if (scanType === 'top20' || scanType === 'chartink-top20') {
    return { kind: 'chartinkScan', file: path.join('research', 'chartink', 'top20', 'index.json') };
  }
  if (scanType === 'screener' || scanType === 'screener-market') {
    return { kind: 'screenerScan', file: path.join('research', 'market-screens', 'screener', 'index.json') };
  }
  if (scanType === 'tijori' || scanType === 'tijori-market') {
    return { kind: 'tijoriScan', file: path.join('research', 'market-screens', 'tijori', 'index.json') };
  }
  return { kind: 'chartinkScan', file: path.join('scans', 'index.json') };
}

export async function launchScanProcess(scanType: string): Promise<LaunchResult> {
  if (isProcessRunning()) {
    return {
      runId: '',
      target: scanType,
      type: 'market_scan',
      status: 'busy',
      message: 'A pipeline execution task is already running. Please wait for it to complete.',
    };
  }

  const runId = `scan-${Date.now()}-${scanType}`;
  await recordRunStart(runId, 'market_scan', scanType, ['Chartink', 'NSE NextAPI']);

  updateActiveProgress(1, 'Step 1/5: Initializing Market Scan', scanType, runId, `Triggering market scan: ${scanType}`);

  let commandArgs = ['tsx', 'src/index.ts', 'market-scans'];
  if (scanType === '52w' || scanType === 'nse-52week-high') {
    commandArgs = ['tsx', 'src/index.ts', 'nse-52week-high'];
  } else if (scanType === 'top20' || scanType === 'chartink-top20') {
    commandArgs = ['tsx', 'src/index.ts', 'chartink-top20'];
  } else if (scanType === 'screener' || scanType === 'screener-market') {
    commandArgs = ['tsx', 'src/index.ts', 'screener-screens'];
  } else if (scanType === 'tijori' || scanType === 'tijori-market') {
    commandArgs = ['tsx', 'src/index.ts', 'tijori-market'];
  }

  const child = spawn('npx', commandArgs, { cwd: ROOT, shell: true });
  activeProcess = child;

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      updateActiveProgress(3, 'Step 3/5: Market Scan Extraction', scanType, runId, line.trim());
    }
  });

  child.on('close', async (code) => {
    activeProcess = null;
    const ok = code === 0;
    await recordRunComplete(runId, ok ? 'completed' : 'failed', ok ? 100 : null, ok ? undefined : `Scan exited with code ${code}`);
    if (ok) {
      const sheetExport = scanSheetExport(scanType);
      const started = startGoogleSheetsExport(sheetExport.kind, undefined, {
        root: ROOT,
        file: sheetExport.file,
        trigger: 'post_process',
        automatic: true,
      });
      void started.completion;
    } else {
      await writeGoogleSheetsStatusMessage('skipped', `Sheets publish skipped because market scan ${scanType} failed.`, {
        root: ROOT, trigger: 'post_process', kind: scanSheetExport(scanType).kind,
        error: `Market scan exited with code ${code}`,
      });
    }
  });

  child.on('error', async (err) => {
    activeProcess = null;
    await recordRunComplete(runId, 'failed', null, err.message);
  });

  return {
    runId,
    target: scanType,
    type: 'market_scan',
    status: 'started',
    message: `Market scan task ${runId} triggered for ${scanType}`,
  };
}

export async function launchAnalyzeProcess(symbol: string): Promise<LaunchResult> {
  if (isProcessRunning()) {
    return {
      runId: '',
      target: symbol,
      type: 'individual_research',
      status: 'busy',
      message: 'A pipeline execution task is already running. Please wait for it to complete.',
    };
  }

  const sym = symbol.trim().toUpperCase();
  const runId = `analyze-${Date.now()}-${sym.toLowerCase()}`;
  await recordRunStart(runId, 'individual_research', sym, ['LLM Reasoner']);

  updateActiveProgress(1, 'Step 1/5: Loading Prompt Context', sym, runId, `Loading analysis-prompt.txt for ${sym}`);

  const child = spawn('npx', ['tsx', 'src/index.ts', 'analyze', sym], { cwd: ROOT, shell: true });
  activeProcess = child;

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
    for (const line of lines) {
      updateActiveProgress(4, 'Step 4/5: LLM Reasoning & Schema Validation', sym, runId, line.trim());
    }
  });

  child.on('close', async (code) => {
    activeProcess = null;
    const ok = code === 0;
    await recordRunComplete(runId, ok ? 'completed' : 'failed', ok ? 95 : null, ok ? undefined : `Analyze exited with code ${code}`);
  });

  child.on('error', async (err) => {
    activeProcess = null;
    await recordRunComplete(runId, 'failed', null, err.message);
  });

  return {
    runId,
    target: sym,
    type: 'individual_research',
    status: 'started',
    message: `LLM analysis task ${runId} triggered for ${sym}`,
  };
}
