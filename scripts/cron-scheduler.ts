import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadAppConfig } from '../src/lib/config-manager.js';

const ROOT = process.cwd();

async function runCommand(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n[CRON] Executing scheduled command: npx ${cmd} ${args.join(' ')}`);
    const child = spawn('npx', [cmd, ...args], { cwd: ROOT, shell: true, stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function startCronDaemon() {
  console.log('====================================================');
  console.log('  Stock Research Pipeline - Cron Scheduler Daemon');
  console.log('====================================================');

  const config = await loadAppConfig();
  console.log(`Poll Interval: ${config.cron.pollIntervalSeconds} seconds`);
  console.log(`Market Scans Schedule : ${config.cron.marketScansSchedule}`);
  console.log(`Screener Schedule     : ${config.cron.screenerSchedule}`);
  console.log(`Top 20 Schedule       : ${config.cron.top20Schedule}`);
  console.log(`52W High Schedule     : ${config.cron.nse52WeekHighSchedule}`);
  console.log('----------------------------------------------------\n');

  let lastRunMinute = -1;

  setInterval(async () => {
    const now = new Date();
    const currentMinute = now.getMinutes();
    if (currentMinute === lastRunMinute) return;
    lastRunMinute = currentMinute;

    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri

    // Mon - Fri market scans at 16:00
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 16 && currentMinute === 0) {
      console.log(`[CRON TRIGGER] Market Scans triggered at ${now.toISOString()}`);
      await runCommand('tsx', ['src/index.ts', 'market-scans']);
    }

    // Mon - Fri top 20 momentum scan at 16:30
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 16 && currentMinute === 30) {
      console.log(`[CRON TRIGGER] Top 20 Momentum Scan triggered at ${now.toISOString()}`);
      await runCommand('tsx', ['src/index.ts', 'chartink-top20']);
    }

    // Mon - Fri 52-Week High scan at 16:45
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 16 && currentMinute === 45) {
      console.log(`[CRON TRIGGER] NSE 52-Week High Scan triggered at ${now.toISOString()}`);
      await runCommand('tsx', ['src/index.ts', 'nse-52week-high']);
    }

    // Friday weekly Screener run at 18:00
    if (dayOfWeek === 5 && hour === 18 && currentMinute === 0) {
      console.log(`[CRON TRIGGER] Screener Market Screens triggered at ${now.toISOString()}`);
      await runCommand('tsx', ['src/index.ts', 'screener-screens']);
    }
  }, config.cron.pollIntervalSeconds * 1000);

  console.log('[CRON] Daemon initialized. Listening for scheduled triggers...');
}

startCronDaemon().catch((err) => {
  console.error('Fatal error starting cron daemon:', err);
  process.exit(1);
});
