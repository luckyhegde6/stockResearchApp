import { buildEvidenceReconciliation } from '../src/lib/evidence-reconciliation.js';
import type { CanonicalValue } from '../src/lib/canonical.js';

function value(overrides: Partial<CanonicalValue> & Pick<CanonicalValue,'id'|'field'|'value'|'unit'|'source'>): CanonicalValue {
  return {
    id: overrides.id,
    evidenceRole: 'source_fact',
    field: overrides.field,
    value: overrides.value,
    unit: overrides.unit,
    period: overrides.period ?? null,
    source: overrides.source,
    sourceArtifact: overrides.sourceArtifact ?? overrides.source,
    method: 'source_extraction',
    verified: true,
    asOf: overrides.asOf ?? null,
    evidencePath: null,
    sourceUrl: null,
    confidence: 'high',
    ...overrides,
  };
}

const quarterlyValues = [
  value({ id:'income-jun', field:'total_income', value:17012100, unit:'INR lakh', period:'Jun-2026', source:'NSE' }),
  value({ id:'income-mar', field:'total_income', value:14974200, unit:'INR lakh', period:'Mar-2026', source:'NSE' }),
  value({ id:'income-jun-copy', field:'total_income', value:17012100, unit:'INR lakh', period:'Jun 2026', source:'NSE fallback' }),
];
const quarterly = buildEvidenceReconciliation(quarterlyValues);
if (quarterly.conflictCount !== 0) throw new Error('Different financial periods must not be treated as source conflicts.');

const cap = buildEvidenceReconciliation([
  value({ id:'cap-nse', field:'market_cap', value:16442034547230, unit:'INR', source:'NSE' }),
  value({ id:'cap-tijori', field:'market_cap', value:1655435, unit:'INR crore', source:'Tijori' }),
]);
if (cap.conflictCount !== 0) throw new Error('Market-cap INR and INR-crore values should be converted to comparable units before comparison.');

const currentPe = buildEvidenceReconciliation([
  value({ id:'pe-screener', field:'pe_ratio', value:105134, unit:'x', period:'Jun 2023', source:'Screener' }),
  value({ id:'pe-tijori', field:'pe_ratio', value:22.15, unit:'x', source:'Tijori' }),
]);
if (currentPe.conflictCount !== 0) throw new Error('Period-scoped historical valuation must not conflict with an undated value.');

const currentRoe = buildEvidenceReconciliation([
  value({ id:'roe-screener', field:'roe', value:7.71, unit:'%', source:'Screener' }),
  value({ id:'roe-tijori', field:'roe', value:8.93, unit:'%', source:'Tijori' }),
]);
if (currentRoe.conflictCount !== 1 || currentRoe.conflicts[0]?.field !== 'roe') {
  throw new Error('Comparable undated ROE values that materially disagree must remain an explicit conflict.');
}

const samePeriodConflict = buildEvidenceReconciliation([
  value({ id:'pat-nse', field:'profit_after_tax', value:100, unit:'INR crore', period:'Mar-2026', source:'NSE' }),
  value({ id:'pat-other', field:'profit_after_tax', value:130, unit:'INR crore', period:'Mar 2026', source:'Screener' }),
]);
if (samePeriodConflict.conflictCount !== 1) throw new Error('Different values for the same field and period must remain a conflict.');

const unitMismatch = buildEvidenceReconciliation([
  value({ id:'debt-crore', field:'debt', value:100, unit:'INR crore', source:'Screener' }),
  value({ id:'debt-percent', field:'debt', value:10, unit:'%', source:'Tijori' }),
]);
if (unitMismatch.conflictCount !== 0) throw new Error('Values with incompatible units must not be compared as numeric conflicts.');

console.log(JSON.stringify({
  ok:true,
  differentPeriods:quarterly.conflictCount,
  normalizedMarketCap:cap.conflictCount,
  historicalVsUndatedPe:currentPe.conflictCount,
  genuineUndatedRoeConflict:currentRoe.conflictCount,
  samePeriodConflict:samePeriodConflict.conflictCount,
  incompatibleUnits:unitMismatch.conflictCount,
},null,2));
