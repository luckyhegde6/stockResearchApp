# Contributing

## Baseline

- Node.js 20+
- TypeScript + tsx
- Playwright Chromium for browser capture
- Python + MarkItDown for document ingestion

~~~bash
npm install
npx playwright install chromium
~~~

## Git workflow

Use a short-lived branch from main.

Preferred commit format:

~~~text
type(scope): summary
~~~

Examples: feat(tradingview): direct route capture; fix(readiness): advisory gap; docs(agent): refresh handoff; test(nse): symbol normalization.

Keep commits focused. Never commit generated research/output data or secrets.

## Before a PR

~~~bash
npm run version:check
npm run test:all
~~~

For provider changes, also run the relevant doctor/focused test.

## Review questions

- Is deterministic behavior preserved?
- Did a public/data/schema contract change?
- Are tests updated?
- Is documentation updated once at its canonical home?
- Are secrets and generated artifacts absent?
- Could a smaller change solve the problem?

## Documentation map

README.md — behavior
AGENTS.md — agent/dev rules
MEMORY.md — stable facts
HANDOFF.md — current state
TODO.md — backlog
DECISIONS.md — architecture decisions
docs/prd/ — product requirements
CHANGELOG.md — releases
