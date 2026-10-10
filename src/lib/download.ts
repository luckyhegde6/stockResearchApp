import { ensureDir, writeText } from './fs.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function downloadFile(url: string, outputPath: string, headers: Record<string,string> = {}) {
  await ensureDir(path.dirname(outputPath));
  const response = await fetch(url, { headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    'Accept': '*/*',
    ...headers
  }, redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
  const body = new Uint8Array(await response.arrayBuffer());
  await writeFile(outputPath, body);
  return { bytes: body.byteLength, contentType: response.headers.get('content-type') || '' };
}

export async function downloadText(url: string, outputPath: string) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,*/*' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
  const text = await response.text();
  await writeText(outputPath, text);
  return text;
}
