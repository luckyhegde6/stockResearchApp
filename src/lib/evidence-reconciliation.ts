import type { CanonicalValue } from './canonical.js';
import { sourcePriority } from './source-precedence.js';

export interface EvidenceReconciliation {
  schema_version: '1.3';
  conflicts: Array<Record<string, unknown>>;
  conflictCount: number;
  resolved: Record<string, CanonicalValue>;
}

function normalizePeriod(period: unknown): string {
  if (period === null || period === undefined || String(period).trim() === '') return 'undated';
  const raw = String(period).trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
  const monthYear = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s/-]+(\d{4})$/i.exec(raw);
  if (monthYear) return `${monthYear[1].slice(0,3).toLowerCase()}-${monthYear[2]}`;
  const fy = /^(?:fy\s*)?(\d{4})\s*[-/]\s*(\d{2,4})$/i.exec(raw);
  if (fy) return `fy-${fy[1]}-${fy[2].length === 2 ? `20${fy[2]}` : fy[2]}`;
  return raw.toLowerCase();
}

function normalizedField(field: string): string {
  return ['last_price', 'current_price'].includes(field) ? 'current_price' : field;
}

function comparableUnit(unit: unknown, value: number): { unit: string; value: number } {
  const raw = String(unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases: Record<string, string> = {
    'inr crores': 'inr crore',
    'crore': 'inr crore',
    'crores': 'inr crore',
    '₹ crore': 'inr crore',
    'inr lakhs': 'inr lakh',
    'lakhs': 'inr lakh',
    'lakh': 'inr lakh',
    '₹ lakh': 'inr lakh',
    'rupees': 'inr',
    'rs': 'inr',
    '₹': 'inr',
    'percentage': '%',
    'percent': '%',
    'times': 'x',
    'multiple': 'x',
    'inr per share': 'inr/share',
    '₹/share': 'inr/share',
  };
  let unitKey = aliases[raw] ?? raw;
  let normalizedValue = value;

  // Currency totals can be compared only after conversion to a shared scale.
  if (unitKey === 'inr') {
    unitKey = 'inr crore';
    normalizedValue = value / 10_000_000;
  } else if (unitKey === 'inr lakh') {
    unitKey = 'inr crore';
    normalizedValue = value / 100;
  } else if (unitKey === 'inr million') {
    unitKey = 'inr crore';
    normalizedValue = value / 10;
  }

  return { unit: unitKey || 'unspecified', value: normalizedValue };
}

export function buildEvidenceReconciliation(
  evidence: CanonicalValue[],
  thresholdPct = Number(process.env.EVIDENCE_CONFLICT_THRESHOLD_PCT || 1.5),
): EvidenceReconciliation {
  const groups = new Map<string, Array<{ evidence: CanonicalValue; value: number }>>();
  for (const item of evidence) {
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) continue;
    const field = normalizedField(item.field);
    const period = normalizePeriod(item.period);
    const normalized = comparableUnit(item.unit, item.value);
    const key = [field, period, normalized.unit].join('|');
    const entries = groups.get(key) ?? [];
    entries.push({ evidence: item, value: normalized.value });
    groups.set(key, entries);
  }

  const conflicts: Array<Record<string, unknown>> = [];
  const resolved: Record<string, CanonicalValue> = {};
  for (const [key, entries] of groups) {
    if (entries.length < 2) continue;
    const values = entries.map(entry => entry.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spreadPct = min === 0 ? (max === 0 ? 0 : Infinity) : Math.abs((max - min) / Math.abs(min)) * 100;
    const [field, period, unit] = key.split('|');
    const originalValues = entries.map(entry => entry.evidence);
    if (spreadPct <= thresholdPct) {
      const best = [...entries].sort((a, b) => sourcePriority(b.evidence.source, field) - sourcePriority(a.evidence.source, field))[0];
      resolved[field + (period === 'undated' ? '' : `@${period}`)] = best.evidence;
    } else {
      conflicts.push({
        id: `conflict-${field}-${period}`,
        kind: 'conflict',
        field,
        period: period === 'undated' ? null : period,
        unit,
        values: originalValues,
        normalizedValues: entries.map(entry => ({ id: entry.evidence.id, value: entry.value, unit })),
        numericSpread: max - min,
        spreadPct,
        method: 'period_and_unit_aware_cross_source_comparison',
        resolution: 'unresolved',
        note: 'Only values with the same field, reporting period and comparable units are compared.',
      });
    }
  }
  return { schema_version: '1.3', conflicts, conflictCount: conflicts.length, resolved };
}
