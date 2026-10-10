import 'dotenv/config';

const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
const tokenConfigured = Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN?.trim());
const expectedSpreadsheetId =
  process.env.GOOGLE_SHEETS_ID?.trim() || '1YMKesB9CBnntEnLp-rznzuOOixWDwX6WaWqb-FmtRak';

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
  throw new Error(message);
}

function htmlTitle(body: string): string | undefined {
  return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.replace(/\s+/g, ' ').trim();
}

async function main(): Promise<void> {
  if (!endpoint) {
    fail('GOOGLE_SHEETS_WEBHOOK_URL is empty. Copy the current Web app URL from Apps Script → Deploy → Manage deployments. It must end in /exec.');
  }
  if (!tokenConfigured) {
    fail('GOOGLE_SHEETS_WEBHOOK_TOKEN is empty. Set it to the same private token as the Apps Script API_TOKEN Script Property.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    fail('GOOGLE_SHEETS_WEBHOOK_URL is not a valid URL.');
  }
  if (parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[^/]+\/exec$/.test(parsedUrl.pathname)) {
    fail('GOOGLE_SHEETS_WEBHOOK_URL must be the deployed Apps Script URL shaped like https://script.google.com/macros/s/DEPLOYMENT_ID/exec. Do not use the editor URL or /dev URL.');
  }

  console.log('[sheets:doctor] Checking the deployed Apps Script GET health endpoint (no data is written).');
  let response: Response;
  try {
    response = await fetch(parsedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Could not reach the Apps Script endpoint: ${detail}`);
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const title = htmlTitle(body);
    fail(`Apps Script health endpoint returned HTTP ${response.status}${title ? ` (${title})` : ''}. This is not a successful webhook health check. Redeploy the Apps Script web app and replace GOOGLE_SHEETS_WEBHOOK_URL with the current /exec URL.`);
  }
  if (/text\/html/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(body)) {
    const title = htmlTitle(body);
    fail(`Expected Apps Script JSON but received HTML${title ? ` (${title})` : ''}. The endpoint URL may be stale, invalid, or blocked by Google account/Workspace access policy.`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    fail('Apps Script endpoint returned a non-JSON response. Check that Code.gs is deployed as a Web app and the /exec URL is correct.');
  }
  if (!payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true ||
      !('service' in payload) || payload.service !== 'stock-research-sheet-sink') {
    fail('The endpoint responded, but it is not the expected StockResearch Apps Script sink. Deploy integrations/google-sheets/Code.gs as a Web app.');
  }

  const result = payload as Record<string, unknown>;
  if (result.serviceVersion !== '2') {
    fail('The deployed Apps Script is outdated or missing serviceVersion 2. Paste the latest integrations/google-sheets/Code.gs into Apps Script, save, deploy a new Web app version, then rerun sheets:doctor.');
  }
  const workbookUrl = typeof result.workbookUrl === 'string' ? result.workbookUrl : '';
  const actualId = /\/spreadsheets\/d\/([^/]+)/.exec(workbookUrl)?.[1];
  if (!actualId) {
    fail('Apps Script health response did not include a workbook URL. Check the SHEET_ID Script Property and redeploy.');
  }
  if (actualId !== expectedSpreadsheetId) {
    fail(`Apps Script is configured for a different workbook (ID ends in …${actualId.slice(-6)}). Update the SHEET_ID Script Property to match GOOGLE_SHEETS_ID.`);
  }

  console.log(JSON.stringify({
    ok: true,
    service: result.service,
    serviceVersion: result.serviceVersion,
    endpointHost: parsedUrl.hostname,
    finalResponseHost: new URL(response.url).hostname,
    httpStatus: response.status,
    tokenConfigured,
    spreadsheetIdMatches: true,
    workbookUrl,
    nextStep: 'If export still fails, run npm run sheets:export -- research HDFCBANK and inspect its concise error.',
  }, null, 2));
}

main().catch(error => {
  // fail() already printed a concise, actionable JSON diagnostic.
  if (process.exitCode !== 1) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
