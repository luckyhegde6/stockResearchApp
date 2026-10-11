import { readFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

export type AgentStatus = 'complete' | 'partial' | 'blocked' | 'failed';
export type AgentClaimType = 'sourced_fact' | 'deterministic_calculation' | 'interpretation' | 'assumption';

export interface AgentEvidenceRef {
  id: string;
  kind: 'artifact' | 'url' | 'calculation' | 'run';
  path?: string | null;
  url?: string | null;
  as_of?: string | null;
  retrieved_at?: string | null;
  note?: string | null;
}

export interface AgentClaim {
  claim_id: string;
  claim_type: AgentClaimType;
  text: string;
  value?: string | number | boolean | null;
  unit?: string | null;
  as_of?: string | null;
  method?: string | null;
  evidence_refs: string[];
}

export interface AgentResult {
  schema_version: string;
  agent_id: string;
  run_id: string;
  symbol?: string | null;
  generated_at: string;
  status: AgentStatus;
  summary: string;
  claims: AgentClaim[];
  evidence_refs: AgentEvidenceRef[];
  missing_data: string[];
  conflicts: string[];
  caveats: string[];
  next_actions: string[];
  validation: Array<{
    check: string;
    status: 'pass' | 'fail' | 'not_run' | 'not_applicable';
    detail?: string | null;
  }>;
}

export interface AgentValidationIssue {
  keyword: string;
  instancePath: string;
  message: string;
}

export interface AgentValidationReport {
  valid: boolean;
  issues: AgentValidationIssue[];
  policyIssues: string[];
}

export interface AgentAuditRecord {
  schema_version: '1.0';
  run_id: string;
  agent_id: string;
  task_type: string;
  symbol: string | null;
  started_at: string;
  completed_at: string;
  status: AgentStatus;
  input_artifacts: string[];
  validation: AgentValidationReport;
  failure_class: string | null;
}

export interface HarnessOptions {
  repositoryRoot?: string;
  auditPath?: string;
  allowedAgentIds?: string[];
  maxResultBytes?: number;
  now?: () => Date;
}

const DEFAULT_MAX_RESULT_BYTES = 256 * 1024;
const DEFAULT_AUDIT_PATH = path.join('.agents', 'runs', 'audit.jsonl');
const PRIVATE_KEY_PATTERN = /(?:^|[_-])(api[_-]?key|token|secret|password|authorization|cookie|private[_-]?key)(?:$|[_-])/i;
const ABSOLUTE_PATH_PATTERN = /(?:[A-Z]:\\[^\s"'<>]+|(?:^|\s)\/(?:Users|home|mnt|private|var|tmp)\/[^\s"'<>]+)/;
const INJECTION_PATTERN = /ignore\s+(all\s+)?(previous|prior|above)\s+instructions|reveal\s+(the\s+)?(system|developer)\s+prompt|exfiltrat\w*|place\s+(an?\s+)?(market\s+)?order|execute\s+(a\s+)?trade/i;

let validatorPromise: Promise<ValidateFunction<AgentResult>> | undefined;

async function loadValidator(repositoryRoot: string): Promise<ValidateFunction<AgentResult>> {
  if (!validatorPromise) {
    validatorPromise = (async () => {
      const schemaPath = path.join(repositoryRoot, '.agents', 'harness', 'agent-result.schema.json');
      const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      return ajv.compile<AgentResult>(schema);
    })();
  }
  return validatorPromise;
}

function normalizeAjvIssues(errors: ErrorObject[] | null | undefined): AgentValidationIssue[] {
  return (errors ?? []).map((error) => ({
    keyword: error.keyword,
    instancePath: error.instancePath,
    message: error.message ?? 'schema validation failed',
  }));
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((child) => collectStrings(child, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectStrings(child, out));
  return out;
}

function policyChecks(result: AgentResult): string[] {
  const problems: string[] = [];
  const refs = new Set(result.evidence_refs.map((ref) => ref.id));

  for (const claim of result.claims) {
    if (claim.claim_type === 'sourced_fact' && claim.evidence_refs.length === 0) {
      problems.push(`sourced fact ${claim.claim_id} has no evidence reference`);
    }
    for (const ref of claim.evidence_refs) {
      if (!refs.has(ref)) problems.push(`claim ${claim.claim_id} references unknown evidence id ${ref}`);
    }
    if (claim.claim_type === 'deterministic_calculation' && !claim.method) {
      problems.push(`calculation ${claim.claim_id} does not declare a method`);
    }
  }

  const strings = collectStrings(result);
  if (strings.some((value) => PRIVATE_KEY_PATTERN.test(value))) {
    problems.push('possible credential or secret field detected in agent result');
  }
  if (strings.some((value) => ABSOLUTE_PATH_PATTERN.test(value))) {
    problems.push('absolute local filesystem path detected in agent result');
  }
  if (strings.some((value) => INJECTION_PATTERN.test(value))) {
    problems.push('unsafe instruction or prohibited execution language detected; require manual review');
  }
  return [...new Set(problems)];
}

export async function validateAgentResult(
  input: unknown,
  options: HarnessOptions = {},
): Promise<AgentValidationReport> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const maxResultBytes = options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
  const serialized = JSON.stringify(input);
  if (serialized === undefined) {
    return { valid: false, issues: [{ keyword: 'type', instancePath: '', message: 'result must be JSON-serializable' }], policyIssues: [] };
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxResultBytes) {
    return { valid: false, issues: [{ keyword: 'maxBytes', instancePath: '', message: `result exceeds ${maxResultBytes} byte limit` }], policyIssues: [] };
  }

  const validate = await loadValidator(repositoryRoot);
  const validSchema = validate(input);
  const issues = normalizeAjvIssues(validate.errors);
  if (!validSchema) return { valid: false, issues, policyIssues: [] };

  const result = input as AgentResult;
  const policyIssues = policyChecks(result);
  const allowed = options.allowedAgentIds;
  if (allowed && !allowed.includes(result.agent_id)) {
    policyIssues.push(`agent id "${result.agent_id}" is not allowed for this harness invocation`);
  }
  return { valid: issues.length === 0 && policyIssues.length === 0, issues, policyIssues };
}

function statusAfterValidation(result: AgentResult, report: AgentValidationReport): AgentStatus {
  if (!report.valid) return 'failed';
  return result.status;
}

export async function writeAgentAuditRecord(
  record: AgentAuditRecord,
  options: HarnessOptions = {},
): Promise<string> {
  const root = path.resolve(options.repositoryRoot ?? process.cwd());
  const auditPath = path.resolve(root, options.auditPath ?? DEFAULT_AUDIT_PATH);
  if (!auditPath.startsWith(root + path.sep)) throw new Error('Audit path must remain within repository root');
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
  return auditPath;
}

export async function inspectResearchEvidence(
  symbolInput: string,
  options: HarnessOptions = {},
): Promise<Record<string, unknown>> {
  const symbol = String(symbolInput ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(symbol)) throw new Error('Invalid symbol format');
  const root = path.resolve(options.repositoryRoot ?? process.cwd());
  const researchRoot = path.resolve(root, 'research');
  const symbolDir = path.resolve(researchRoot, symbol);
  if (!symbolDir.startsWith(researchRoot + path.sep)) throw new Error('Resolved symbol path escapes research directory');

  async function readJson(name: string): Promise<unknown> {
    try {
      const file = path.join(symbolDir, name);
      if (!file.startsWith(symbolDir + path.sep)) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return null;
    }
  }

  const manifest = await readJson('manifest.json') as Record<string, any> | null;
  const readiness = await readJson('analysis-readiness.json') as Record<string, any> | null;
  const sourceHealth = await readJson('source-health.json') as Record<string, any> | null;
  const evidenceQuality = await readJson('evidence-quality.json') as Record<string, any> | null;
  const pack = await readJson('normalized/analysis-evidence-pack.json') as Record<string, any> | null;

  const exists = Boolean(manifest || readiness || sourceHealth || evidenceQuality || pack);
  return {
    schema_version: '1.0',
    generated_at: (options.now?.() ?? new Date()).toISOString(),
    symbol,
    status: !exists ? 'not_found' : readiness?.ready === true ? 'ready' : readiness ? 'blocked_or_partial' : 'readiness_missing',
    manifest: manifest ? {
      ticker: manifest.ticker ?? null,
      runId: manifest.runId ?? null,
      generatedAt: manifest.generatedAt ?? null,
      acquisitionOnly: manifest.acquisitionOnly ?? null,
      sourceArtifactCount: Array.isArray(manifest.sourceArtifacts) ? manifest.sourceArtifacts.length : null,
      dataGaps: Array.isArray(manifest.dataGaps) ? manifest.dataGaps : [],
      warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
    } : null,
    readiness: readiness ? {
      ready: readiness.ready ?? null,
      deterministic: readiness.deterministic ?? null,
      blockingReasons: Array.isArray(readiness.blockingReasons) ? readiness.blockingReasons : [],
      advisoryReasons: Array.isArray(readiness.advisoryReasons) ? readiness.advisoryReasons : [],
      missingFiles: Array.isArray(readiness.missingFiles) ? readiness.missingFiles : [],
      actionableWarnings: Array.isArray(readiness.actionableWarnings) ? readiness.actionableWarnings : [],
      contractEntries: readiness.contractEntries ?? null,
      qualityStatus: readiness.qualityStatus ?? null,
      sourceHealthStatus: readiness.sourceHealthStatus ?? null,
    } : null,
    sourceHealth: sourceHealth ? {
      overall: sourceHealth.overall ?? null,
      overallStatus: sourceHealth.overallStatus ?? null,
      sourceCount: sourceHealth.sources && typeof sourceHealth.sources === 'object' ? Object.keys(sourceHealth.sources).length : null,
    } : null,
    evidenceQuality: evidenceQuality ? {
      status: evidenceQuality.status ?? evidenceQuality.report?.status ?? null,
      summary: evidenceQuality.summary ?? evidenceQuality.report?.summary ?? null,
      coreCompleteness: evidenceQuality.coreCompleteness ?? evidenceQuality.report?.coreCompleteness ?? null,
    } : null,
    evidencePack: pack ? {
      schema_version: pack.schema_version ?? null,
      ticker: pack.ticker ?? pack.symbol ?? null,
      generatedAt: pack.generatedAt ?? pack.generated_at ?? null,
      topLevelKeys: Object.keys(pack).slice(0, 80),
    } : null,
  };
}

export async function runAgentValidation(
  input: unknown,
  options: HarnessOptions & { agentId?: string; taskType?: string; symbol?: string | null; inputArtifacts?: string[] } = {},
): Promise<{ result: AgentResult | null; validation: AgentValidationReport; auditPath: string | null }> {
  const started = (options.now?.() ?? new Date()).toISOString();
  let parsed: AgentResult | null = null;
  let validation: AgentValidationReport;
  let status: AgentStatus = 'failed';
  let runId = randomUUID();
  let agentId = options.agentId ?? 'unknown';
  try {
    const encoded = typeof input === 'string' ? input : JSON.stringify(input);
    if (typeof encoded !== 'string') throw new Error('Agent result must be JSON-serializable');
    if (Buffer.byteLength(encoded, 'utf8') > (options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES)) {
      throw new Error('Agent result exceeds configured size limit');
    }
    const candidate = typeof input === 'string' ? JSON.parse(input) : input;
    validation = await validateAgentResult(candidate, options);
    if (validation.valid) {
      parsed = candidate as AgentResult;
      agentId = parsed.agent_id;
      runId = parsed.run_id;
      status = parsed.status;
    } else {
      status = 'failed';
    }
  } catch (error) {
    validation = {
      valid: false,
      issues: [{ keyword: 'parse', instancePath: '', message: error instanceof Error ? error.message : String(error) }],
      policyIssues: [],
    };
    status = 'failed';
  }

  const auditRecord: AgentAuditRecord = {
    schema_version: '1.0',
    run_id: runId,
    agent_id: agentId,
    task_type: options.taskType ?? 'validate-result',
    symbol: options.symbol ?? parsed?.symbol ?? null,
    started_at: started,
    completed_at: (options.now?.() ?? new Date()).toISOString(),
    status: parsed ? statusAfterValidation(parsed, validation) : 'failed',
    input_artifacts: (options.inputArtifacts ?? []).filter((item) => !ABSOLUTE_PATH_PATTERN.test(item)).slice(0, 100),
    validation,
    failure_class: validation.valid ? null : validation.issues.length ? 'schema_or_parse_error' : 'policy_violation',
  };

  let auditPath: string | null = null;
  try {
    auditPath = await writeAgentAuditRecord(auditRecord, options);
  } catch (error) {
    // Validation is useful even when the local audit sink is unavailable.
    auditPath = null;
  }
  return { result: parsed, validation, auditPath };
}
