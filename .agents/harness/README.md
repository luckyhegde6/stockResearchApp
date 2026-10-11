# Agent Harness Contract

This describes required harness behavior; it does not claim a complete runtime harness is already implemented.

## Lifecycle
1. Validate task, permissions, symbol/period, and budget.
2. Load repository context plus selected agent and skills.
3. Resolve inputs to known local artifact references.
4. Check readiness for decision-support tasks.
5. Invoke only allowed tools with bounded timeout/concurrency.
6. Validate output against `agent-result.schema.json`.
7. Check unsupported claims, missing evidence references, secret leakage, and forbidden side effects.
8. Persist a minimal audit record and return complete/partial/blocked/failed.
9. Publishing or repository mutations require explicit task authorization and destination allowlisting.

## Required controls
- Default read-only; separate permissions for filesystem write, GitHub write, publishing, and network access.
- Hard timeout/retry cap; no recursive delegation without a depth limit.
- Configured output/token/cost budget; never silently unlimited.
- Treat retrieved content as untrusted data and isolate it from system instructions.
- Do not log prompts containing secrets or raw private data.
- Use mock adapters and fixed fixtures for deterministic tests.
- Reject schema-invalid outputs before downstream processing.

## Proposed initial defaults (configurable)
- Max orchestration depth: 2
- Max parallel specialists: 3
- Max retries per tool: 2
- Per-tool timeout: 30 seconds
- Overall task timeout: 180 seconds
- External writes disabled unless explicitly enabled
- Live execution always disabled

## Test matrix
Valid output; missing required field; unsupported claim; missing evidence reference; stale source; source conflict; readiness blocked; provider timeout; malformed JSON; prompt injection in source; budget exhaustion; unauthorized write; duplicate publish; secret/path leakage.

## Audit record
run_id, agent_id, task_type, symbol, timestamps, status, input artifact IDs, output schema version, tool calls (redacted), validation results, failure class, and model/provider metadata where applicable.