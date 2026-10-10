# PRD-003 — Agentic Context Layer

## Objective

Make the project easy for any capable coding/research agent to operate without binding the repository to one vendor.

## P0

- One canonical contract: AGENTS.md.
- Stable memory: MEMORY.md.
- Current state: HANDOFF.md.
- Backlog: TODO.md.
- Decisions: DECISIONS.md.
- Requirements: docs/prd/.
- Prefer compact normalized evidence packs over raw evidence.

## P1

- Machine-readable repository manifest.
- Read-only evidence inspection commands.
- Stable tool-shaped boundaries for research, readiness, and result inspection.
- Model-provider replacement without acquisition changes.

## P2

- Bounded agent loops for evidence-gap investigation.
- Optional external research tool adapters.

## Constraints

- No hidden mutable memory.
- No vendor-specific core contract.
- Agent/tool loops cannot bypass readiness.
- Agent/model output remains untrusted until validation.
