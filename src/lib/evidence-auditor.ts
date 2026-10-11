import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

export type EvidenceAuditSeverity = 'pass' | 'warning' | 'error';
export interface EvidenceAuditCheck {
  id: string;
  severity: EvidenceAuditSeverity;
  detail: string;
}
export interface EvidenceAuditReport {
  schema_version: '1.0';
  generated_at: string;
  symbol: string;
  status: 'ready' | 'partial' | 'blocked' | 'not_found';
  readiness: { ready: boolean | null; blockingReasons: string[]; missingFiles: string[] } | null;
  counts: { sourceArtifacts: number; canonicalFacts: number; calculatedMetrics: number; checkedClaims: number };
  checks: EvidenceAuditCheck[];
  issues: string[];
  warnings: string[];
}

type JsonObject = Record<string, any>;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,19}$/;

async function readJson(file: string): Promise<{ value: unknown | null; error: 'missing' | 'invalid' | null }> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) return { value: null, error: 'invalid' };
    return { value: JSON.parse(await readFile(file, 'utf8')), error: null };
  } catch (error) {
    return { value: null, error: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid' };
  }
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function array(value: unknown): any[] { return Array.isArray(value) ? value : []; }
function unique(values: string[]): string[] { return [...new Set(values)]; }

export async function auditResearchEvidence(
  symbolInput: string,
  options: { repositoryRoot?: string; now?: () => Date } = {},
): Promise<EvidenceAuditReport> {
  const symbol = String(symbolInput ?? '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) throw new Error('Invalid symbol format');
  const root = path.resolve(options.repositoryRoot ?? process.cwd());
  const researchRoot = path.resolve(root, 'research');
  const researchDir = path.resolve(researchRoot, symbol);
  if (!researchDir.startsWith(researchRoot + path.sep)) throw new Error('Resolved symbol path escapes research directory');

  const checks: EvidenceAuditCheck[] = [];
  const check = (id: string, severity: EvidenceAuditSeverity, detail: string) => checks.push({ id, severity, detail });
  const files = {
    manifest: await readJson(path.join(researchDir, 'manifest.json')),
    readiness: await readJson(path.join(researchDir, 'analysis-readiness.json')),
    quality: await readJson(path.join(researchDir, 'evidence-quality.json')),
    health: await readJson(path.join(researchDir, 'source-health.json')),
    pack: await readJson(path.join(researchDir, 'normalized', 'analysis-evidence-pack.json')),
  };

  if (files.manifest.error === 'missing' && files.readiness.error === 'missing' && files.pack.error === 'missing') {
    check('research-artifacts', 'error', 'No manifest, readiness report, or analysis evidence pack found for this symbol.');
    return finish('not_found', null, 0, 0, 0, checks, symbol, options.now);
  }

  const manifest = object(files.manifest.value);
  const readiness = object(files.readiness.value);
  const quality = object(files.quality.value);
  const health = object(files.health.value);
  const pack = object(files.pack.value);

  if (!manifest) check('manifest', 'error', files.manifest.error === 'missing' ? 'manifest.json is missing.' : 'manifest.json is empty, unreadable, or invalid JSON.');
  else {
    check('manifest', 'pass', 'manifest.json is readable JSON.');
    const manifestTicker = String(manifest.ticker ?? '').trim().toUpperCase();
    if (!manifestTicker || manifestTicker !== symbol) check('ticker-match', 'error', `Requested symbol ${symbol} does not match manifest ticker ${manifestTicker || '(missing)'}.`);
    else check('ticker-match', 'pass', 'Manifest ticker matches the requested symbol.');

    const artifacts = array(manifest.sourceArtifacts);
    if (!Array.isArray(manifest.sourceArtifacts)) check('source-artifacts-shape', 'error', 'manifest.sourceArtifacts must be an array.');
    else {
      const ids = artifacts.map((item) => String(item?.id ?? '').trim());
      const missingIds = ids.filter((id) => !id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index && id);
      if (missingIds.length || duplicateIds.length) check('source-artifact-ids', 'error', `Source artifact IDs contain ${missingIds.length} missing and ${unique(duplicateIds).length} duplicate entries.`);
      else check('source-artifact-ids', 'pass', `${artifacts.length} source artifacts have non-empty unique IDs.`);
      const failed = artifacts.filter((item) => ['blocked', 'error', 'not_found'].includes(String(item?.status ?? '')));
      if (failed.length) check('source-artifact-status', 'warning', `${failed.length} source artifact(s) have blocked/error/not_found status.`);
      else check('source-artifact-status', 'pass', 'No source artifact is marked blocked, error, or not_found.');
    }
  }

  if (!readiness) check('readiness-report', 'error', files.readiness.error === 'missing' ? 'analysis-readiness.json is missing; deterministic readiness cannot be inferred.' : 'analysis-readiness.json is invalid JSON or has an invalid shape.');
  else if (typeof readiness.ready !== 'boolean') check('readiness-value', 'error', 'Readiness report must contain a boolean ready value.');
  else if (readiness.ready) check('readiness-value', 'pass', 'Deterministic analysis-readiness.json marks the evidence ready.');
  else check('readiness-value', 'error', 'Deterministic analysis-readiness.json blocks analysis; the auditor does not override it.');

  if (!quality) check('evidence-quality', files.quality.error === 'missing' ? 'warning' : 'error', files.quality.error === 'missing' ? 'evidence-quality.json is missing.' : 'evidence-quality.json is invalid JSON.');
  else check('evidence-quality', 'pass', 'evidence-quality.json is readable JSON.');
  if (!health) check('source-health', files.health.error === 'missing' ? 'warning' : 'error', files.health.error === 'missing' ? 'source-health.json is missing.' : 'source-health.json is invalid JSON.');
  else check('source-health', 'pass', 'source-health.json is readable JSON.');

  if (!pack) check('evidence-pack', 'error', files.pack.error === 'missing' ? 'normalized/analysis-evidence-pack.json is missing.' : 'Analysis evidence pack is invalid JSON or has an invalid shape.');
  const facts = array(pack?.canonicalFacts);
  const metrics = array(pack?.calculatedMetrics);
  if (pack) {
    const packTicker = String(pack.ticker ?? '').trim().toUpperCase();
    if (packTicker && packTicker !== symbol) check('pack-ticker-match', 'error', `Evidence pack ticker ${packTicker} does not match requested symbol ${symbol}.`);
    else check('evidence-pack-shape', 'pass', 'Analysis evidence pack is readable and symbol-consistent.');
  }

  const artifactIds = new Set(array(manifest?.sourceArtifacts).map((item) => String(item?.id ?? '')).filter(Boolean));
  const claims = [...facts.map((item) => ({ ...(object(item) ?? {}), _claimType: 'canonicalFact' })), ...metrics.map((item) => ({ ...(object(item) ?? {}), _claimType: 'calculatedMetric' }))];
  const claimIssues: string[] = [];
  for (const claim of claims) {
    if (!claim) continue;
    const label = String(claim.field ?? claim.id ?? claim._claimType);
    if (claim.sourceArtifact && !artifactIds.has(String(claim.sourceArtifact))) {
      claimIssues.push(`${label}: unknown sourceArtifact ${String(claim.sourceArtifact)}`);
    }
    if (claim._claimType === 'calculatedMetric' && !String(claim.method ?? '').trim()) {
      claimIssues.push(`${label}: calculated metric has no method`);
    }
    if (claim._claimType === 'canonicalFact' && claim.evidenceRole === 'source_fact' && !claim.sourceArtifact && !claim.sourceUrl && !claim.evidencePath) {
      claimIssues.push(`${label}: source fact has no source artifact, URL, or evidence path`);
    }
  }
  if (claimIssues.length) check('claim-provenance', 'error', `${claimIssues.length} claim provenance issue(s): ${claimIssues.slice(0, 8).join('; ')}${claimIssues.length > 8 ? '; …' : ''}`);
  else if (claims.length) check('claim-provenance', 'pass', `Checked provenance for ${claims.length} canonical facts/calculated metrics.`);
  else check('claim-provenance', 'warning', 'No canonical facts or calculated metrics were available to audit.');

  const packFreshness = array(pack?.sourceFreshness);
  if (manifest && pack && packFreshness.length && packFreshness.length !== array(manifest.sourceArtifacts).length) {
    check('source-freshness-parity', 'warning', `Manifest has ${array(manifest.sourceArtifacts).length} source artifacts but pack sourceFreshness has ${packFreshness.length} entries.`);
  } else if (manifest && pack && packFreshness.length) {
    check('source-freshness-parity', 'pass', 'Manifest source artifact count matches the pack sourceFreshness index.');
  }

  const blockingReasons = unique(array(readiness?.blockingReasons).map(String));
  const missingFiles = unique(array(readiness?.missingFiles).map(String));
  const issues = checks.filter((item) => item.severity === 'error').map((item) => `${item.id}: ${item.detail}`);
  const warnings = checks.filter((item) => item.severity === 'warning').map((item) => `${item.id}: ${item.detail}`);
  const status = !manifest && !readiness && !pack ? 'not_found'
    : issues.length ? 'blocked'
    : readiness?.ready === true && warnings.length === 0 ? 'ready' : 'partial';
  return {
    schema_version: '1.0',
    generated_at: (options.now?.() ?? new Date()).toISOString(),
    symbol,
    status,
    readiness: readiness ? { ready: typeof readiness.ready === 'boolean' ? readiness.ready : null, blockingReasons, missingFiles } : null,
    counts: { sourceArtifacts: array(manifest?.sourceArtifacts).length, canonicalFacts: facts.length, calculatedMetrics: metrics.length, checkedClaims: claims.length },
    checks,
    issues,
    warnings,
  };
}

function finish(
  status: EvidenceAuditReport['status'], readiness: EvidenceAuditReport['readiness'],
  sourceArtifacts: number, canonicalFacts: number, calculatedMetrics: number,
  checks: EvidenceAuditCheck[], symbol: string, now?: () => Date,
): EvidenceAuditReport {
  const issues = checks.filter((item) => item.severity === 'error').map((item) => `${item.id}: ${item.detail}`);
  const warnings = checks.filter((item) => item.severity === 'warning').map((item) => `${item.id}: ${item.detail}`);
  return { schema_version: '1.0', generated_at: (now?.() ?? new Date()).toISOString(), symbol, status, readiness,
    counts: { sourceArtifacts, canonicalFacts, calculatedMetrics, checkedClaims: canonicalFacts + calculatedMetrics }, checks, issues, warnings };
}
