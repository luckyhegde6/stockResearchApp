import { mkdir, readFile, writeFile, stat, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function writeText(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function readText(filePath: string) {
  return readFile(filePath, 'utf8');
}

export async function fileExists(filePath: string) {
  try { await stat(filePath); return true; } catch { return false; }
}

export async function copyIfExists(src: string, dst: string) {
  if (!(await fileExists(src))) return false;
  await ensureDir(path.dirname(dst));
  await copyFile(src, dst);
  return true;
}

export async function resetDir(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
