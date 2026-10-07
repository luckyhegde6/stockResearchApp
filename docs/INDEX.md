# Stock Research Pipeline Documentation Index

Welcome to the documentation hub for the **Stock Research Pipeline** (v1.49.5).

This repository contains a symbol-agnostic, NSE-first Indian equity research pipeline designed for deterministic evidence collection, schema validation, and optional LLM-driven financial analysis.

---

## 📚 Documentation Directory

| Document | Description |
| :--- | :--- |
| 🚀 **[Onboarding](ONBOARDING.md)** | Local prerequisites, first research run, optional LLM setup, and verification commands. |
| 🏗️ **[Architecture Guide](ARCHITECTURE.md)** | Technical design, data flow, pipeline lifecycle, multi-source fallback hierarchy, and schema contracts. |
| 📖 **[Pipeline Operating Guide](PIPELINE_OPERATING_GUIDE.md)** | Step-by-step instructions for running individual research, market scans, top-20 momentum screens, 52-week highs, and news sentiment analysis. |
| 📜 **[Evidence Contract Specification](EVIDENCE_CONTRACT.md)** | Detailed specification of the 6 core evidence packs, quality scoring metrics, canonical fact reconciliation, and data gap taxonomy. |
| 🔌 **[Adapters Catalog](ADAPTERS_CATALOG.md)** | Comprehensive developer reference for all 12 source adapters (`NSE`, `Screener`, `Tijori`, `TradingView`, `Chartink`, `BSE`, `News Sentiment`, etc.). |
| 🌐 **[NSE NextAPI Guide](NSE_NEXTAPI_GUIDE.md)** | API catalog, session/cookie handling, historical data chunking, security master resolution (`EQUITY_L`), and rate-limiting rules. |
| 🧪 **[Testing & Quality Assurance](TESTING_AND_QUALITY.md)** | Test runner execution guide, diagnostic tools (`cli-doctor`, `markitdown-doctor`), evidence completeness gates, and scan quality scoring. |
| 💻 **[CLI & Environment Reference](CLI_REFERENCE.md)** | Complete reference for all CLI subcommands, `npm run` scripts, flags, environment variables (`.env`), and installation prerequisites. |
| 📜 **[Releases & Changelog](RELEASES_AND_CHANGELOG.md)** | Consolidated version history and detailed changelogs from v1.0 up to v1.49.5. |

---

## 🚀 Quick Start Summary

```bash
# 1. Install Node dependencies
npm install

# 2. Setup environment variables
cp .env.example .env

# 3. Execute individual stock research (e.g. RELIANCE)
npm run research -- RELIANCE

# 4. Perform LLM analysis (requires LLM_* in .env)
npm run analyze -- RELIANCE

# 5. Run full test suite
npm run test:all
```

---

## 📁 Repository Directory Overview

```text
stock-research-app/
├── config/              # Scan registries, BSE scrip maps, and NSE series notes
├── data/                # NSE security master cache (EQUITY_L.json)
├── docs/                # Comprehensive documentation hub (this folder)
├── outputs/             # Final validated analysis JSON files (<SYMBOL>-analysis.json)
├── research/            # Per-symbol raw artifacts, screenshots, derived markdown, and prompts
├── scans/               # Long-lived market scan outputs and Chartink criteria configs
├── scripts/             # Diagnostic scripts, test suites, and maintenance CLIs
├── src/
│   ├── adapters/        # 12 data source adapters (NSE, Screener, Tijori, TradingView, etc.)
│   ├── lib/             # Core pipeline logic, normalizers, evidence reconcilers & CLI helpers
│   ├── index.ts         # Main CLI entrypoint
│   ├── schema.ts        # Ajv JSON schema contract for LLM stock analysis output
│   └── types/           # TypeScript interface definitions
├── package.json         # Package configuration & script definitions
└── tsconfig.json        # TypeScript compiler options
```
