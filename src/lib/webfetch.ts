import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from './fs.js';

export interface WebFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  bytes: number;
  body: Uint8Array;
  text?: string;
}

const UA = process.env.WEBFETCH_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

export async function webFetch(url: string, options: RequestInit = {}, timeoutMs = 45_000): Promise<WebFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('User-Agent')) headers.set('User-Agent', UA);
    if (!headers.has('Accept')) headers.set('Accept', '*/*');
    const response = await fetch(url, { ...options, headers, redirect: 'follow', signal: controller.signal });
    const body = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      contentType,
      bytes: body.byteLength,
      body,
      text: /text\//i.test(contentType) || /json|javascript|xml/i.test(contentType)
        ? new TextDecoder('utf-8', { fatal: false }).decode(body)
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function webFetchToFile(url: string, outputPath: string, options: RequestInit = {}, timeoutMs = 45_000) {
  const result = await webFetch(url, options, timeoutMs);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`HTTP ${result.status} fetching ${url}`);
  }
  await ensureDir(path.dirname(outputPath));
  await writeFile(outputPath, result.body);
  return result;
}

export async function webFetchText(url: string, options: RequestInit = {}, timeoutMs = 45_000) {
  const result = await webFetch(url, options, timeoutMs);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`HTTP ${result.status} fetching ${url}`);
  }
  return result;
}
