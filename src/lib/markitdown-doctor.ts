import { runMarkItDown } from './cli.js';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function createPdf(text: string): string {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\\\]/g, '\\\\async function main() {
')}) Tj ET\\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\\nstream\\n${stream}endstream`,
  ];
  let pdf = '%PDF-1.4\\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\\n${objects[i]}\\nendobj\\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\\n0 ${objects.length + 1}\\n0000000000 65535 f \\n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \\n`;
  }
  pdf += `trailer\\n<< /Size ${objects.length + 1} /Root 1 0 R >>\\nstartxref\\n${xrefOffset}\\n%%EOF\\n`;
  return pdf;
}

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
    await writeFile(pdfInput, createPdf(expectedPdfText), 'ascii');
    const pdfResult = await runMarkItDown(pdfInput, pdfOutput, process.cwd(), 60_000);
    if (pdfResult.code !== 0) {
      throw new Error(`PDF conversion failed: ${(pdfResult.stderr || pdfResult.stdout).slice(-2000)}`);
    }
    const convertedPdf = await readFile(pdfOutput, 'utf8');
    if (!convertedPdf.includes(expectedPdfText)) {
      throw new Error(`PDF conversion output did not contain expected text. Output preview: ${convertedPdf.slice(0, 500)}`);
    }
    console.log('MarkItDown PDF conversion: OK');
    console.log(`pdfOutputBytes=${Buffer.byteLength(convertedPdf, 'utf8')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e:any)=>{ console.error(e?.stack || e?.message || String(e)); process.exit(1); });
