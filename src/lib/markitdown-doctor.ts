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
  const pdfInput = path.join(dir, 'sample.pdf');
  const pdfOutput = path.join(dir, 'sample-pdf.md');
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

    const expectedPdfText = 'PDF ingestion smoke test';
    const pdfBase64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggNTYgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3MjAgVGQgKFBERiBpbmdlc3Rpb24gc21va2UgdGVzdCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDMxMSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQxNgolJUVPRgo=';
    await writeFile(pdfInput, Buffer.from(pdfBase64, 'base64'));
    const pdfResult = await runMarkItDown(pdfInput, pdfOutput, process.cwd(), 60_000);
    if (pdfResult.code !== 0) {
      throw new Error('PDF conversion failed: ' + (pdfResult.stderr || pdfResult.stdout).slice(-2000));
    }
    const convertedPdf = await readFile(pdfOutput, 'utf8');
    if (!convertedPdf.includes(expectedPdfText)) {
      throw new Error('PDF conversion output did not contain expected text. Output preview: ' + convertedPdf.slice(0, 500));
    }
    console.log('MarkItDown PDF conversion: OK');
    console.log('pdfOutputBytes=' + Buffer.byteLength(convertedPdf, 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e:any)=>{ console.error(e?.stack || e?.message || String(e)); process.exit(1); });
