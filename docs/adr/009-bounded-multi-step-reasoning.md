# ADR-009 — Bounded multi-step reasoning

- Status: accepted
- Date: 2026-10-15

## Context

The model-provider boundary permits deterministic transport tests, while the agent harness validates structured results and writes audit records. A provider abstraction alone does not make an agent loop safe: a model must not be allowed to create its own tools, expand its plan, or retry indefinitely.

## Decision

Add `runBoundedReasoning` as a caller-planned, read-only runner. The caller supplies a finite sequence of steps and each step's allowed agent ID. The runner safely loads caller-selected repository-relative text artifacts (including symlink containment checks), applies a 256 KiB default aggregate input budget and a 16-artifact cap, and passes artifact contents—not merely file names—to each step. It enforces a hard maximum of four steps, an overall timeout, a per-result byte limit, per-step schema/policy validation, and audit records through the existing harness.

A failed, invalid, blocked, or partial step stops the sequence. The model cannot add steps, invoke tools, publish, mutate the repository, or execute trades. The stock-analysis CLI exposes the runner only when `LLM_BOUNDED_REASONING=1` is explicitly set. The deterministic readiness gate runs first; any blocked, partial, invalid, failed, timed-out, or over-budget step stops the run before final investment analysis. The default single-call analysis path remains unchanged.

## Consequences

- Bounded orchestration can be tested with deterministic fixture providers.
- Every accepted step must satisfy the existing agent-result contract and the step's agent allowlist.
- Timeouts, provider failures, and oversized outputs fail closed.
- The opt-in CLI path reuses the configured model provider for two fixed roles (`evidence-auditor`, then `decision-reviewer`) and supplies their validated results as secondary review context to the final analysis call.
- The final investment analysis is not invoked unless both bounded steps are complete and valid.
- Fixture tests cover artifact contents, repository path containment, input budgets, step caps, validation stops, output budgets, and timeouts.
