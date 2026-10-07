import type { AdapterContext, SourceArtifact } from '../types/research.js';

/**
 * Clean and normalize raw string values.
 */
export function cleanText(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/\s+/g, ' ').trim();
}

/**
 * Safely parse numbers from strings with currency/comma formatting.
 */
export function parseFormattedNumber(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const str = cleanText(input).replace(/,/g, '');
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Standardized record function for recording data gaps.
 */
export function recordAdapterGap(ctx: AdapterContext, gapCode: string, description: string): void {
  const gapMessage = `[GAP:${gapCode}] ${description}`;
  if (!ctx.gaps) ctx.gaps = [];
  ctx.gaps.push(gapMessage);
}

/**
 * Standardized record function for recording adapter warnings.
 */
export function recordAdapterWarning(ctx: AdapterContext, sourceName: string, warningMessage: string): void {
  const formatted = `[${sourceName.toUpperCase()}_WARNING] ${warningMessage}`;
  if (!ctx.warnings) ctx.warnings = [];
  ctx.warnings.push(formatted);
}

/**
 * Generates a resilient Playwright runCode script string that grabs innerText safely.
 */
export function buildPlaywrightTextExtractor(selector: string = 'body'): string {
  return `
    async (page) => {
      try {
        const text = await page.locator('${selector}').innerText().catch(() => '');
        return JSON.stringify({ url: page.url(), title: await page.title(), text });
      } catch (err) {
        return JSON.stringify({ error: String(err) });
      }
    }
  `;
}

/**
 * Create a standard SourceArtifact helper.
 */
export function createArtifact(
  id: string,
  type: SourceArtifact['type'],
  provider: string,
  title: string,
  url: string,
  options?: Partial<SourceArtifact>
): SourceArtifact {
  return {
    id,
    type,
    provider,
    title,
    url,
    retrievedAt: new Date().toISOString(),
    status: 'ok',
    ...options,
  };
}
