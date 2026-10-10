import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ResearchManifest, SourceArtifact } from '../types/research.js';

export type CanonicalMethod = 'source_extraction' | 'deterministic_calculation';
export type EvidenceRole = 'source_fact' | 'calculated_metric' | 'document_evidence' | 'quality_signal' | 'operational_signal' | 'screening_evidence';

export interface CanonicalValue {
  id: string;
  evidenceRole: EvidenceRole;
  field: string;
  value: unknown;
  unit: string | null;
  period?: string | null;
  source: string;
  sourceArtifact?: string;
  method: CanonicalMethod;
  verified: boolean;
  asOf?: string | null;
  evidencePath?: string | null;
  sourceUrl?: string | null;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

export interface PeriodValue {
  period: string;
  value: number | string | null;
}

export function readJson(file: string): Promise<any | null> {
  return readFile(file, 'utf8').then(s => JSON.parse(s)).catch(() => null);
}

export function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let text = String(value).trim().replace(/₹/g, '').replace(/,/g, '').replace(/%/g, '').replace(/\s+/g, ' ');
  const paren = /^\((.*)\)$/.exec(text);
  if (paren) text = `-${paren[1]}`;
  const n = Number(text.replace(/[^0-9+\-\.eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || null;
}

export function findKeyDeep(obj: unknown, keys: readonly string[]): unknown {
  if (obj === null || obj === undefined) return undefined;
  const wanted = new Set(keys.map(k => k.toLowerCase()));
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findKeyDeep(item, keys);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (wanted.has(k.toLowerCase())) return v;
  }
  for (const v of Object.values(rec)) {
    const hit = findKeyDeep(v, keys);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export function findLabelValue(text: string, labels: string[]): string | null {
  const label = labels.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const patterns = [
    new RegExp(`(?:^|\\n|\\r)\\s*(?:${label})\\s*[:\\-]?\\s*([^\\n\\r|]+)`, 'i'),
    new RegExp(`(?:${label})\\s*[:\\-]?\\s*([^\\n\\r|]+)`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function findLabeledNumber(text: string, labels: string[]): number | null {
  const raw = findLabelValue(text, labels);
  return numberValue(raw);
}

export function artifactById(manifest: ResearchManifest, ids: string[]): SourceArtifact | undefined {
  return manifest.sourceArtifacts.find(a => ids.includes(a.id));
}

export function evidencePathFor(researchDir: string, source: string, filename: string): string {
  const folder = source.toLowerCase() === 'screener' ? 'screener' : source.toLowerCase() === 'tijori' ? 'tijori' : source.toLowerCase() === 'bse' ? 'bse' : 'nse-api';
  return path.join(researchDir, 'raw', folder, filename);
}

export function getText(data: any): string {
  return cleanText(data?.text ?? data?.content ?? data?.body ?? data?.html ?? '') ?? '';
}
