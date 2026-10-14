# Developer Setup and Contribution

## Requirements

- Node.js 20 or newer (see repo `package.json` and CI).
- Git.
- Playwright Chromium for public-page/screenshot capture.
- Python/MarkItDown dependencies required by the ingestion path where document conversion is used.
- Optional model credentials only for final analysis.
- Optional Apps Script webhook credentials only for Google Sheets publishing.

## Bootstrap

```powershell
git clone https://github.com/luckyhegde6/stockResearchApp.git
cd stockResearchApp
npm ci
npx playwright install chromium
Copy-Item .env.example .env
npm run version:check
npm run typecheck
npm run test:all
```

Edit local `.env` only; never commit it.

## Development sequence

1. Read [AGENTS.md](https://github.com/luckyhegde6/stockResearchApp/blob/main/AGENTS.md), [MEMORY.md](https://github.com/luckyhegde6/stockResearchApp/blob/main/MEMORY.md), [HANDOFF.md](https://github.com/luckyhegde6/stockResearchApp/blob/main/HANDOFF.md) and [TODO.md](https://github.com/luckyhegde6/stockResearchApp/blob/main/TODO.md).
2. Read the relevant adapter/lib and tests before altering contracts.
3. Prefer additions to existing interfaces over parallel frameworks.
4. Add fixtures for success, missing/malformed/stale data and provider outage.
5. Run targeted tests, then the unified suite.
6. Update PRD/TODO/changelog/handoff if scope or status changes.
7. Open a focused PR; preserve deterministic readiness and source precedence.

## Pull request checklist

- [ ] Typecheck and tests pass in CI.
- [ ] Data facts retain provenance and retrieval/as-of time.
- [ ] Missing values remain missing; no silent imputation.
- [ ] Raw evidence remains unchanged.
- [ ] Readiness is not weakened to hide missing evidence.
- [ ] Secrets/private data/local paths are absent from logs and artifacts.
- [ ] Docs describe whether behavior is implemented, planned or operationally unverified.
- [ ] Any new source has terms/allowed-use and rate-limit policy.
- [ ] No order execution was introduced.

## Branch naming

Use focused prefixes such as `feat/`, `fix/`, `docs/`, or `test/`. Start from current `main` and avoid bundling unrelated work unless it's a deliberately scoped documentation release.
