import { spawn } from 'node:child_process';
import path from 'node:path';

type PublishKind = 'research' | 'analysis';

/**
 * Best-effort publishing after a successful primary pipeline command.
 * A Google Sheets outage must never invalidate local deterministic research or analysis.
 * Publishing is automatic when a webhook URL/token are configured; set
 * GOOGLE_SHEETS_AUTO_EXPORT=false to disable it.
 */
export async function publishAfterPipelineRun(kind: PublishKind, symbol: string, root = process.cwd()): Promise<void> {
  const enabled = !/^(0|false|no)$/i.test(process.env.GOOGLE_SHEETS_AUTO_EXPORT || 'true');
  if (!enabled) {
    console.log('[sheets] Auto-export disabled by GOOGLE_SHEETS_AUTO_EXPORT.');
    return;
  }
  if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL || !process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN) {
    console.log('[sheets] Auto-export skipped: configure GOOGLE_SHEETS_WEBHOOK_URL and GOOGLE_SHEETS_WEBHOOK_TOKEN in .env.');
    return;
  }

  const script = path.join(root, 'scripts', 'export-to-google-sheets.ts');
  console.log(`[sheets] Publishing ${kind} results for ${symbol}...`);
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('npx', ['tsx', script, kind, symbol], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    child.on('close', code => resolve(code ?? 1));
    child.on('error', error => {
      console.warn(`[sheets] Could not start exporter: ${error.message}`);
      resolve(1);
    });
  });

  if (exitCode !== 0) {
    console.warn(`[sheets] Export failed (exit ${exitCode}); local output remains available. Retry with: npm run sheets:export -- ${kind} ${symbol}`);
  }
}
