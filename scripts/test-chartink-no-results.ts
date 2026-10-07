import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/adapters/chartink.ts", import.meta.url), "utf8");
const checks = {
  noResultsState: source.includes("noResults = Boolean(scanState.noResults)"),
  csvSkipped: source.includes("method: 'skipped-no-results'"),
  copySkipped: source.includes("if (!rows.length && !noResults)"),
  noGapForNoResults: source.includes("!result.noResults && !result.normalized.length"),
  resultStatus: source.includes("result.noResults ? 'no_results'"),
  moveOnMessage: source.includes("Run Scan completed with no visible results; moving to next strategy"),
};
console.log(JSON.stringify({ ok: Object.values(checks).every(Boolean), checks }, null, 2));
if (!Object.values(checks).every(Boolean)) process.exit(1);
