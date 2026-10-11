# Agent System

This folder defines an agent-neutral operating contract for StockResearchApp. It is policy and configuration documentation, not a claim that every listed agent is already wired into runtime orchestration.

## Start here
1. Read root `AGENTS.md`, `MEMORY.md`, `HANDOFF.md`, and `TODO.md`.
2. Read [system architecture](./SYSTEM.md) and [guardrails](./rules/GUARDRAILS.md).
3. Select the relevant role contract in [agents/](./agents/).
4. Load only the skills needed for the task from [skills/](./skills/).
5. Use the [harness contract](./harness/README.md) and validate outputs against schemas.
6. Record run metadata and evidence references. Never claim tests ran unless they did.

## Roles
- orchestrator: routes tasks, budgets work, and enforces stage boundaries.
- source-acquisition: plans/inspects source collection but does not fabricate evidence.
- evidence-auditor: checks provenance, freshness, conflicts, and completeness.
- financial-analyst: interprets canonical financial evidence and labels assumptions.
- technical-analyst: interprets deterministic indicators and OHLCV-derived facts.
- news-catalyst: summarizes sourced news/events with confirmed/unconfirmed status.
- valuation-scenarios: models explicit, editable scenarios from supported inputs.
- decision-reviewer: challenges the thesis and records what would change the conclusion.
- research-publisher: prepares a downstream export from validated artifacts.
- strategy-researcher: research-only strategies/backtests; no execution.
- software-engineer: repository changes, tests, and documentation under project rules.
- quality-reviewer: adversarial review of claims, schemas, tests, and guardrails.

## Operating model
The deterministic pipeline owns collection, calculations, reconciliation, and readiness. Agents consume its artifacts and may propose interpretation. They must not replace it. Read-only is the default; any publishing or repository mutation must be explicitly authorized for that task.

See [agent manifest](./manifest.json), [rules](./rules/), [skills](./skills/), and [harness](./harness/).
