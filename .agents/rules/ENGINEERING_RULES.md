# Engineering Rules

- Canonical source files, schemas, CLI contracts, and tests outrank agent-generated docs.
- Extend existing abstractions before adding parallel implementations.
- Keep provider acquisition separate from model-provider logic.
- Keep generated runtime data, screenshots, browser state, .env, and credentials out of Git.
- Changes to versioned behavior require the relevant version check.
- Add fixture-backed tests for adapter changes and contract tests for API/output changes.
- Do not update HANDOFF.md for cosmetic changes; do update it when blockers, state, or next actions materially change.
- Update CHANGELOG.md for user-visible behavior and TODO.md for new/deferred work.
- Document a failed or unavailable check honestly.
