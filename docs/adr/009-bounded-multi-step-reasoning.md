# ADR-009 — Bounded multi-step reasoning

- Status: accepted
- Date: 2026-10-15

## Context

The model-provider boundary permits deterministic transport tests, while the agent harness validates structured results and writes audit records. A provider abstraction alone does not make an agent loop safe: a model must not be allowed to create its own tools, expand its plan, or retry indefinitely.

## Decision

Add `runBoundedReasoning` as a caller-planned, read-only runner. The caller supplies a finite sequence of steps and each step's allowed agent ID. The runner enforces a hard maximum of four steps, an overall timeout, a per-result byte limit, per-step schema/policy validation, and audit records through the existing harness.

A failed, invalid, blocked, or partial step stops the sequence. The model cannot add steps, invoke tools, publish, mutate the repository, or execute trades. This module is an opt-in building block; it is not automatically wired into the stock-analysis CLI or allowed to bypass readiness.

## Consequences

- Bounded orchestration can be tested with deterministic fixture providers.
- Every accepted step must satisfy the existing agent-result contract and the step's agent allowlist.
- Timeouts, provider failures, and oversized outputs fail closed.
- A future CLI integration must call the existing readiness gate first and have its own explicit acceptance tests.
