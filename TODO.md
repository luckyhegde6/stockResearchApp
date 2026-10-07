# TODO

Prioritized backlog. Items are not claims of existing functionality.

## P0 — correctness

- [x] Add CI for version:check and test:all.
- [ ] Keep CLI/operating docs synchronized with package.json.
- [ ] Expand regression coverage for readiness edge cases.
- [ ] Keep TradingView route tests synchronized with configured surfaces.

## P1 — developer experience

- [x] Add a machine-readable repository manifest for agents.
- [ ] Add a lightweight local health command for runtime, Playwright, MarkItDown, config, and test readiness.
- [ ] Move superseded historical root docs into docs/archive/ where safe.
- [ ] Add dashboard API contract tests.

## P1 — agentic layer

- [ ] Add read-only evidence inspection commands.
- [ ] Add a machine-readable readiness/source-health summary for agents.
- [ ] Add an explicit model-provider boundary.
- [ ] Add bounded multi-step reasoning only after the deterministic handoff contract is stable.

## P2 — research depth

- [ ] Expand point-in-time/datewise research coverage.
- [ ] Improve market-scan quality/history tests.
- [ ] Add more fixture-backed adapter tests for provider outages.
- [ ] Add configurable evidence freshness policies.

## P2 — dashboard

- [ ] Add a compact "why not ready?" view.
- [ ] Add provenance drill-down from results to source paths.
- [ ] Add a read-only symbol comparison view.
