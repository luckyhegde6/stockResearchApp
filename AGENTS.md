# Agent & Developer Guide

Canonical repository instructions for humans and coding agents. Provider-specific files must point here rather than duplicate rules.

## Read order

1. README.md — system overview.
2. MEMORY.md — stable architecture facts.
3. HANDOFF.md — current state and blockers.
4. TODO.md — prioritized backlog.
5. Relevant source/tests.
6. One focused document from docs/ when deeper detail is needed.

Source code is authoritative when docs disagree.

## Project contract

This is an NSE-first Indian-equity research system.

~~~text
symbol
  → NSE master resolution
  → source acquisition
  → raw evidence
  → normalization
  → canonical evidence
  → reconciliation
  → quality + readiness
  → optional AI analysis
  → schema validation
~~~

Acquisition and preparation are deterministic. The final analyze stage may call an LLM and must validate its output against src/schema.ts.

### Source policy

- Core: NSE, Screener, Tijori, TradingView.
- Supplementary: News.
- Optional: Chartink via RESEARCH_INCLUDE_CHARTINK.
- Excluded from production individual-stock analysis: BSE.
- TradingView public UI surfaces use canonical direct symbol-page routes from src/lib/tradingview-url.ts.

## Non-negotiable invariants

- Never let an LLM create or silently repair source facts.
- Preserve raw evidence and provenance.
- Preserve source conflicts.
- Calculate numeric technical indicators deterministically from structured data.
- Do not bypass the readiness gate.
- Keep acquisition/provider logic independent from model-provider logic.
- Never commit secrets, .env, research outputs, screenshots, browser state, or generated runtime data.

## Actual execution model

~~~bash
npm run research -- SYMBOL
~~~

Runs deterministic acquisition and preparation only.

~~~bash
npm run analyze -- SYMBOL
~~~

Runs a fresh deterministic acquisition, prepares the handoff, checks readiness, invokes the configured OpenAI-compatible endpoint, then validates the result with Ajv.

~~~bash
npm run research:full -- SYMBOL
~~~

Currently this is only an alias for research; it is not a combined research+analysis command.

## High-value entry points

- src/index.ts — orchestration.
- src/adapters/ — source acquisition.
- src/lib/research-config.ts — feature policy/version.
- src/lib/analysis-readiness.ts — final reasoning gate.
- src/lib/individual-stock-evidence.ts — canonical evidence/reconciliation.
- src/lib/analysis-evidence-pack.ts — compact reasoning handoff.
- src/lib/prompt.ts — prompt assembly.
- src/lib/llm.ts — model boundary.
- src/schema.ts — output contract.
- skills/stock-analysis/ — analysis rules/schema guidance.
- public/index.html + src/server.ts — local dashboard.

## Common commands

~~~bash
npm install
npx playwright install chromium
npm run version:check
npm run test:all

npm run research -- ITC
npm run analyze -- ITC
npm run validate -- ITC

npm run dashboard
npm run research:batch -- ITC HDFCBANK RELIANCE
npm run market:scans
~~~

## Change workflow

Before editing:

1. Read the relevant source plus MEMORY.md and HANDOFF.md.
2. Search callers/tests before changing a contract.
3. Extend an existing abstraction before adding a parallel one.
4. Keep the change focused.

After editing:

1. Run focused tests for the changed subsystem.
2. Run version:check when versioned behavior/docs changed.
3. Run test:all for cross-cutting/orchestration changes.
4. Confirm generated artifacts remain gitignored.
5. Update HANDOFF.md only when state, blockers, or next actions changed.
6. Update CHANGELOG.md for user-visible behavior.

## Agent-neutral policy

The repository contract is defined by files, CLI commands, schemas, and deterministic artifacts — not by Claude, Codex, Gemini, OpenAI, Anthropic, or any specific agent SDK.

Prefer compact evidence for context:

1. research/SYMBOL/manifest.json
2. research/SYMBOL/analysis-readiness.json
3. research/SYMBOL/normalized/analysis-evidence-pack.json
4. research/SYMBOL/normalized/analysis-inputs.json
5. reconciliation/source-health/evidence-quality artifacts

Read raw PDFs, HTML, and screenshots only when provenance or a missing detail requires them.

## Documentation policy

Canonical homes:

- Behavior: README.md
- Agent/dev rules: AGENTS.md
- Stable memory: MEMORY.md
- Current state: HANDOFF.md
- Backlog: TODO.md
- Decisions: DECISIONS.md
- Product requirements: docs/prd/
- Operating guide: docs/PIPELINE_OPERATING_GUIDE.md
- Command reference: docs/CLI_REFERENCE.md
- Releases: CHANGELOG.md

Do not create duplicate agent instructions, one-off version guides, or pasted logs.
