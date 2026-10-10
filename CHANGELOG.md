# Changelog

Canonical release history for repository behavior. Older detail remains in docs/RELEASES_AND_CHANGELOG.md.

## [Unreleased]

### Google Sheets publishing
- Linked the StockResearch workbook from the README and integration guide.
- Added classified research and analysis transformer methods with dedicated summary, evidence/findings, scores, risks, catalysts, scenarios, sources, quality, audit, and visual-evidence tabs.
- Added a clickable StockResearch workbook index and one consolidated data tab per research/analysis run; command lifecycle records stay local and no `_EXPORT_LOG` or `command-runs-*` tabs are created.
- Added best-effort automatic publication after successful `research`/`analyze` runs when webhook credentials are configured; Sheet failures do not invalidate local output.
- Added a universal process lifecycle: all `src/index.ts` CLI commands, all npm scripts, and dashboard-launched research/batch/analysis/scan jobs create a start/final Sheets status record.
- Kept process lifecycle state and execution reports local while publishing supported research/analysis/scan datasets through the consolidated Sheets exporter.
- Added an explicit running state and CI contract checks ensuring no npm script bypasses the shared Sheets lifecycle.
- Added screenshot optimization (JPEG re-encoding, below 900,000 pixels and byte threshold), original/optimized image metadata, receiver-side size/pixel checks, consistent embedding statuses, and recursive local-path redaction.\n- Added deterministic evidence fallback from `normalized/canonical-values.json` when the optional analysis evidence pack is missing, plus regression tests and versioned Apps Script health checks.\n- Documented local deployment/configuration requirements and the need to redeploy Apps Script separately.

### Research roadmap
- Added a roadmap for Kronos forecasting/backtesting, Pine Script strategy research, Lightweight Charts visualization, and future OpenAlgo integration.

### Developer experience
- Added an agent-neutral repository operating contract.
- Added stable memory, current handoff, prioritized TODOs, architecture decisions, contributing guidance, product requirements, and GitHub templates.
- Added machine-readable agent-manifest.json.
- Added lightweight GitHub CI for version:check and test:all.
- Corrected documentation drift around deterministic research and research:full.

## [1.50.0] - 2026-10-08

### TradingView
- Switched public UI-surface capture to canonical direct symbol-page routes.
- Removed legacy Metrics/More launcher automation.
- Centralized TradingView surface URL generation.
- Hardened exact route/content confirmation.
- Preserved the existing tradingViewUiSurfaces evidence contract.

### Documentation
- Rebuilt README as the primary operating guide.
- Updated architecture, onboarding, testing, CLI, and TradingView documentation.

## Historical milestones

- 1.49.x — public TradingView chart/symbol-page capture and schema/readiness hardening.
- 1.48 — news sentiment research module.
- 1.47 — investment reasoning contract.
- 1.46 — NSE security-master normalization.
- 1.43–1.44 — NSE NextAPI transition and historical chunking.
- 1.38 — canonical evidence reconciliation.
- 1.35–1.37 — market scans and quality scoring.
- 1.10–1.16 — evidence contract and MarkItDown foundation.
- 1.0 — deterministic acquisition separated from AI reasoning.
