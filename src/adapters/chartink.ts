import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { ensureDir, writeText } from '../lib/fs.js';
import { getBrowserSession, closeBrowserSession, resetBrowserSession } from '../lib/browser.js';
import { DebugLogger } from '../lib/debug.js';
import type { AdapterContext, AdapterResult, SourceArtifact } from '../types/research.js';
import chartinkConfig from '../../config/chartink-scans.json' with { type: 'json' };

type ChartinkCategory = 'long' | 'short' | 'intraday' | 'swing';

type StrategyConfig = {
  name: string;
  url: string;
  category: ChartinkCategory;
  tags?: string[];
};

type ChartinkRow = {
  name?: string;
  nsecode?: string;
  bsecode?: string;
  per_chg?: string | number;
  close?: string | number;
  volume?: string | number;
  market_cap?: string | number;
  sector?: string;
  symbol?: string;
  [key: string]: unknown;
};

function slugFromUrl(url: string) {
  return new URL(url).pathname.split('/').filter(Boolean).pop() || 'unknown';
}

function cleanText(v: unknown) {
  return String(v ?? '')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSymbol(value: unknown): string {
  const valueText = cleanText(value);
  if (!valueText) return '';
  return valueText.toUpperCase().replace(/\s+/g, '');
}

function normalizeRow(row: ChartinkRow, category: ChartinkCategory, strategy: StrategyConfig) {
  const rawName = cleanText(row.name || row.stock_name || row['Stock Name']);
  const rawSymbol = cleanText(row.nsecode || row.symbol || row['Symbol'] || rawName);
  return {
    strategy: strategy.name,
    strategySlug: slugFromUrl(strategy.url),
    category,
    symbol: normalizeSymbol(rawSymbol),
    name: rawName || rawSymbol,
    bseCode: cleanText(row.bsecode || row['BSE Code']) || null,
    close: row.close ?? row['Close'] ?? null,
    percentChange: row.per_chg ?? row['%_change'] ?? row['% Change'] ?? null,
    volume: row.volume ?? row['Volume'] ?? null,
    marketCap: row.market_cap ?? row['Marketcap'] ?? row['Market Cap'] ?? null,
    sector: cleanText(row.sector || row['Sector']) || null,
    raw: row,
  };
}

function extractScanClause(html: string): string | null {
  const patterns = [
    /<textarea[^>]+name=["']scan_clause["'][^>]*>([\s\S]*?)<\/textarea>/i,
    /<input[^>]+name=["']scan_clause["'][^>]+value=["']([^"']*)["']/i,
    /scan_clause["']?\s*[:=]\s*["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try { return decodeURIComponent(m[1]).replace(/\+/g, ' ').trim(); } catch { return m[1].replace(/\+/g, ' ').trim(); }
    }
  }
  return null;
}

function discoverSearchStrategies(text: string) {
  const out: Array<{ name: string; url: string }> = [];
  const re = /href=["'](https:\/\/chartink\.com\/(?:screener|scanner)\/([^"'#?]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = cleanText(m[3].replace(/<[^>]+>/g, ' '));
    if (!name) continue;
    const url = m[1].replace('/scanner/', '/screener/');
    if (!out.some(x => x.url === url)) out.push({ name, url });
  }
  return out;
}

function heuristicCategory(name: string): ChartinkCategory {
  const s = name.toLowerCase();
  if (/intraday|9:30|futures/.test(s)) return 'intraday';
  if (/short|below the supertrend|sell|bearish/.test(s)) return 'short';
  if (/swing|breakout|btst|ema crossover|moving average crossover|ichimoku|200 sma|macd/.test(s)) return 'swing';
  return 'long';
}

function parseDelimitedText(text: string): string[][] {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim());

  return lines.map(line => {
    const delimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : '\t');
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function rowsFromDelimitedTable(text: string): ChartinkRow[] {
  const rows = parseDelimitedText(text);
  if (rows.length < 2) return [];
  const headerIndex = rows.findIndex(row => {
    const joined = row.join(' ').toLowerCase();
    return /symbol/.test(joined) && (/stock|name/.test(joined));
  });
  const index = headerIndex >= 0 ? headerIndex : 0;
  const headers = rows[index].map(cleanText);
  const dataRows = rows.slice(index + 1);
  return dataRows.map(values => {
    const obj: ChartinkRow = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = values[i] ?? '';
    });
    const normalized: ChartinkRow = {
      ...obj,
      name: obj.name ?? obj['Stock Name'] ?? obj['Stock'] ?? obj['Name'],
      symbol: obj.symbol ?? obj['Symbol'] ?? obj['NSE Code'],
      nsecode: obj.nsecode ?? obj['NSE Code'],
      bsecode: obj.bsecode ?? obj['BSE Code'],
      close: obj.close ?? obj['Close'],
      per_chg: obj.per_chg ?? obj['%_change'] ?? obj['% Change'],
      volume: obj.volume ?? obj['Volume'],
      market_cap: obj.market_cap ?? obj['Marketcap'] ?? obj['Market Cap'],
      sector: obj.sector ?? obj['Sector'],
    };
    return normalized;
  }).filter(row => cleanText(row.symbol || row.nsecode || row.name));
}

function tableRowsToObjects(table: { headers: string[]; rows: string[][] }): ChartinkRow[] {
  const headers = table.headers.map(cleanText);
  return table.rows.map(values => {
    const obj: ChartinkRow = {};
    headers.forEach((h, i) => { if (h) obj[h] = values[i] ?? ''; });
    return {
      ...obj,
      name: obj.name ?? obj['Stock Name'] ?? obj['Stock'] ?? obj['Name'],
      symbol: obj.symbol ?? obj['Symbol'] ?? obj['NSE Code'],
      nsecode: obj.nsecode ?? obj['NSE Code'],
      bsecode: obj.bsecode ?? obj['BSE Code'],
      close: obj.close ?? obj['Close'],
      per_chg: obj.per_chg ?? obj['%_change'] ?? obj['% Change'],
      volume: obj.volume ?? obj['Volume'],
      market_cap: obj.market_cap ?? obj['Marketcap'] ?? obj['Market Cap'],
      sector: obj.sector ?? obj['Sector'],
    };
  }).filter(row => cleanText(row.symbol || row.nsecode || row.name));
}

async function extractVisibleStockTable(page: any) {
  return page.evaluate(() => {
    const tableData = Array.from(document.querySelectorAll('table')).map((table: any) => {
      const headers = Array.from(table.querySelectorAll('thead th, thead td')).map((el: any) => (el.innerText || el.textContent || '').trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr: any) =>
        Array.from(tr.querySelectorAll('td, th')).map((el: any) => (el.innerText || el.textContent || '').trim())
      ).filter((row: string[]) => row.some(Boolean));
      const headerText = headers.join(' ').toLowerCase();
      return { headers, rows, score: (headerText.includes('symbol') ? 3 : 0) + (headerText.includes('close') ? 2 : 0) + (headerText.includes('volume') ? 1 : 0) };
    }).filter(x => x.rows.length > 0).sort((a, b) => b.score - a.score);
    return tableData[0] || { headers: [], rows: [], score: 0 };
  });
}

async function waitForProcess(page: any, timeoutMs = 15000) {
  return new Promise<any>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        page.off('response', handler);
        resolve(null);
      }
    }, timeoutMs);
    const handler = async (response: any) => {
      try {
        if (!/\/screener\/process(?:\?|$)/i.test(response.url())) return;
        const status = response.status();
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        if (status >= 200 && status < 300 && ct.includes('json')) {
          const data = await response.json();
          if (!done) {
            done = true;
            clearTimeout(timer);
            page.off('response', handler);
            resolve({ status, data, url: response.url() });
          }
        }
      } catch {}
    };
    page.on('response', handler);
  });
}

async function firstVisible(locator: any) {
  try {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  } catch {}
  return null;
}

async function findCopyControl(page: any) {
  const candidates = [
    page.locator('button').filter({ hasText: /^\s*Copy\s*$/i }),
    page.locator('a').filter({ hasText: /^\s*Copy\s*$/i }),
    page.locator('[title*="Copy" i]'),
    page.locator('[aria-label*="Copy" i]'),
    page.locator('button, a').filter({ hasText: /\bCopy\b/i }),
  ];
  for (const locator of candidates) {
    const visible = await firstVisible(locator);
    if (visible) return visible;
  }
  return null;
}

async function installChartinkClipboardCapture(context: any) {
  await context.addInitScript(() => {
    const w = window as any;
    w.__chartinkClipboardText = '';
    w.__chartinkClipboardWrites = 0;

    try {
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        const originalWriteText = clipboard.writeText.bind(clipboard);
        Object.defineProperty(clipboard, 'writeText', {
          configurable: true,
          value: async (text: string) => {
            w.__chartinkClipboardText = String(text ?? '');
            w.__chartinkClipboardWrites += 1;
            try {
              return await originalWriteText(text);
            } catch {
              return undefined;
            }
          },
        });
      }
    } catch {}

    try {
      const originalExecCommand = document.execCommand?.bind(document);
      if (originalExecCommand) {
        document.execCommand = ((command: string, ...args: any[]) => {
          if (String(command).toLowerCase() === 'copy') {
            try {
              const selected = window.getSelection?.()?.toString() || '';
              if (selected.trim()) {
                w.__chartinkClipboardText = selected;
                w.__chartinkClipboardWrites += 1;
              }
            } catch {}
          }
          return originalExecCommand(command, ...args);
        }) as any;
      }
    } catch {}
    try {
      document.addEventListener('copy', (event: ClipboardEvent) => {
        try {
          const text = event.clipboardData?.getData('text/plain') || window.getSelection?.()?.toString() || '';
          if (text.trim()) {
            w.__chartinkClipboardText = text;
            w.__chartinkClipboardWrites += 1;
          }
        } catch {}
      }, true);
      w.__chartinkCopyEventInstalled = true;
    } catch {}
  });
}

async function readCapturedClipboard(page: any): Promise<string> {
  return page.evaluate(async () => {
    const w = window as any;
    const captured = String(w.__chartinkClipboardText || '');
    if (captured.trim()) return captured;
    try { return await navigator.clipboard.readText(); } catch { return ''; }
  });
}

async function pollClipboard(page: any, timeoutMs = 7000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await readCapturedClipboard(page);
    if (text.trim()) return text;
    await page.waitForTimeout(250);
  }
  return '';
}

async function firstVisibleText(page: any, text: string) {
  const candidates = [
    page.getByText(text, { exact: true }),
    page.locator('button, a, [role="button"], label, div, span').filter({ hasText: new RegExp(`^\\s*${text}\\s*$`, 'i') }),
  ];
  for (const locator of candidates) {
    const visible = await firstVisible(locator);
    if (visible) return visible;
  }
  return null;
}

async function copyTableWorkflow(page: any, debug: DebugLogger, strategy: StrategyConfig) {
  const copyControl = await findCopyControl(page);
  if (!copyControl) {
    return { attempted: false, ok: false, text: '', reason: 'Copy control not found', tableSelected: false, okClicked: false, confirmationDetected: false };
  }

  const dialogState = { accepted: false, text: '' };
  const dialogHandler = async (dialog: any) => {
    dialogState.text = dialog.message?.() || '';
    try {
      await dialog.accept();
      dialogState.accepted = true;
    } catch {}
  };
  page.on('dialog', dialogHandler);

  await debug.emit('CHARTINK/COPY', 'START', 'Executing Chartink Copy → Table → OK workflow', { strategy: strategy.name });

  try {
    await copyControl.click({ timeout: 15000 });
    await page.waitForTimeout(500);

    // Chartink presents a copy-format chooser. The user's workflow specifically
    // requires choosing Table, not Symbols.
    const tableChoice = await firstVisibleText(page, 'table');
    let tableSelected = false;
    if (tableChoice) {
      try {
        await tableChoice.click({ timeout: 10000 });
        tableSelected = true;
      } catch {
        try {
          await tableChoice.dispatchEvent('click');
          tableSelected = true;
        } catch {}
      }
    }

    await page.waitForTimeout(250);

    // Confirmation is usually an HTML modal, but handle native browser dialogs too.
    const confirmationLocators = [
      page.getByText(/all pages table data copied successfully/i),
      page.locator('[role="dialog"], .modal, .modal-dialog, .swal2-popup, .ui-dialog').filter({ hasText: /table data copied successfully|copied successfully/i }),
    ];
    let confirmationDetected = false;
    let confirmationText = dialogState.text;
    for (const locator of confirmationLocators) {
      try {
        if (await locator.count() && await locator.last().isVisible().catch(() => false)) {
          confirmationDetected = true;
          confirmationText = await locator.last().innerText().catch(() => confirmationText);
          break;
        }
      } catch {}
    }

    // If Chartink uses an HTML confirmation modal, click its OK explicitly.
    let okClicked = dialogState.accepted;
    if (!okClicked) {
      const okControl = await firstVisibleText(page, 'OK');
      if (okControl) {
        try {
          await okControl.click({ timeout: 10000 });
          okClicked = true;
        } catch {
          try {
            await okControl.dispatchEvent('click');
            okClicked = true;
          } catch {}
        }
      }
    }

    await page.waitForTimeout(350);
    let clipboard = await pollClipboard(page, Number(process.env.CHARTINK_COPY_WAIT_MS || 7000));
    let retryPerformed = false;

    if (!clipboard.trim() && tableSelected) {
      retryPerformed = true;
      await debug.emit('CHARTINK/COPY_RETRY', 'START', 'Retrying table copy after empty clipboard', { strategy: strategy.name });
      try {
        await copyControl.click({ timeout: 10000 });
        await page.waitForTimeout(300);
        const retryTable = await firstVisibleText(page, 'table');
        if (retryTable) await retryTable.click({ timeout: 10000 }).catch(() => retryTable.dispatchEvent('click'));
        await page.waitForTimeout(200);
        const retryOk = await firstVisibleText(page, 'OK');
        if (retryOk) await retryOk.click({ timeout: 10000 }).catch(() => retryOk.dispatchEvent('click'));
        clipboard = await pollClipboard(page, Number(process.env.CHARTINK_COPY_WAIT_MS || 7000));
      } catch (e: any) {
        await debug.emit('CHARTINK/COPY_RETRY', 'WARN', 'Retry copy failed', { strategy: strategy.name, error: e?.message || String(e) });
      }
    }

    const ok = Boolean(clipboard.trim() && (tableSelected || confirmationDetected || okClicked));

    await debug.emit('CHARTINK/COPY', ok ? 'OK' : 'WARN', ok
      ? 'Chartink Copy → Table → OK captured table text'
      : 'Chartink Copy workflow did not yield usable clipboard text', {
        strategy: strategy.name,
        tableSelected,
        confirmationDetected,
        confirmationText: confirmationText.slice(0, 300),
        okClicked,
        clipboardChars: clipboard.length,
        clipboardWrites: await page.evaluate(() => Number((window as any).__chartinkClipboardWrites || 0)).catch(() => 0),
        retryPerformed,
      });

    return {
      attempted: true,
      ok,
      text: clipboard,
      reason: ok ? 'clipboard' : (tableSelected ? 'clipboard-empty' : 'copy-format-not-selected'),
      tableSelected,
      okClicked,
      confirmationDetected,
      confirmationText,
    };
  } catch (error: any) {
    const reason = error?.message || String(error);
    await debug.emit('CHARTINK/COPY', 'WARN', 'Chartink Copy workflow failed', { strategy: strategy.name, error: reason });
    return { attempted: true, ok: false, text: '', reason, tableSelected: false, okClicked: false, confirmationDetected: false };
  } finally {
    page.off('dialog', dialogHandler);
  }
}


async function findCsvControl(page: any) {
  const candidates = [
    page.getByRole('button', { name: /^CSV$/i }),
    page.getByRole('link', { name: /^CSV$/i }),
    page.locator('button, a').filter({ hasText: /^\s*CSV\s*$/i }),
    page.locator('[title*="CSV" i]'),
    page.locator('[aria-label*="CSV" i]'),
  ];
  for (const locator of candidates) {
    const visible = await firstVisible(locator);
    if (visible) return visible;
  }
  return null;
}

async function clickCsv(page: any, outPath: string, debug: DebugLogger, strategy: StrategyConfig) {
  const csvControl = await findCsvControl(page);
  if (!csvControl) {
    await debug.emit('CHARTINK/CSV', 'WARN', 'CSV control not found; copy workflow will be used as fallback', { strategy: strategy.name });
    return { attempted: false, captured: false, bytes: 0, method: 'not-found' };
  }

  const timeout = Number(process.env.CHARTINK_CSV_TIMEOUT_MS || 6000);
  const csvResponses: any[] = [];
  const responseHandler = async (response: any) => {
    try {
      const url = response.url();
      const headers = response.headers();
      const ct = String(headers['content-type'] || '').toLowerCase();
      const cd = String(headers['content-disposition'] || '').toLowerCase();
      if (/csv|text\/plain|spreadsheet|excel/i.test(ct) || /\.csv(?:[?#]|$)|download|export/i.test(url) || /attachment/i.test(cd)) {
        csvResponses.push(response);
      }
    } catch {}
  };
  page.on('response', responseHandler);

  await debug.emit('CHARTINK/CSV', 'START', 'Attempting Chartink CSV first', {
    strategy: strategy.name,
    timeoutMs: timeout,
  });

  try {
    await csvControl.scrollIntoViewIfNeeded().catch(() => {});

    // Attach the rejection handler immediately so a missing download event
    // can never become an uncaught promise rejection.
    const downloadPromise = page.waitForEvent('download', { timeout }).catch(() => null);

    await csvControl.click({ timeout: 10000, noWaitAfter: true }).catch(async () => {
      await csvControl.dispatchEvent('click').catch(() => {});
    });

    const download = await downloadPromise;
    if (download) {
      await download.saveAs(outPath);
      const fileStat = await stat(outPath).catch(() => ({ size: 0 } as any));
      if (fileStat.size > 0) {
        await debug.emit('CHARTINK/CSV', 'OK', 'Chartink CSV download captured', {
          strategy: strategy.name,
          bytes: fileStat.size,
          path: outPath,
          method: 'download-event',
          originalFilename: (() => { try { return download.suggestedFilename(); } catch { return null; } })(),
        });
        return { attempted: true, captured: true, bytes: fileStat.size, method: 'download-event' };
      }
    }

    await page.waitForTimeout(700);

    for (let i = csvResponses.length - 1; i >= 0; i--) {
      const response = csvResponses[i];
      try {
        if (!response.ok()) continue;
        const body = await response.body();
        if (!body?.length) continue;
        const text = body.toString('utf8');
        if (!text.trim() || /^\s*<(!doctype|html)/i.test(text)) continue;
        const looksLikeCsv = /(?:^|[\r\n])[^\r\n]*,|\t/.test(text);
        if (!looksLikeCsv) continue;
        await writeFile(outPath, body);
        const fileStat = await stat(outPath).catch(() => ({ size: 0 } as any));
        if (fileStat.size > 0) {
          await debug.emit('CHARTINK/CSV', 'OK', 'Chartink CSV captured from network response', {
            strategy: strategy.name,
            bytes: fileStat.size,
            url: response.url(),
            method: 'network-response',
          });
          return { attempted: true, captured: true, bytes: fileStat.size, method: 'network-response', url: response.url() };
        }
      } catch {}
    }

    await debug.emit('CHARTINK/CSV', 'WARN', 'CSV was unavailable or produced no downloadable file; falling back to Copy → Table → OK', {
      strategy: strategy.name,
      responseCandidates: csvResponses.length,
    });
    return { attempted: true, captured: false, bytes: 0, method: 'click-no-capture' };
  } catch (error: any) {
    const reason = error?.message || String(error);
    await debug.emit('CHARTINK/CSV', 'WARN', 'Chartink CSV attempt failed; falling back to Copy → Table → OK', {
      strategy: strategy.name,
      error: reason,
    });
    return { attempted: true, captured: false, bytes: 0, method: 'error', error: reason };
  } finally {
    page.off('response', responseHandler);
  }
}


async function ensureScanResults(page: any, debug: DebugLogger, strategy: StrategyConfig) {
  const initial = await extractVisibleStockTable(page).catch(() => ({ headers: [], rows: [], score: 0 }));
  if (initial.rows.length > 0) {
    await debug.emit('CHARTINK/RESULTS', 'OK', 'Visible scanner table already populated', { strategy: strategy.name, rows: initial.rows.length, noResults: false });
    return { attemptedRunScan: false, rows: initial.rows.length, noResults: false };
  }

  const runCandidates = [
    page.getByRole('button', { name: /^Run Scan$/i }),
    page.getByText('Run Scan', { exact: true }),
    page.locator('button, a').filter({ hasText: /^\s*Run Scan\s*$/i }),
  ];
  let runControl: any = null;
  for (const locator of runCandidates) {
    runControl = await firstVisible(locator);
    if (runControl) break;
  }
  if (!runControl) {
    await debug.emit('CHARTINK/RESULTS', 'WARN', 'Scanner table empty and Run Scan control not found; moving to next strategy', { strategy: strategy.name, noResults: false, reason: 'run-scan-control-not-found' });
    return { attemptedRunScan: false, rows: 0, noResults: false };
  }

  const disabled = await runControl.isDisabled?.().catch(() => false);
  if (disabled) {
    await debug.emit('CHARTINK/RESULTS', 'INFO', 'Run Scan control is disabled; moving to next strategy', { strategy: strategy.name, noResults: true, controlDisabled: true });
    return { attemptedRunScan: false, rows: 0, noResults: true };
  }

  try {
    await debug.emit('CHARTINK/RESULTS', 'START', 'Scanner table empty; clicking Run Scan', { strategy: strategy.name });
    const before = initial.rows.length;
    const processPromise = waitForProcess(page, Number(process.env.CHARTINK_RUNSCAN_PROCESS_TIMEOUT_MS || 6000));
    await runControl.click({ timeout: 10000 });
    await processPromise.catch(() => null);
    await page.waitForTimeout(Number(process.env.CHARTINK_RUNSCAN_SETTLE_MS || 2000));

    const after = await extractVisibleStockTable(page).catch(() => ({ headers: [], rows: [], score: 0 }));
    if (after.rows.length > 0) {
      await debug.emit('CHARTINK/RESULTS', 'OK', 'Run Scan completed and populated results', { strategy: strategy.name, beforeRows: before, afterRows: after.rows.length, noResults: false });
      return { attemptedRunScan: true, rows: after.rows.length, noResults: false };
    }

    await debug.emit('CHARTINK/RESULTS', 'INFO', 'Run Scan completed with no visible results; moving to next strategy', { strategy: strategy.name, beforeRows: before, afterRows: 0, noResults: true });
    return { attemptedRunScan: true, rows: 0, noResults: true };
  } catch (error: any) {
    const message = error?.message || String(error);
    await debug.emit('CHARTINK/RESULTS', 'WARN', 'Run Scan failed; moving to next strategy', { strategy: strategy.name, error: message, noResults: false });
    return { attemptedRunScan: true, rows: 0, noResults: false };
  }
}

async function collectStrategyOnFreshPage(state: any, strategy: StrategyConfig, debug: DebugLogger, strategiesDir: string, csvDir: string) {
  const page = await state.context.newPage();
  try {
    const processPromise = waitForProcess(page, Number(process.env.CHARTINK_PROCESS_TIMEOUT_MS || 6000));
    await page.goto(strategy.url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.CHARTINK_PAGE_TIMEOUT_MS || 60000) });
    await page.waitForTimeout(Number(process.env.CHARTINK_SETTLE_MS || 2200));

    const scanState = await ensureScanResults(page, debug, strategy);
    const processResult = scanState.noResults ? null : await processPromise;
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    let scanClause = extractScanClause(html);
    if (!scanClause) {
      scanClause = await page.locator('textarea[name="scan_clause"]').first().inputValue().catch(() => '');
      if (!scanClause) scanClause = await page.locator('input[name="scan_clause"]').first().inputValue().catch(() => '');
      if (scanClause) scanClause = scanClause.replace(/\+/g, ' ').trim();
    }

    const title = await page.title();
    const links = await page.locator('a').evaluateAll((els: any[]) => els.map(a => ({ text: (a.innerText || a.textContent || '').trim(), href: a.href })).filter(x => x.href));
    const visibleTable = await extractVisibleStockTable(page);

    // IMPORTANT: A completed scan with zero result rows is a valid NO_RESULTS state.
    // Do not click disabled CSV/Copy controls after an empty Run Scan; just persist
    // the evidence and move to the next strategy. This avoids 15s selector timeouts.
    const noResults = Boolean(scanState.noResults);
    const csvPath = path.join(csvDir, `${slugFromUrl(strategy.url)}.csv`);
    const csvResult = noResults
      ? { attempted: false, captured: false, bytes: 0, method: 'skipped-no-results' }
      : await clickCsv(page, csvPath, debug, strategy);

    let rows: ChartinkRow[] = [];
    let resultSource = noResults ? 'no-results' : 'none';
    let copyResult: any = {
      attempted: false,
      ok: false,
      text: '',
      reason: 'csv-primary-success-or-not-attempted',
      tableSelected: false,
      okClicked: false,
      confirmationDetected: false,
      confirmationText: '',
    };

    // Prefer actual CSV contents when available.
    if (csvResult.captured) {
      try {
        const csvText = await readFile(csvPath, 'utf8');
        const csvRows = rowsFromDelimitedTable(csvText);
        if (csvRows.length) {
          rows = csvRows;
          resultSource = 'csv-download';
        }
        if (!rows.length) {
          await debug.emit('CHARTINK/CSV', 'WARN', 'CSV file exists but parser produced no stock rows; falling back to Copy → Table → OK', {
            strategy: strategy.name,
            csvBytes: csvResult.bytes,
          });
        }
      } catch (e: any) {
        await debug.emit('CHARTINK/CSV', 'WARN', 'Saved CSV could not be parsed; falling back to Copy → Table → OK', {
          strategy: strategy.name,
          error: e?.message || String(e),
        });
      }
    }

    // Copy is ONLY a fallback after CSV was unavailable/unusable.
    if (!rows.length && !noResults) {
      copyResult = await copyTableWorkflow(page, debug, strategy);
      if (copyResult.ok && copyResult.text) {
        const copiedRows = rowsFromDelimitedTable(copyResult.text);
        if (copiedRows.length) {
          rows = copiedRows;
          resultSource = 'ui-copy-table';
        }
        const copiedPath = path.join(strategiesDir, `${slugFromUrl(strategy.url)}.copy.txt`);
        await writeText(copiedPath, copyResult.text);
      }
    }

    // Last deterministic fallback: visible table already on page.
    if (!rows.length && visibleTable.rows.length) {
      rows = tableRowsToObjects(visibleTable);
      resultSource = 'dom-table';
    }

    if (!rows.length && processResult?.data?.data && Array.isArray(processResult.data.data)) {
      rows = processResult.data.data;
      resultSource = 'network:/screener/process';
    }

    if (!rows.length && scanClause) {
      try {
        const fallback = await page.evaluate(async (clause: string) => {
          const response = await fetch('/screener/process', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: new URLSearchParams({ scan_clause: clause }).toString(),
          });
          const text = await response.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch {}
          return { status: response.status, json, text };
        }, scanClause);
        if (Array.isArray(fallback?.json?.data)) {
          rows = fallback.json.data;
          resultSource = 'browser-fetch:/screener/process';
        }
      } catch {}
    }

    const normalized = rows.map(r => normalizeRow(r, strategy.category, strategy)).filter(r => r.symbol && r.symbol !== 'UNDEFINED');
    const csvCaptured = Boolean(csvResult.captured);

    const pageDataPath = path.join(strategiesDir, `${slugFromUrl(strategy.url)}.page.json`);
    await writeText(pageDataPath, JSON.stringify({
      url: page.url(), title, text: bodyText, scanClause, links,
      visibleTable,
      copy: {
        attempted: copyResult.attempted,
        ok: copyResult.ok,
        reason: copyResult.reason,
        tableSelected: Boolean(copyResult.tableSelected),
        confirmationDetected: Boolean(copyResult.confirmationDetected),
        okClicked: Boolean(copyResult.okClicked),
        confirmationText: copyResult.confirmationText || null,
        clipboardChars: copyResult.text.length,
      },
      csv: csvResult,
      processCaptured: Boolean(processResult),
      scanState,
    }, null, 2));

    return {
      normalized,
      resultSource,
      noResults,
      scanClause,
      pageDataPath,
      csvCaptured,
      csvBytes: csvResult.bytes,
      csvMethod: csvResult.method,
      copyCaptured: copyResult.ok,
      copyTextChars: copyResult.text.length,
      copyTableSelected: Boolean(copyResult.tableSelected),
      copyConfirmationDetected: Boolean(copyResult.confirmationDetected),
      copyOkClicked: Boolean(copyResult.okClicked),
      processCaptured: Boolean(processResult),
      visibleRows: visibleTable.rows.length,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function runChartink(ctx: AdapterContext): Promise<AdapterResult> {
  const artifacts: SourceArtifact[] = [];
  const gaps: string[] = [];
  const warnings: string[] = [];
  const projectRoot = path.resolve(ctx.researchDir, '..', '..');
  const root = path.join(projectRoot, 'research', 'chartink');
  const strategiesDir = path.join(root, 'strategies');
  const csvDir = path.join(root, 'strategies', 'csv');
  const marketRoot = path.join(projectRoot, 'research', 'market-screens', 'chartink');
  const tickerRoot = path.join(ctx.researchDir, 'raw', 'chartink');
  const debugDir = path.join(ctx.researchDir, 'debug', 'chartink');
  await Promise.all([ensureDir(root), ensureDir(strategiesDir), ensureDir(csvDir), ensureDir(marketRoot), ensureDir(tickerRoot), ensureDir(debugDir)]);
  const debug = new DebugLogger(debugDir, process.env.DEBUG_CONSOLE !== 'false');
  await debug.init({ ticker: ctx.ticker, adapter: 'Chartink', node: process.version, cwd: process.cwd(), researchDir: ctx.researchDir });

  const configured: StrategyConfig[] = chartinkConfig.strategies as StrategyConfig[];
  const session = `${process.env.PLAYWRIGHT_SESSION_PREFIX || 'stock-research'}-${ctx.ticker}-chartink-${Date.now()}`;

  try {
    const state = await getBrowserSession(session, 'default');
    await installChartinkClipboardCapture(state.context);
    await debug.emit('CHARTINK/SESSION', 'OK', 'Chartink browser session ready', { session, mode: state.mode });

    const strategyResults: any[] = [];
    const categories: Record<ChartinkCategory, any[]> = { long: [], short: [], intraday: [], swing: [] };

    for (let i = 0; i < configured.length; i++) {
      const strategy = configured[i];
      const slug = slugFromUrl(strategy.url);
      const strategyDebug = `CHARTINK/STRATEGY_${String(i + 1).padStart(2, '0')}`;
      await debug.emit(strategyDebug, 'START', 'Fetching Chartink strategy', { strategy: strategy.name, category: strategy.category, url: strategy.url });
      try {
        const result = await collectStrategyOnFreshPage(state, strategy, debug, strategiesDir, csvDir);
        categories[strategy.category].push(...result.normalized);
        strategyResults.push({
          name: strategy.name,
          slug,
          url: strategy.url,
          category: strategy.category,
          tags: strategy.tags || [],
          scanClause: result.scanClause || null,
          resultSource: result.resultSource,
          resultStatus: result.noResults ? 'no_results' : (result.normalized.length ? 'ok' : 'partial'),
          resultCount: result.normalized.length,
          copyCaptured: result.copyCaptured,
          csvCaptured: result.csvCaptured,
          stocks: result.normalized,
        });

        const jsonPath = path.join(strategiesDir, `${slug}.results.json`);
        await writeText(jsonPath, JSON.stringify({
          strategy,
          capturedAt: new Date().toISOString(),
          resultSource: result.resultSource,
          resultStatus: result.noResults ? 'no_results' : (result.normalized.length ? 'ok' : 'partial'),
          noResults: Boolean(result.noResults),
          scanClause: result.scanClause || null,
          copyCaptured: result.copyCaptured,
          csvCaptured: result.csvCaptured,
          rows: result.normalized,
        }, null, 2));
        const resultStatus = result.noResults ? 'ok' : (result.normalized.length > 0 ? 'ok' : 'partial');
        const parserGap = !result.noResults && !result.normalized.length && (result.visibleRows > 0 || (!result.copyCaptured && !result.csvCaptured && !result.processCaptured));
        if (parserGap) gaps.push(`Chartink ${strategy.name}: no usable stock rows were recovered from a non-empty/expected result page.`);
        if (!result.noResults && !result.normalized.length) warnings.push(`Chartink ${strategy.name}: no normalized stock rows recovered; visibleRows=${result.visibleRows}, copyCaptured=${result.copyCaptured}, csvCaptured=${result.csvCaptured}, processCaptured=${result.processCaptured}.`);
        artifacts.push({ id: `chartink-strategy-${slug}-page`, type: 'source_page', provider: 'Chartink', title: strategy.name, url: strategy.url, localPath: result.pageDataPath, retrievedAt: new Date().toISOString(), status: resultStatus as any, method: 'playwright', notes: [`category=${strategy.category}`, result.noResults ? 'no_results=true; Run Scan returned zero visible rows; CSV/Copy skipped.' : (result.normalized.length ? `stocks=${result.normalized.length}` : 'No normalized stock rows recovered; review debug/page evidence.')] });
        artifacts.push({ id: `chartink-strategy-${slug}-results`, type: 'screening_results', provider: 'Chartink', title: `${strategy.name} stock results`, url: strategy.url, localPath: jsonPath, retrievedAt: new Date().toISOString(), status: resultStatus as any, method: 'playwright', notes: [`category=${strategy.category}`, `stocks=${result.normalized.length}`, `resultStatus=${result.noResults ? 'no_results' : (result.normalized.length ? 'ok' : 'partial')}`, `resultSource=${result.resultSource}`, `copyCaptured=${result.copyCaptured}`, `csvCaptured=${result.csvCaptured}`, `csvBytes=${result.csvBytes ?? 0}`] });

        if (result.csvCaptured) {
          artifacts.push({ id: `chartink-strategy-${slug}-csv`, type: 'screening_results', provider: 'Chartink', title: `${strategy.name} CSV results`, url: strategy.url, localPath: path.join(csvDir, `${slug}.csv`), retrievedAt: new Date().toISOString(), status: 'ok', method: 'playwright', notes: [`CSV capture method=${result.csvMethod || 'unknown'}`, `bytes=${result.csvBytes || 0}`] });
        }
        if (result.copyCaptured) {
          const copyPath = path.join(strategiesDir, `${slug}.copy.txt`);
          artifacts.push({ id: `chartink-strategy-${slug}-copy`, type: 'screening_results', provider: 'Chartink', title: `${strategy.name} copied table`, url: strategy.url, localPath: copyPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'playwright', notes: ['Chartink Copy → Table → OK workflow captured the table clipboard text.'] });
        }

        await debug.emit(strategyDebug, 'OK', 'Chartink strategy acquired', {
          strategy: strategy.name,
          category: strategy.category,
          resultSource: result.resultSource,
          stocks: result.normalized.length,
          scanClauseFound: Boolean(result.scanClause),
          copyCaptured: result.copyCaptured,
          csvCaptured: result.csvCaptured,
          csvBytes: result.csvBytes,
          csvMethod: result.csvMethod,
          visibleRows: result.visibleRows,
          copyTableSelected: result.copyTableSelected,
          copyConfirmationDetected: result.copyConfirmationDetected,
          copyOkClicked: result.copyOkClicked,
          processCaptured: result.processCaptured,
          resultStatus: result.noResults ? 'no_results' : (result.normalized.length ? 'ok' : 'partial'),
          noResults: result.noResults,
        });
      } catch (e: any) {
        const msg = e?.message || String(e);
        warnings.push(`Chartink ${strategy.name}: ${msg}`);
        await debug.emit(strategyDebug, 'WARN', 'Chartink strategy failed', { strategy: strategy.name, category: strategy.category, error: msg });
      }
    }

    // No-results is a valid scanner outcome. It must never become a market data gap.
    const noResultNames = new Set(strategyResults.filter(r => r.resultStatus === 'no_results').map(r => String(r.name)));
    if (noResultNames.size) {
      for (let i = gaps.length - 1; i >= 0; i--) {
        const msg = String(gaps[i]);
        if ([...noResultNames].some(name => msg.includes(name)) || /no visible results|no results/i.test(msg)) {
          gaps.splice(i, 1);
        }
      }
    }

    const searchUrl = chartinkConfig.searchUrl as string;
    const discoveryPage = await state.context.newPage();
    try {
      await debug.emit('CHARTINK/SEARCH', 'START', 'Capturing Chartink strategy search catalog', { searchUrl });
      await discoveryPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await discoveryPage.waitForTimeout(1500);
      const searchHtml = await discoveryPage.content();
      const discovered = discoverSearchStrategies(searchHtml).map(x => ({ ...x, heuristicCategory: heuristicCategory(x.name) }));
      const discoveryPath = path.join(root, 'strategy-search.json');
      await writeText(discoveryPath, JSON.stringify({ searchUrl, capturedAt: new Date().toISOString(), discovered }, null, 2));
      artifacts.push({ id: 'chartink-strategy-search', type: 'source_page', provider: 'Chartink', title: 'Chartink swing strategy search catalog', url: searchUrl, localPath: discoveryPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'playwright', notes: [`discovered=${discovered.length}`] });
      await debug.emit('CHARTINK/SEARCH', 'OK', 'Chartink strategy search catalog captured', { discovered: discovered.length, searchUrl });
    } catch (e: any) {
      warnings.push(`Chartink strategy search: ${e?.message || String(e)}`);
      await debug.emit('CHARTINK/SEARCH', 'WARN', 'Chartink strategy search failed', { error: e?.message || String(e) });
    } finally {
      await discoveryPage.close().catch(() => {});
    }

    const dedupe = (rows: any[]) => {
      const map = new Map<string, any>();
      for (const row of rows) {
        if (!row.symbol) continue;
        const existing = map.get(row.symbol);
        if (!existing) map.set(row.symbol, { ...row, strategies: [row.strategy] });
        else {
          existing.strategies = [...new Set([...(existing.strategies || []), row.strategy])];
          if (Number(row.percentChange) > Number(existing.percentChange)) existing.percentChange = row.percentChange;
        }
      }
      return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    };

    const byCategory: Record<ChartinkCategory, any[]> = {
      long: dedupe(categories.long),
      short: dedupe(categories.short),
      intraday: dedupe(categories.intraday),
      swing: dedupe(categories.swing),
    };

    for (const [category, rows] of Object.entries(byCategory) as Array<[ChartinkCategory, any[]]>) {
      const out = path.join(marketRoot, `stocks-${category}.json`);
      await writeText(out, JSON.stringify({ ticker: ctx.ticker, category, generatedAt: new Date().toISOString(), stockCount: rows.length, stocks: rows }, null, 2));
      artifacts.push({ id: `chartink-${category}-stocks`, type: 'screening_results', provider: 'Chartink', title: `Chartink ${category} stock basket`, localPath: out, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: [`uniqueStocks=${rows.length}`] });
      await debug.emit(`CHARTINK/CATEGORY/${category.toUpperCase()}`, rows.length ? 'OK' : 'WARN', 'Chartink category normalized', { uniqueStocks: rows.length });
    }

    const catalogPath = path.join(root, 'strategies.json');
    await writeText(catalogPath, JSON.stringify({ searchUrl, generatedAt: new Date().toISOString(), configuredStrategies: configured, results: strategyResults }, null, 2));
    artifacts.push({ id: 'chartink-strategy-catalog', type: 'derived_data', provider: 'script', title: 'Chartink strategy catalog and stock results', localPath: catalogPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Strategy metadata, scan clauses, stock results and category assignments.'] });

    const summaryPath = path.join(root, 'chartink-summary.json');
    await writeText(summaryPath, JSON.stringify({
      ticker: ctx.ticker,
      generatedAt: new Date().toISOString(),
      strategyCount: configured.length,
      acquiredStrategies: strategyResults.length,
      strategiesWithCopy: strategyResults.filter(r => r.copyCaptured).length,
      strategiesWithCsv: strategyResults.filter(r => r.csvCaptured).length,
      categories: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, { uniqueStocks: v.length }])) ,
      strategies: strategyResults.map(r => ({ name: r.name, slug: r.slug, category: r.category, resultCount: r.resultCount, resultStatus: r.resultStatus, resultSource: r.resultSource, copyCaptured: r.copyCaptured, csvCaptured: r.csvCaptured })),
    }, null, 2));
    artifacts.push({ id: 'chartink-summary', type: 'derived_data', provider: 'Chartink', title: 'Chartink acquisition summary', localPath: summaryPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: [] });

    if (ctx.ticker && ctx.ticker !== '__MARKET__') {
      const membership = strategyResults.map((r: any) => ({
        strategy: r.name, strategySlug: r.slug, category: r.category,
        matched: Array.isArray(r.stocks) && r.stocks.some((row: any) => String(row.symbol || '').toUpperCase() === ctx.ticker.toUpperCase()),
        resultCount: r.resultCount,
      }));
      const membershipPath = path.join(tickerRoot, 'membership.json');
      await writeText(membershipPath, JSON.stringify({ schema_version: '1.0', ticker: ctx.ticker.toUpperCase(), generatedAt: new Date().toISOString(), matches: membership.filter((x: any) => x.matched), allStrategies: membership }, null, 2));
      artifacts.push({ id: 'chartink-target-membership', type: 'derived_data', provider: 'Chartink', title: `Chartink strategy membership for ${ctx.ticker.toUpperCase()}`, localPath: membershipPath, retrievedAt: new Date().toISOString(), status: 'ok', method: 'script', notes: ['Per-ticker membership only; market-wide strategy files remain outside the ticker evidence folder.'] });
    }

    await debug.emit('CHARTINK/PATHS', 'OK', 'Chartink files separated into strategy, market-screen and ticker evidence roots', { strategyRoot: root, marketRoot, tickerRoot });

    await debug.emit('CHARTINK/VALIDATION', warnings.length ? 'WARN' : 'OK', 'Chartink acquisition complete', {
      configuredStrategies: configured.length,
      acquiredStrategies: strategyResults.length,
      artifacts: artifacts.length,
      warnings: warnings.length,
      strategiesWithCopy: strategyResults.filter(r => r.copyCaptured).length,
      strategiesWithCsv: strategyResults.filter(r => r.csvCaptured).length,
      categories: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
    });
  } finally {
    await closeBrowserSession(session).catch(() => {});
    await debug.finish({ status: warnings.length ? 'ok_with_fallback' : 'ok', artifacts: artifacts.length, dataGaps: gaps.length, warnings: warnings.length });
  }

  return { artifacts, gaps, warnings };
}
