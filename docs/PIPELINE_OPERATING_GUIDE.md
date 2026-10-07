# Pipeline Operating Guide

Current for v1.50.0. Source code and package.json are authoritative.

## Install

~~~powershell
npm install
npx playwright install chromium
Copy-Item .env.example .env

py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install "markitdown[all]"
~~~

LLM credentials are only required for final analysis.

## Deterministic research

~~~powershell
npm run research -- ITC
~~~

Flow:

~~~text
NSE master
→ NSE / Screener / Tijori / TradingView
→ TradingView snapshot + News
→ optional Chartink
→ normalization
→ canonical evidence
→ reconciliation
→ source health / quality
→ evidence contract
→ analysis inputs + evidence pack
→ readiness
~~~

Key outputs:

~~~text
research/ITC/
├── manifest.json
├── acquisition-report.json
├── analysis-readiness.json
├── evidence-contract.json
├── source-health.json
├── evidence-quality.json
├── analysis-prompt.txt
├── normalized/
├── markdown/
├── screenshots/
└── debug/
~~~

## Final analysis

~~~powershell
npm run analyze -- ITC
npm run validate -- ITC
~~~

The analyze path performs a fresh deterministic acquisition, prepares the reasoning handoff, checks readiness, calls the configured OpenAI-compatible endpoint, and validates the result with Ajv.

Important: research:full is currently an alias of research; it is not a combined research+analysis command.

## Targeted commands

~~~powershell
npm run ingest -- ITC
npm run prompt -- ITC
npm run evidence:quality -- ITC
npm run source:health -- ITC
npm run test:analysis-readiness -- ITC
npm run research:tradingview -- ITC
npm run research:news -- ITC
~~~

Market datasets:

~~~powershell
npm run market:scans
npm run screener-screens
npm run tijori-market
npm run nse:52week-high
npm run chartink:top20
~~~

## Dashboard

~~~powershell
npm run dashboard
~~~

Open http://localhost:3000.

The dashboard is a thin local API/UI over the existing CLI and filesystem. GitHub Pages is static only.

## Diagnostics

~~~powershell
npm run version:check
npm run playwright:doctor
npm run markitdown:doctor
npm run tradingview-doctor
npm run source:doctor
npm run test:all
~~~

## Failure interpretation

- Provider failure should become a warning/gap, not an unhandled adapter crash.
- A readiness block means deterministic evidence is insufficient.
- Advisory gaps do not necessarily block analysis.
- Do not bypass readiness by copying screenshot values into structured evidence.
