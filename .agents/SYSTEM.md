# Agent System Architecture

## Stage boundaries
1. **Acquire**: existing adapters collect source artifacts.
2. **Normalize**: deterministic code normalizes supported evidence.
3. **Reconcile**: canonical evidence preserves cross-source conflicts.
4. **Quality/readiness**: deterministic gates report gaps and decide whether analysis may proceed.
5. **Interpret**: optional agents/LLM interpret only validated handoff artifacts.
6. **Validate**: schema, provenance, consistency, policy, and budget checks.
7. **Publish**: explicit downstream export; local research remains canonical.

Agents are roles over existing contracts, not separate sources of truth. Never let an agent call a provider and then directly promote an unverified answer into canonical evidence.

## Context loading order
Root AGENTS.md → MEMORY.md → HANDOFF.md → TODO.md → relevant source/tests → one focused design document → relevant role and skills.

Prefer compact artifacts in this order:
- research/<SYMBOL>/manifest.json
- research/<SYMBOL>/analysis-readiness.json
- research/<SYMBOL>/normalized/analysis-evidence-pack.json
- research/<SYMBOL>/normalized/analysis-inputs.json
- research/<SYMBOL>/normalized/reconciliation.json
- research/<SYMBOL>/source-health.json
- research/<SYMBOL>/evidence-quality.json

Read raw HTML/PDF/screenshots only to verify provenance or resolve a specific gap.

## Output envelope
All agent results should include:
- schema_version, agent_id, run_id, symbol (when applicable), generated_at
- status: complete | partial | blocked | failed
- claims[] with claim_type: sourced_fact | deterministic_calculation | interpretation | assumption
- evidence_refs[] pointing to artifact IDs/paths/URLs and as-of timestamps where known
- missing_data[], conflicts[], caveats[]
- next_actions[] and validation[]
- no unsupported value is silently replaced with a guess.

## Failure handling
Provider timeout or missing data → partial/blocked with explicit diagnostics. Invalid schema → reject output. Readiness failure → stop interpretation unless an explicitly approved non-decision-support diagnostic mode applies. Budget exhausted → stop and report partial status. Never retry indefinitely.
