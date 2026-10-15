
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
- [Google Sheets data contract](Google-Sheets-Data-Contract.md)

## System boundary

`symbol → deterministic acquisition → raw evidence → normalized/canonical evidence → reconciliation → quality/readiness → optional model interpretation → schema validation`

Raw evidence and deterministic artifacts remain canonical. The dashboard, GitHub Pages, Google Sheets, and future PDF/API are views and distribution layers.

## Delivery status (2026-10-15)

- **Implemented baseline:** deterministic source collection/preparation, readiness/evidence artifacts, optional schema-validated analysis, local dashboard, market scans and Google Sheets exporter.
- **Implemented and merged:** read-only result validation, evidence inspection/auditing from PR #7.
- **In progress:** vendor-neutral model provider adapter and fixture tests in [PR #8](https://github.com/luckyhegde6/stockResearchApp/pull/8).
- **Operationally unverified:** live Apps Script deployment and real workbook screenshot embedding.
- **Planned:** bounded multi-step reasoning, Evidence Trust Center, What Changed, source-linked event timeline, monitoring, peer scorecard, robust backtesting and read-only API.

## GitHub Wiki availability

If `https://github.com/luckyhegde6/stockResearchApp/wiki` is empty or unavailable, ensure Wiki is enabled in repository Settings → Features. Once GitHub creates the initial Wiki page, its Git repository can be cloned and populated; see [the wiki publishing guide](GitHub-Wiki-Publishing.md). GitHub Wiki content does not automatically sync from this `docs/wiki` directory.
