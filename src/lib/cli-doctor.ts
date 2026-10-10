import { browserHealthCheck, closeBrowserSession } from './browser.js';

async function main() {
  console.log(`Playwright runtime doctor`);
  console.log(`cwd=${process.cwd()}`);
  console.log(`node=${process.version}`);
  try {
    const blank = await browserHealthCheck('about:blank', 30_000);
    console.log(`Playwright Library: OK (${blank.mode})`);
    const nse = await browserHealthCheck('https://www.nseindia.com/', 60_000);
    console.log(`NSE navigation: OK (${nse.mode})`);
    console.log(`NSE title=${nse.title || '(empty)'}`);
    console.log(`NSE finalUrl=${nse.finalUrl}`);
    console.log('Browser automation is ready.');
  } catch (error: any) {
    console.error(`Playwright/NSE check failed: ${error?.stack || error?.message || String(error)}`);
    process.exitCode = 1;
  } finally {
    await closeBrowserSession('unused').catch(() => {});
  }
}

main().catch(error => { console.error(error); process.exit(1); });
