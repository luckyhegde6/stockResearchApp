export type SheetRow = Record<string, unknown>;

export interface ResearchSheetTab {
  tabName: string;
  dataset: string;
  rows: SheetRow[];
}

export interface ScreenshotUpload {
  tabName: string;
  rowIndex: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
}

export interface ScreenshotRowInput {
  fileName: string;
  /** Retained for compatibility with old fixtures; never published to Sheets. */
  relativePath: string;
  /** Compressed bytes sent to Apps Script, or source bytes if compression was skipped. */
  sizeBytes: number;
  originalSizeBytes?: number;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  optimizationOccurred?: boolean;
  compressionQuality?: number;
  mimeType: string;
  status: string;
  rowIndex: number;
  base64?: string;
}

export function fitWithinPixelLimit(
  sourceWidth: number,
  sourceHeight: number,
  maxPixels = 900_000,
): { width: number; height: number } {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) ||
      sourceWidth < 1 || sourceHeight < 1 || !Number.isFinite(maxPixels) || maxPixels < 1) {
    throw new Error('Screenshot dimensions and pixel limit must be positive finite numbers.');
  }
  const scale = Math.min(1, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
  let width = Math.max(1, Math.floor(sourceWidth * scale));
  let height = Math.max(1, Math.floor(sourceHeight * scale));
  while (width * height > maxPixels) {
    if (width >= height) width -= 1;
    else height -= 1;
  }
  return { width, height };
}

function cell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => cell(item)).filter(x => x !== '').join('; ');
  return JSON.stringify(value);
}

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function tab(base: string, suffix: string): string {
  return `${base}-${suffix}`.slice(0, 90);
}

function asConfidence(value: any): unknown {
  return value === null || value === undefined || value === '' ? '' : value;
}


function isLocalPathField(key: string): boolean {
  return /^(?:path|localPath|relativePath|artifactPath|screenshotPath|evidencePath|reportPath|filePath|sourcePath|local_path|relative_path|artifact_path|screenshot_path|evidence_path|report_path|file_path|source_path)$/i.test(key) || /(?:local|relative|artifact|screenshot|evidence|report|file|source)[_-]?path/i.test(key);
}

function isLikelyLocalPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  const drivePath = /^[A-Za-z]:/.test(text) && (text.charAt(2) === '\\' || text.charAt(2) === '/');
  const uncPath = text.charAt(0) === '\\' && text.charAt(1) === '\\';
  return drivePath || uncPath ||
    text.startsWith('/Users/') || text.startsWith('/home/') || text.startsWith('/mnt/') ||
    text.startsWith('research/') || text.startsWith('research\\') ||
    text.startsWith('outputs/') || text.startsWith('outputs\\');
}

function redactEmbeddedLocalPaths(text: string): string {
  return text
    .replace(/(?:[A-Za-z]:[\\/])(?:[^\\/\s"'<>|,;)}\]]+[\\/])*[^\\/\s"'<>|,;)}\]]*/g, '[local path redacted]')
    .replace(/\\\\[^\\/\s"'<>|]+\\[^\\/\s"'<>|]+(?:\\[^\s"'<>|,;)}\]]*)?/g, '[local path redacted]')
    .replace(/(^|[\s=:([{])(?:research|outputs)[\\/][^\s"'<>|,;)}\]]+/g, '$1[local path redacted]')
    .replace(/(^|[\s=:([{])\/(?:Users|home|mnt|tmp)\/[^\s"'<>|,;)}\]]+/g, '$1[local path redacted]');
}


function sanitizePathValues(value: unknown, key = ''): unknown {
  if (isLocalPathField(key) || isLikelyLocalPath(value)) return undefined;
  if (typeof value === 'string') return redactEmbeddedLocalPaths(value);
  if (Array.isArray(value)) {
    return value.map(item => sanitizePathValues(item)).filter(item => item !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([childKey, child]) => [childKey, sanitizePathValues(child, childKey)])
      .filter(([, child]) => child !== undefined));
  }
  return value;
}

function exportedValue(value: unknown): string | number | boolean {
  const clean = sanitizePathValues(value);
  if (clean === null || clean === undefined) return '';
  if (typeof clean === 'string' || typeof clean === 'number' || typeof clean === 'boolean') return clean;
  return JSON.stringify(clean) ?? '';
}

function oneRow(section: string, row: SheetRow, symbol: string): SheetRow {
  const sourceUrl = row.source_url ?? row.url;
  const field = row.field ?? row.item ?? row.metric ?? row.artifact_id ?? row.file_name ?? row.scenario ?? row.title ?? row.check_type ?? row.risk ?? row.catalyst ?? row.name ?? '';
  const value = row.value ?? row.status ?? row.details ?? row.assessment ?? row.thesis ?? row.notes ?? row.risk ?? row.catalyst ?? row.recommendation ?? row.label ?? row.title ?? '';
  const mapped = new Set([
    'section','record_type','symbol','domain','category','field','item','metric','artifact_id','file_name',
    'scenario','title','check_type','value','status','details','assessment','thesis','notes','unit','source',
    'source_url','url','period','reporting_period','as_of','confidence','provider','artifact_type','retrieved_at',
    'method','size_bytes','sizeBytes','original_size_bytes','originalSizeBytes','image_width','image_height','width','height','mimeType','mime_type','embedding_status','preview','source_id','source_artifact',
    'evidence_type','finding_type','scale','severity','row','symbol',
  ]);
  const details: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(row)) {
    if (mapped.has(key) || isLocalPathField(key) || isLikelyLocalPath(item)) continue;
    details[key] = sanitizePathValues(item);
  }
  return {
    section,
    record_type: 'data',
    symbol,
    domain: exportedValue(row.domain ?? row.category ?? row.scenario ?? row.check_type ?? row.artifact_type ?? ''),
    field: exportedValue(field),
    value: exportedValue(value),
    unit: exportedValue(row.unit ?? ''),
    source: exportedValue(row.source ?? row.provider ?? row.source_id ?? row.source_artifact ?? ''),
    source_url: exportedValue(sourceUrl ?? ''),
    period: exportedValue(row.period ?? row.reporting_period ?? row.as_of ?? ''),
    status: exportedValue(row.status ?? ''),
    confidence: exportedValue(row.confidence ?? ''),
    notes: exportedValue(row.notes ?? row.details ?? ''),
    artifact_id: exportedValue(row.artifact_id ?? row.source_artifact ?? ''),
    provider: exportedValue(row.provider ?? ''),
    title: exportedValue(row.title ?? ''),
    file_name: exportedValue(row.file_name ?? ''),
    size_bytes: exportedValue(row.size_bytes ?? row.sizeBytes ?? ''),
    original_size_bytes: exportedValue(row.original_size_bytes ?? row.originalSizeBytes ?? ''),
    image_width: exportedValue(row.image_width ?? row.width ?? ''),
    image_height: exportedValue(row.image_height ?? row.height ?? ''),
    original_image_width: exportedValue(row.original_image_width ?? row.originalWidth ?? ''),
    original_image_height: exportedValue(row.original_image_height ?? row.originalHeight ?? ''),
    optimization_occurred: exportedValue(row.optimization_occurred ?? row.optimizationOccurred ?? ''),
    compression_quality: exportedValue(row.compression_quality ?? row.compressionQuality ?? ''),
    embedding_status: exportedValue(row.embedding_status ?? ''),
    preview: '',
    details: exportedValue(details),
  };
}

function consolidateRunTabs(
  symbol: string,
  baseTab: string,
  tabs: ResearchSheetTab[],
  dataset: 'research-run' | 'analysis-run',
): ResearchSheetTab[] {
  const rows: SheetRow[] = [];
  for (const tab of tabs) {
    const section = tab.dataset.replace(/^research-/, '').replace(/^analysis-/, '').replace(/-/g, ' ').toUpperCase();
    rows.push({
      section,
      record_type: 'section_header',
      symbol: symbol.toUpperCase(),
      domain: '',
      field: section,
      value: '',
    });
    if (tab.rows.length === 0) {
      rows.push({
        section,
        record_type: 'notice',
        symbol: symbol.toUpperCase(),
        domain: '',
        field: 'No data available',
        value: `No ${section.toLowerCase()} rows were present in the local artifact package for this run.`,
        notes: 'Check the corresponding normalized research/analysis artifact if this section is expected to contain records.',
      });
      continue;
    }
    for (const row of tab.rows) {
      if (section === 'SUMMARY') {
        for (const [key, value] of Object.entries(row)) {
          if (isLocalPathField(key) || isLikelyLocalPath(value)) continue;
          rows.push({
            section,
            record_type: 'summary',
            symbol: symbol.toUpperCase(),
            field: key,
            value: exportedValue(value),
            notes: '',
          });
        }
      } else {
        rows.push(oneRow(section, row, symbol.toUpperCase()));
      }
    }
  }
  return [{
    tabName: baseTab.slice(0, 90),
    dataset,
    rows,
  }];
}

function flattenFindings(domain: string, value: any, rows: SheetRow[], prefix = '', inheritedConfidence?: unknown, inheritedSource?: unknown): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    if (!value.length) return;
    value.forEach((item, index) => {
      const field = prefix ? `${prefix}[${index + 1}]` : `item[${index + 1}]`;
      if (item && typeof item === 'object') {
        flattenFindings(domain, item, rows, field, inheritedConfidence, inheritedSource);
      } else {
        rows.push({
          domain,
          field,
          value: cell(item),
          confidence: asConfidence(inheritedConfidence),
          source_id: inheritedSource ?? '',
          finding_type: 'evidence',
        });
      }
    });
    return;
  }
  if (typeof value === 'object') {
    const confidence = (value as any).confidence ?? inheritedConfidence;
    const sourceId = (value as any).source_id ?? inheritedSource;
    const entries = Object.entries(value);
    for (const [key, child] of entries) {
      if (key === 'confidence' || key === 'source_id' || key === 'sourceId' || isLocalPathField(key)) continue;
      const field = prefix ? `${prefix}.${key}` : key;
      flattenFindings(domain, child, rows, field, confidence, sourceId);
    }
    return;
  }
  rows.push({
    domain,
    field: prefix,
    value: cell(value),
    confidence: asConfidence(inheritedConfidence),
    source_id: inheritedSource ?? '',
    finding_type: /verdict|assessment|thesis|warning|red_flag|risk/i.test(prefix) ? 'interpretation' : 'metric_or_fact',
  });
}

function analysisFindings(a: any): SheetRow[] {
  const rows: SheetRow[] = [];
  const sections: Array<[string, unknown]> = [
    ['Executive Summary', a.executive_summary],
    ['Fundamentals', a.fundamentals],
    ['Management', a.management],
    ['Valuation', a.valuation],
    ['Technical', a.technical],
    ['Shareholding', a.shareholding],
    ['News & Sentiment', a.news_sentiment],
    ['Contrarian Test', a.contrarian_test],
    ['Entry Zones', a.entry_zones],
    ['Portfolio Action', a.portfolio_action],
  ];
  for (const [domain, value] of sections) flattenFindings(domain, value, rows);

  list(a.recommendation?.top_three_reasons).forEach((reason, index) => rows.push({
    domain: 'Recommendation',
    field: `top_three_reasons[${index + 1}]`,
    value: cell(reason),
    finding_type: 'investment_thesis',
    confidence: a.recommendation?.confidence ?? '',
    source_id: '',
  }));
  list(a.what_would_change_my_mind).forEach((item, index) => rows.push({
    domain: 'Thesis Invalidation',
    field: `condition[${index + 1}]`,
    value: cell(item),
    finding_type: 'invalidation_condition',
    confidence: '',
    source_id: '',
  }));
  return rows;
}

function riskRows(a: any): SheetRow[] {
  return list(a.risks).map((risk, index) => ({
    rank: risk?.rank ?? index + 1,
    risk: cell(risk?.risk),
    category: cell(risk?.category),
    probability: cell(risk?.probability),
    impact: cell(risk?.impact),
    early_warning_indicator: cell(risk?.early_warning_indicator),
    priced_in: cell(risk?.priced_in),
    confidence: risk?.confidence ?? '',
    source_id: cell(risk?.source_id),
  }));
}

function catalystRows(a: any): SheetRow[] {
  return list(a.catalysts).map((catalyst, index) => ({
    rank: catalyst?.rank ?? index + 1,
    catalyst: cell(catalyst?.catalyst),
    timeframe: cell(catalyst?.timeframe),
    confirmation_condition: cell(catalyst?.confirmation_condition),
    potential_impact: cell(catalyst?.potential_impact),
    confidence: catalyst?.confidence ?? '',
    source_id: cell(catalyst?.source_id),
  }));
}

function sourceRows(a: any): SheetRow[] {
  return list(a.sources).map(source => ({
    source_id: cell(source?.source_id),
    source_name: cell(source?.source_name),
    source_type: cell(source?.source_type),
    url: cell(source?.url),
    retrieved_at: cell(source?.retrieved_at),
    published_at: cell(source?.published_at),
    reporting_period: cell(source?.reporting_period),
    artifact_path: cell(source?.artifact_path),
    notes: cell(source?.notes),
  }));
}

function auditRows(a: any): SheetRow[] {
  const rows: SheetRow[] = [];
  const audit = a.audit ?? {};
  list(audit.facts_without_primary_source).forEach((item, i) => rows.push({
    audit_type: 'fact_without_primary_source',
    item: cell(typeof item === 'object' ? item.field ?? item.fact ?? item : item),
    details: cell(item),
    source_refs: cell(item?.source_id ?? item?.source_ids),
    severity: 'review',
  }));
  list(audit.conflicts_detected).forEach((item, i) => rows.push({
    audit_type: 'source_conflict',
    item: cell(item?.field ?? item?.metric ?? `conflict_${i + 1}`),
    details: cell(item),
    source_refs: cell(item?.source_ids ?? item?.sources),
    severity: 'review',
  }));
  list(audit.calculations).forEach((item, i) => rows.push({
    audit_type: 'calculation',
    item: cell(item?.metric ?? `calculation_${i + 1}`),
    details: [item?.formula, item?.calculation_note].filter(Boolean).join(' — '),
    source_refs: cell(item?.inputs),
    severity: 'informational',
  }));
  return rows;
}

export function transformAnalysisToSheets(analysis: any, symbol: string, baseTab: string): ResearchSheetTab[] {
  const ticker = String(analysis?.company?.ticker ?? symbol).toUpperCase();
  const c = analysis?.company ?? {};
  const meta = analysis?.analysis_meta ?? {};
  const market = analysis?.market_snapshot ?? {};
  const rec = analysis?.recommendation ?? {};
  const scores = analysis?.scores ?? {};
  const summary: SheetRow = {
    symbol: ticker,
    company: cell(c.name),
    exchange: cell(c.exchange),
    isin: cell(c.isin),
    sector: cell(c.sector),
    industry: cell(c.industry),
    analysis_timestamp: cell(meta.analysis_timestamp),
    latest_reporting_period: cell(meta.latest_reporting_period),
    financial_basis: cell(meta.financial_basis),
    data_completeness: meta.data_completeness ?? '',
    evidence_confidence: meta.overall_confidence ?? rec.confidence ?? '',
    recommendation: cell(rec.action),
    conviction_0_to_10: rec.conviction ?? '',
    recommendation_confidence: rec.confidence ?? '',
    one_line_thesis: cell(rec.one_line_thesis),
    top_reasons: list(rec.top_three_reasons).map((x, i) => `${i + 1}. ${cell(x)}`).join(' | '),
    current_price_inr: market.current_price ?? '',
    price_timestamp: cell(market.price_timestamp),
    market_cap: market.market_cap ?? '',
    pe: market.pe ?? '',
    pb: market.pb ?? '',
    ev_ebitda: market.ev_ebitda ?? '',
    week_52_high: market['52_week_high'] ?? '',
    week_52_low: market['52_week_low'] ?? '',
    valuation_classification: cell(analysis?.valuation?.classification),
    technical_market_phase: cell(analysis?.technical?.market_phase),
    news_sentiment: cell(analysis?.news_sentiment?.label),
    overall_score_0_to_10: scores.overall ?? '',
    fundamentals_score_0_to_10: scores.fundamentals ?? '',
    management_score_0_to_10: scores.management ?? '',
    valuation_score_0_to_10: scores.valuation ?? '',
    technical_score_0_to_10: scores.technical ?? '',
    risk_reward_score_0_to_10: scores.risk_reward ?? '',
    key_business_quality: cell(analysis?.executive_summary?.business_quality),
    key_earnings_quality: cell(analysis?.executive_summary?.earnings_quality),
    key_risk: cell(analysis?.executive_summary?.key_risk),
    key_catalyst: cell(analysis?.executive_summary?.key_catalyst),
    existing_shareholder_action: cell(analysis?.portfolio_action?.existing_shareholder),
    new_investor_action: cell(analysis?.portfolio_action?.new_investor),
    investment_horizon: cell(analysis?.portfolio_action?.investment_horizon),
    data_gaps: cell(meta.data_gaps),
    schema_version: cell(analysis?.schema_version),
    report_type: 'LLM investment analysis; validate evidence and assumptions before acting',
  };

  const scoreRows = Object.entries(scores).map(([category, score]) => ({
    category,
    score_0_to_10: typeof score === 'number' ? score : '',
    scale: '0–10',
  }));

  const scenarios = ['bull', 'base', 'bear'].map(name => {
    const scenario = analysis?.scenarios?.[name] ?? {};
    return {
      scenario: name.toUpperCase(),
      thesis: cell(scenario.thesis),
      assumptions: cell(scenario.assumptions),
      confidence_0_to_1: scenario.confidence ?? '',
    };
  });

  return consolidateRunTabs(ticker, baseTab, [
    { tabName: tab(baseTab, 'summary'), dataset: 'analysis-summary', rows: [summary] },
    { tabName: tab(baseTab, 'findings'), dataset: 'analysis-findings', rows: analysisFindings(analysis) },
    { tabName: tab(baseTab, 'scores'), dataset: 'analysis-scores', rows: scoreRows },
    { tabName: tab(baseTab, 'risks'), dataset: 'analysis-risks', rows: riskRows(analysis) },
    { tabName: tab(baseTab, 'catalysts'), dataset: 'analysis-catalysts', rows: catalystRows(analysis) },
    { tabName: tab(baseTab, 'scenarios'), dataset: 'analysis-scenarios', rows: scenarios },
    { tabName: tab(baseTab, 'sources'), dataset: 'analysis-sources', rows: sourceRows(analysis) },
    { tabName: tab(baseTab, 'audit'), dataset: 'analysis-audit', rows: auditRows(analysis) },
  ], 'analysis-run');
}

function sourceArtifactRows(manifest: any): SheetRow[] {
  const artifacts = [...list(manifest?.sourceArtifacts), ...list(manifest?.derivedArtifacts)];
  return artifacts.map((item: any) => ({
    artifact_id: cell(item.id),
    artifact_type: cell(item.type),
    provider: cell(item.provider),
    title: cell(item.title),
    status: cell(item.status),
    url: cell(item.url),
    reporting_period: cell(item.period),
    retrieved_at: cell(item.retrievedAt),
    method: cell(item.method),
    notes: cell(item.notes),
  }));
}

function researchEvidenceRows(pack: any, individualEvidence: any): SheetRow[] {
  const rows: SheetRow[] = [];
  const pushItems = (kind: string, items: any[]) => items.forEach(item => rows.push({
    evidence_type: kind,
    field: cell(item?.field),
    value: cell(item?.value),
    unit: cell(item?.unit),
    source: cell(item?.source),
    source_artifact: cell(item?.sourceArtifact ?? item?.source_artifact),
    as_of: cell(item?.asOf ?? item?.as_of),
    reporting_period: cell(item?.period ?? item?.reportingPeriod ?? item?.reporting_period),
    notes: cell(item?.notes ?? item?.note),
    confidence: cell(item?.confidence),
    verified: item?.verified ?? '',
  }));

  const canonicalFacts = list(pack?.canonicalFacts);
  const calculatedMetrics = list(pack?.calculatedMetrics);
  if (canonicalFacts.length || calculatedMetrics.length) {
    pushItems('canonical_fact', canonicalFacts);
    pushItems('calculated_metric', calculatedMetrics);
  } else {
    // Research-only exports still have deterministic facts even if the optional analysis handoff
    // pack was not generated yet. Use the canonical-values fallback; never synthesize values.
    pushItems('canonical_fact', list(individualEvidence?.canonicalValues?.facts));
    pushItems('calculated_metric', list(individualEvidence?.canonicalValues?.calculatedMetrics));
    if (!list(individualEvidence?.canonicalValues?.facts).length &&
        !list(individualEvidence?.canonicalValues?.calculatedMetrics).length) {
      pushItems('canonical_fact', list(individualEvidence?.facts));
      pushItems('calculated_metric', list(individualEvidence?.calculatedMetrics ?? individualEvidence?.metrics));
    }
  }
  return rows;
}

export function transformResearchToSheets(artifacts: Record<string, any>, symbol: string, baseTab: string): ResearchSheetTab[] {
  const manifest = artifacts.manifest ?? {};
  const readiness = artifacts.readiness ?? {};
  const quality = artifacts.evidenceQuality ?? {};
  const health = artifacts.sourceHealth ?? {};
  const pack = artifacts.evidencePack ?? {};
  const reconciliation = artifacts.reconciliation ?? {};
  const individualEvidence = artifacts.individualEvidence ?? {};
  const canonicalValues = artifacts.canonicalValues ?? {};
  const summary: SheetRow = {
    symbol: String(manifest.ticker ?? symbol).toUpperCase(),
    company: cell(manifest.companyName),
    research_generated_at: cell(manifest.generatedAt),
    acquisition_only: manifest.acquisitionOnly ?? true,
    readiness: readiness.ready === true ? 'READY' : 'NOT_READY',
    blocking_reasons: cell(readiness.blockingReasons),
    advisory_reasons: cell(readiness.advisoryReasons),
    quality_status: cell(quality?.report?.status ?? quality?.status),
    quality_missing_count: quality?.report?.summary?.missing ?? quality?.summary?.missing ?? '',
    overall_source_health: cell(health?.overall?.status ?? health?.overallStatus ?? health?.status),
    source_artifacts: list(manifest.sourceArtifacts).length,
    data_gaps: cell(manifest.dataGaps),
    warnings: cell(manifest.warnings),
    evidence_facts: list(pack.canonicalFacts).length || list(canonicalValues.facts).length || list(individualEvidence?.canonicalValues?.facts).length || list(individualEvidence?.facts).length,
    calculated_metrics: list(pack.calculatedMetrics).length || list(canonicalValues.calculatedMetrics).length || list(individualEvidence?.canonicalValues?.calculatedMetrics).length || list(individualEvidence?.calculatedMetrics ?? individualEvidence?.metrics).length,
    source_conflicts: reconciliation?.conflictCount ?? list(reconciliation?.conflicts).length,
    report_type: 'Deterministic research evidence; not an LLM recommendation',
  };

  const findings: SheetRow[] = [];
  for (const [domain, value] of [
    ['Fundamentals', pack.fundamentals],
    ['Valuation', pack.valuation],
    ['Technical', pack.technicals],
    ['Ownership', pack.ownership],
    ['Catalysts', pack.catalysts],
    ['News & Sentiment', pack.newsSentiment],
    ['Reconciliation', reconciliation],
  ] as Array<[string, any]>) {
    flattenFindings(domain, value, findings);
  }
  const qualityRows: SheetRow[] = [];
  list(readiness.requiredFiles).forEach((item: any) => qualityRows.push({
    check_type: 'required_file',
    item: cell(item.file),
    status: item.ok ? 'present' : 'missing',
    details: item.ok ? 'Required artifact exists' : 'Required artifact missing',
  }));
  list(readiness.missingFiles).forEach(item => qualityRows.push({
    check_type: 'blocking_gap',
    item: cell(item),
    status: 'missing',
    details: 'Blocks high-confidence analysis readiness',
  }));
  list(readiness.actionableWarnings).forEach(item => qualityRows.push({
    check_type: 'source_warning',
    item: cell(item),
    status: 'warning',
    details: 'Review source-health diagnostics',
  }));
  const sourceHealthMap = health?.sources && typeof health.sources === 'object' ? health.sources : {};
  for (const [source, details] of Object.entries(sourceHealthMap)) qualityRows.push({
    check_type: 'source_health',
    item: source,
    status: cell((details as any)?.status ?? (details as any)?.overallStatus),
    details: cell((details as any)?.warningDetails ?? (details as any)?.warnings),
  });
  list(reconciliation?.conflicts ?? reconciliation?.items?.filter?.((item: any) => item?.conflict)).forEach((item: any, index) => qualityRows.push({
    check_type: 'source_conflict',
    item: cell(item?.field ?? item?.metric ?? `conflict_${index + 1}`),
    status: 'review',
    details: cell(item),
  }));
  return consolidateRunTabs(symbol, baseTab, [
    { tabName: tab(baseTab, 'summary'), dataset: 'research-summary', rows: [summary] },
    { tabName: tab(baseTab, 'evidence'), dataset: 'research-evidence', rows: researchEvidenceRows(pack, { canonicalValues, ...individualEvidence }) },
    { tabName: tab(baseTab, 'sources'), dataset: 'research-sources', rows: sourceArtifactRows(manifest) },
    { tabName: tab(baseTab, 'findings'), dataset: 'research-findings', rows: findings },
    { tabName: tab(baseTab, 'quality'), dataset: 'research-quality', rows: qualityRows },
  ], 'research-run');
}

export function buildVisualEvidenceRows(symbol: string, screenshots: ScreenshotRowInput[]): SheetRow[] {
  if (!screenshots.length) return [{
    category: 'Visual Evidence',
    symbol,
    status: 'no_screenshots_found',
    note: 'Run deterministic research/TradingView capture first, then export again.',
    file_name: '',
    chart_period: '',
    size_bytes: '',
    embedding_status: 'not_available',
  }];
  return screenshots.map(item => ({
    category: /^screener/i.test(item.fileName) ? 'Screener.in' : /^tijori/i.test(item.fileName) ? 'Tijori Finance' : 'TradingView',
    symbol,
    file_name: item.fileName,
    chart_period: item.fileName.replace(/^(?:tradingview|screener|tijori)[-_]?/i, '').replace(/\.(png|jpe?g|webp)$/i, ''),
    size_bytes: item.sizeBytes,
    original_size_bytes: item.originalSizeBytes ?? item.sizeBytes,
    image_width: item.width ?? '',
    image_height: item.height ?? '',
    original_image_width: item.originalWidth ?? '',
    original_image_height: item.originalHeight ?? '',
    optimization_occurred: item.optimizationOccurred ?? '',
    compression_quality: item.compressionQuality ?? '',
    status: item.status,
    embedding_status: item.status,
    preview: '',
  }));
}
