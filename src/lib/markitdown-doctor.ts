import { runMarkItDown } from './cli.js';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function main() {
  console.log('MarkItDown doctor');
  console.log(`cwd=${process.cwd()}`);
  console.log(`node=${process.version}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stock-research-markitdown-'));
  const input = path.join(dir, 'sample.txt');
  const output = path.join(dir, 'sample.md');
  try {
    await writeFile(input, '# MarkItDown test\n\nPipeline conversion test.\n', 'utf8');
    const result = await runMarkItDown(input, output, process.cwd(), 60_000);
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout).slice(-2000));
    }
    const text = await readFile(output, 'utf8');
    console.log('MarkItDown: OK');
    console.log(`output=${output}`);
    console.log(`bytes=${Buffer.byteLength(text,'utf8')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e:any)=>{ console.error(e?.stack || e?.message || String(e)); process.exit(1); });
