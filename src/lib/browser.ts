import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export type BrowserSession = { browser: Browser; context: BrowserContext; page: Page; mode: string };
const sessions = new Map<string, BrowserSession>();

const NSE_RETRY_ARGS = [
  '--disable-quic',
  '--disable-http2',
  '--disable-blink-features=AutomationControlled',
];

function headlessSetting(): boolean {
  const raw = (process.env.PLAYWRIGHT_HEADLESS ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  // NSE is more reliable in a real headed Chromium window on some Windows setups.
  return false;
}

async function launch(mode: 'nse' | 'default'): Promise<BrowserSession> {
  const baseArgs = mode === 'nse'
    ? NSE_RETRY_ARGS
    : ['--disable-blink-features=AutomationControlled'];
  const configuredHeadless = headlessSetting();
  const browser = await chromium.launch({
    headless: configuredHeadless,
    args: baseArgs,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  const storageState = mode === 'default' && process.env.SCREENER_STORAGE_STATE
    ? path.resolve(process.env.SCREENER_STORAGE_STATE)
    : undefined;
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
    userAgent: process.env.PLAYWRIGHT_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: process.env.PLAYWRIGHT_LOCALE || 'en-IN',
    timezoneId: process.env.PLAYWRIGHT_TIMEZONE || 'Asia/Kolkata',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const req = route.request();
    if (req.resourceType() === 'image' && process.env.PLAYWRIGHT_BLOCK_IMAGES === 'true') {
      return route.abort();
    }
    return route.continue();
  });
  return { browser, context, page, mode: `${mode}:${configuredHeadless ? 'headless' : 'headed'}` };
}

export async function getBrowserSession(session: string, mode: 'nse' | 'default' = 'default') {
  const existing = sessions.get(session);
  if (existing) {
    try {
      if (!existing.page.isClosed()) return existing;
    } catch {}
    try { await existing.context.close(); } catch {}
    try { await existing.browser.close(); } catch {}
    sessions.delete(session);
  }
  const state = await launch(mode);
  sessions.set(session, state);
  return state;
}

export async function resetBrowserSession(session: string, mode: 'nse' | 'default' = 'nse') {
  const existing = sessions.get(session);
  if (existing) {
    sessions.delete(session);
    try { await existing.context.close(); } catch {}
    try { await existing.browser.close(); } catch {}
  }
  const state = await launch(mode);
  sessions.set(session, state);
  return state;
}

export async function closeBrowserSession(session: string) {
  const state = sessions.get(session);
  if (!state) return;
  sessions.delete(session);
  try { await state.context.close(); } catch {}
  try { await state.browser.close(); } catch {}
}

export async function closeAllBrowserSessions() {
  const names = [...sessions.keys()];
  await Promise.all(names.map(closeBrowserSession));
}

export async function browserGoto(session: string, url: string, timeoutMs = 90_000, mode: 'nse' | 'default' = 'default') {
  let state = await getBrowserSession(session, mode);
  const attempts: Array<{ waitUntil: 'commit' | 'domcontentloaded'; timeout: number }> = [
    { waitUntil: 'commit', timeout: Math.min(timeoutMs, 45_000) },
    { waitUntil: 'domcontentloaded', timeout: timeoutMs },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      await state.page.goto(url, attempt);
      return state;
    } catch (error) {
      lastError = error;
      const message = String((error as any)?.message || error);
      // Retry once with a fresh headed browser when Chromium reports transport/http2 errors.
      if (/ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ERR_FAILED/i.test(message)) {
        try { await state.context.close(); } catch {}
        try { await state.browser.close(); } catch {}
        state = await resetBrowserSession(session, 'nse');
        continue;
      }
      if (!/Timeout/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Navigation failed'));
}

export async function browserOpen(session: string, url: string, timeoutMs = 90_000) {
  return browserGoto(session, url, timeoutMs, 'default');
}

export async function browserRunCode<T = unknown>(
  session: string,
  fn: (page: Page) => Promise<T>,
  options?: { url?: string; timeoutMs?: number; mode?: 'nse' | 'default'; screenshotPath?: string },
) {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  let state = await getBrowserSession(session, options?.mode ?? 'default');
  if (options?.url) state = await browserGoto(session, options.url, timeoutMs, options?.mode ?? 'default');
  const result = await fn(state.page);
  if (options?.screenshotPath) await state.page.screenshot({ path: options.screenshotPath, fullPage: true });
  return result;
}

export async function browserScreenshot(session: string, screenshotPath: string) {
  const state = await getBrowserSession(session, 'nse');
  await state.page.screenshot({ path: screenshotPath, fullPage: true });
}

export async function browserHealthCheck(url = 'https://www.nseindia.com/', timeoutMs = 45_000) {
  const session = `doctor-${Date.now()}`;
  try {
    const state = await browserGoto(session, url, timeoutMs, 'nse');
    const title = await state.page.title().catch(() => '');
    const finalUrl = state.page.url();
    return { ok: true, title, finalUrl, mode: state.mode };
  } finally {
    await closeBrowserSession(session);
  }
}
