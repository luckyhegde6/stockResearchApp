
# StockResearchApp Documentation Home

The source-controlled documentation is authoritative. The GitHub Wiki is a separate Git repository and may be disabled or empty; use the links below even when `/wiki` is unavailable.

- [Project overview and architecture](../../README.md)
- [Onboarding](../ONBOARDING.md)
- [Architecture](../ARCHITECTURE.md)
- [CLI reference](../CLI_REFERENCE.md)
- [Operating guide](../PIPELINE_OPERATING_GUIDE.md)
- [Testing and quality](../TESTING_AND_QUALITY.md)
- [Evidence contract](../EVIDENCE_CONTRACT.md)
- [Developer/agent guide](../AGENT_GUIDE.md)
- [Current handoff](../../HANDOFF.md)
- [Prioritized backlog](../../TODO.md)
- [PRD index](../PRD.md)
- [PRD-004: Evidence-first Research Platform](../prd/004-evidence-first-research-platform.md)
- [PRD-005: Free Data and Research History](../prd/005-free-data-and-research-history.md)
- [Product roadmap](Product-Roadmap.md)
- [Agent system and guardrails](Agent-System-and-Guardrails.md)
- [Free research data sources and feature proposals](Free-Research-Data-Sources.md)
- [GitHub Wiki publishing guide](GitHub-Wiki-Publishing.md)
- [Google Sheets setup](Google-Sheets-Setup.md)
- [Google Sheets architecture and reasoning](Google-Sheets-Architecture-and-Reasoning.md)
- [Research and reasoning model](Research-and-Reasoning.md)
- [Screenshot evidence pipeline](Screenshot-Evidence-Pipeline.md)
- [Operations and troubleshooting](Operations-and-Troubleshooting.md)
- [End-to-end research and publishing acceptance](../END_TO_END_ACCEPTANCE.md)
- [Google Sheets data contract](Google-Sheets-Data-Contract.md)

## System boundary

`symbol → deterministic acquisition → raw evidence → normalized/canonical evidence → reconciliation → quality/readiness → optional model interpretation → schema validation`

Raw evidence and deterministic artifacts remain canonical. The dashboard, GitHub Pages, Google Sheets, and future PDF/API are views and distribution layers.

## Delivery status (2026-10-16)

- **Implemented baseline:** deterministic source collection/preparation, readiness/evidence artifacts, optional schema-validated analysis, local dashboard, market scans and Google Sheets exporter.
- **Merged:** read-only result validation/evidence auditing and bounded multi-step reasoning in PRs #7–#9.
- **Open implementation work:** [PR #10 — bounded reasoning guardrails](https://github.com/luckyhegde6/stockResearchApp/pull/10) and [PR #11 — end-to-end research publishing acceptance](https://github.com/luckyhegde6/stockResearchApp/pull/11).
- **Operationally unverified:** current Apps Script deployment, live Google Sheets publishing, and actual workbook screenshot visibility. Automated CI does not replace these checks.
- **Next evidence-trust priorities:** source freshness thresholds, conflict provenance, longitudinal `What Changed`, event monitoring, peer scorecard, robust backtesting and read-only API.

## GitHub Wiki availability

If `https://github.com/luckyhegde6/stockResearchApp/wiki` is empty or unavailable, ensure Wiki is enabled in repository Settings → Features. Once GitHub creates the initial Wiki page, its Git repository can be cloned and populated; see [the wiki publishing guide](GitHub-Wiki-Publishing.md). GitHub Wiki content does not automatically sync from this `docs/wiki` directory.
