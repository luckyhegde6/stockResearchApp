export interface ScreenshotOutcome {
  fileName: string;
  tabName?: string;
  rowIndex?: number;
  status: 'embedded_in_sheet' | 'failed' | 'skipped';
  reason?: string;
}

export interface ScreenshotAcceptanceReport {
  ok: boolean;
  expected: number;
  embedded: number;
  failed: number;
  skipped: number;
  errors: string[];
  outcomes: ScreenshotOutcome[];
}

/**
 * Validates receiver-reported insert outcomes for an explicit acceptance run.
 * This proves the receiver reported successful insertImage calls; it does not
 * prove that a human can see the image in the workbook UI.
 */
export function assessScreenshotEmbedding(payload: unknown, expectedFileNames: string[]): ScreenshotAcceptanceReport {
  const errors: string[] = [];
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const rawOutcomes = Array.isArray(root.screenshotResults) ? root.screenshotResults : [];
  if (!Array.isArray(root.screenshotResults)) {
    errors.push('Receiver response is missing screenshotResults; per-image outcomes cannot be verified.');
  }

  const outcomes: ScreenshotOutcome[] = rawOutcomes
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      fileName: String(item.fileName ?? ''),
      tabName: typeof item.tabName === 'string' ? item.tabName : undefined,
      rowIndex: Number.isInteger(Number(item.rowIndex)) ? Number(item.rowIndex) : undefined,
      status: item.status === 'embedded_in_sheet' ? 'embedded_in_sheet'
        : item.status === 'skipped' ? 'skipped' : 'failed',
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    }));

  const normalize = (name: string) => name.trim().toLowerCase();
  const expected = expectedFileNames.map(name => name.trim()).filter(Boolean);
  if (expected.length === 0) errors.push('No eligible screenshots were sent; screenshot acceptance requires at least one image.');
  if (expected.length !== expectedFileNames.length) errors.push('One or more expected screenshot filenames are empty.');
  if (new Set(expected.map(normalize)).size !== expected.length) errors.push('Expected screenshot filenames contain duplicates.');

  const actualCounts = new Map<string, number>();
  for (const outcome of outcomes) {
    const key = normalize(outcome.fileName);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
    if (!outcome.fileName) errors.push('Receiver returned an outcome without a filename.');
    if (outcome.status === 'embedded_in_sheet') {
      if (!outcome.tabName) errors.push(`Embedded screenshot ${outcome.fileName || '(unknown)'} has no target tab name.`);
      if (!Number.isInteger(outcome.rowIndex) || (outcome.rowIndex ?? 0) < 2) {
        errors.push(`Embedded screenshot ${outcome.fileName || '(unknown)'} has an invalid row index.`);
      }
    } else {
      errors.push(`Screenshot ${outcome.fileName || '(unknown)'} was ${outcome.status}${outcome.reason ? `: ${outcome.reason}` : ' without a reason'}.`);
    }
  }

  for (const name of expected) {
    const count = actualCounts.get(normalize(name)) ?? 0;
    if (count === 0) errors.push(`Receiver returned no outcome for expected screenshot ${name}.`);
    if (count > 1) errors.push(`Receiver returned multiple outcomes for expected screenshot ${name}.`);
  }
  for (const outcome of outcomes) {
    if (!expected.some(name => normalize(name) === normalize(outcome.fileName))) {
      errors.push(`Receiver returned an unexpected screenshot outcome: ${outcome.fileName || '(empty filename)'}.`);
    }
  }

  const embedded = outcomes.filter(item => item.status === 'embedded_in_sheet').length;
  const failed = outcomes.filter(item => item.status === 'failed').length;
  const skipped = outcomes.filter(item => item.status === 'skipped').length;
  const declaredEmbedded = Number(root.screenshotsEmbedded);
  const declaredFailed = Number(root.screenshotsFailed);
  const declaredSkipped = Number(root.screenshotsSkipped);
  if (!Number.isInteger(declaredEmbedded) || declaredEmbedded !== embedded) {
    errors.push(`Receiver aggregate embedded count (${String(root.screenshotsEmbedded)}) does not match per-image outcomes (${embedded}).`);
  }
  if (!Number.isInteger(declaredFailed) || declaredFailed !== failed) {
    errors.push(`Receiver aggregate failed count (${String(root.screenshotsFailed)}) does not match per-image outcomes (${failed}).`);
  }
  if (!Number.isInteger(declaredSkipped) || declaredSkipped !== skipped) {
    errors.push(`Receiver aggregate skipped count (${String(root.screenshotsSkipped)}) does not match per-image outcomes (${skipped}).`);
  }

  return { ok: errors.length === 0 && embedded === expected.length, expected: expected.length, embedded, failed, skipped, errors, outcomes };
}
