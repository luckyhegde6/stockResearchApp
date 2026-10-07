import { browserHealthCheck, browserOpen, browserRunCode, browserScreenshot, closeBrowserSession } from './browser.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

export interface CliResult { stdout: string; stderr: string; code: number; }

export async function runPlaywrightBrowserProbe(_cwd: string, _session: string, timeoutMs = 45_000) {
  try {
    const result = await browserHealthCheck('https://www.nseindia.com/', timeoutMs);
    return { stdout: JSON.stringify(result), stderr: '', code: 0 };
  } catch (error: any) {
    return { stdout: '', stderr: error?.stack || error?.message || String(error), code: 1 };
  }
}

export async function runPlaywrightCli(args: string[], _cwd: string, timeoutMs = 120_000): Promise<CliResult> {
  const sessionArg = args.find(a => /^-s=/.test(a));
  const session = sessionArg ? sessionArg.slice(3) : 'default';
  try {
    if (args.includes('--help') || args.includes('--version')) {
      return { stdout: 'Application runtime uses Playwright Library; CLI is reserved for manual/agent use.', stderr: '', code: 0 };
    }
    if (args.includes('close')) {
      await closeBrowserSession(session);
      return { stdout: '', stderr: '', code: 0 };
    }
    if (args.includes('open')) {
      const i = args.indexOf('open');
      const url = args[i + 1];
      if (!url) return { stdout: '', stderr: 'open requires URL', code: 1 };
      const state = await browserOpen(session, url, timeoutMs);
      return { stdout: JSON.stringify({ url: state.page.url(), title: await state.page.title() }), stderr: '', code: 0 };
    }
    if (args.includes('screenshot')) {
      const f = args.find(a => a.startsWith('--filename='));
      if (!f) return { stdout: '', stderr: 'screenshot requires --filename', code: 1 };
      await browserScreenshot(session, f.slice('--filename='.length));
      return { stdout: '', stderr: '', code: 0 };
    }
    return { stdout: '', stderr: `Unsupported application-runtime Playwright command: ${args.join(' ')}`, code: 2 };
  } catch (error: any) {
    return { stdout: '', stderr: error?.stack || error?.message || String(error), code: 1 };
  }
}

export async function playwrightRunCode<T = unknown>(code: string, _cwd: string, session: string, timeoutMs = 120_000) {
  // Kept only for backwards compatibility. New adapters should use browserRunCode directly.
  // This helper intentionally does NOT construct source code with new Function().
  throw new Error('playwrightRunCode(string) is deprecated; use browserRunCode(session, callback) directly.');
}

export async function runMarkItDown(
  filePath: string,
  outputPath: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<CliResult> {
  // MarkItDown is an external CLI installed in the user's Python environment.
  // Prefer an explicit MARKITDOWN_BIN, then the normal executable. On Windows,
  // if the executable is not discoverable, fall back to `py -m markitdown` so
  // the acquisition pipeline remains deterministic and does not require an LLM.
  const configured = process.env.MARKITDOWN_BIN?.trim();
  const candidates: Array<{ command: string; argsPrefix: string[] }> = [];

  if (configured) {
    candidates.push({ command: stripOuterQuotes(configured), argsPrefix: [] });
  }
  candidates.push({ command: 'markitdown', argsPrefix: [] });

  if (process.platform === 'win32') {
    candidates.push({ command: process.env.PYTHON_BIN?.trim() || 'py', argsPrefix: ['-m', 'markitdown'] });
    candidates.push({ command: 'python', argsPrefix: ['-m', 'markitdown'] });
  } else {
    candidates.push({ command: process.env.PYTHON_BIN?.trim() || 'python3', argsPrefix: ['-m', 'markitdown'] });
    candidates.push({ command: 'python', argsPrefix: ['-m', 'markitdown'] });
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const result = await run(
        candidate.command,
        [...candidate.argsPrefix, filePath, '-o', outputPath],
        cwd,
        timeoutMs,
      );
      if (result.code === 0) return result;
      lastError = new Error(
        `${candidate.command} exited with code ${result.code}: ${(result.stderr || result.stdout).slice(-2000)}`,
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to invoke Microsoft MarkItDown. Install it with: python -m pip install "markitdown[all]"');
}

export function extractJson<T = unknown>(stdout: string): T {
  const start = Math.min(...['{', '['].map(c => {
    const i = stdout.indexOf(c); return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
  }));
  if (start === Number.MAX_SAFE_INTEGER) throw new Error('No JSON found');
  return JSON.parse(stdout.slice(start).trim()) as T;
}

export async function ensurePlaywrightBrowser(_cwd: string, timeoutMs = 45_000) {
  const result = await browserHealthCheck('about:blank', timeoutMs);
  if (!result.ok) throw new Error('Playwright browser is not launchable');
}

export function run(command: string, args: string[], cwd?: string, timeoutMs = 120_000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let done = false;
    const timer = setTimeout(() => { try { child.kill(); } catch {} if (!done) { done = true; resolve({ stdout, stderr, code: 124 }); } }, timeoutMs);
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.once('error', e => { clearTimeout(timer); if (!done) { done = true; reject(e); } });
    child.once('close', code => { clearTimeout(timer); if (!done) { done = true; resolve({ stdout, stderr, code: code ?? 1 }); } });
  });
}

export function getUnusedSpawnImplementationNote() { return 'CLI spawning is not required for browser runtime.'; }
