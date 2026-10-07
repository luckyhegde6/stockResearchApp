# Onboarding — Stock Research Pipeline v1.50.0

## What this project does

Stock Research Pipeline builds an auditable evidence package for an NSE-listed equity. It resolves the symbol against the NSE security master, gathers deterministic evidence, normalizes documents, evaluates readiness, and optionally asks an LLM to produce a schema-validated analysis.

The pipeline is designed to keep acquisition separate from final investment reasoning.

## Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer for MarkItDown document conversion
- Chromium installed through Playwright

## Install

```powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env
```

If document ingestion is required, install MarkItDown in a virtual environment:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install "markitdown[all]"
```

Set `MARKITDOWN_BIN=markitdown` in `.env` when the executable is not already available on your path.

## First research run

```powershell
npm run research -- ITC
```

This writes acquired source artifacts, normalized evidence, a manifest, quality checks, and an `analysis-prompt.txt` file under `research/ITC/`.

LLM output is optional. To enable it, set `LLM_ENDPOINT`, `LLM_API_KEY`, and `LLM_MODEL` in your private `.env` file, then run:

```powershell
npm run analyze -- ITC
```

The validated result is written to `outputs/ITC-analysis.json`.

## Verify the installation

```powershell
npm run version:check
npm run test:source-classifier
npm run test:evidence-completeness -- ITC
```

For a full list of commands and environment variables, see [CLI_REFERENCE.md](CLI_REFERENCE.md). For pipeline behavior and source policy, see [PIPELINE_OPERATING_GUIDE.md](PIPELINE_OPERATING_GUIDE.md).

## Local dashboard

The local dashboard uses the API service and is not deployed as a functional GitHub Pages app:

```powershell
npm run dashboard
```

Open the local URL reported by the command. GitHub Pages hosts a static project overview only.
