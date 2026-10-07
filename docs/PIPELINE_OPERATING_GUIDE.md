# Stock Research Pipeline Operating Guide

This guide provides step-by-step instructions for operating the **Stock Research Pipeline** (v1.49.5), running individual stock research, triggering market scans, executing momentum screens, analyzing news sentiment, and generating AI analysis outputs.

---

## ⚙️ Prerequisites & Setup

### 1. Environment Setup

Copy `.env.example` to `.env` and configure optional LLM credentials:

```dotenv
# LLM Endpoint Configuration (Optional for acquisition, required for 'analyze')
LLM_ENDPOINT=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_api_key_here
LLM_MODEL=gpt-4o
LLM_TIMEOUT_MS=120000

# Pipeline Settings
RESEARCH_INCLUDE_CHARTINK=false
NSE_TIMEOUT_MS=30000
SOURCE_TIMEOUT_MS=45000
```

### 2. Dependency Verification

Ensure Python environment and Microsoft MarkItDown are available:

```powershell
# Verify Node.js and TypeScript environment
node --version # >= 20.0.0

# Verify Playwright CLI
npx playwright-cli --version

# Verify MarkItDown tool
markitdown --version
```

---

## 🔍 Workflow 1: Individual Stock Research

To execute deterministic data acquisition, document normalization, and evidence assembly for a single stock:

### Basic Research Command
```powershell
npm run research -- RELIANCE
```

### Accepted Symbol Inputs
The pipeline automatically resolves symbols via the NSE `EQUITY_L` security master:
- Pure ticker: `RELIANCE`, `TCS`, `INFY`, `ITC`
- Exchange prefix: `NSE:RELIANCE`
- Yahoo suffix: `RELIANCE.NS`
- TradingView URL: `https://in.tradingview.com/chart/?symbol=NSE%3ARELIANCE`

### Expected Outputs
Outputs are saved under `research/<SYMBOL>/`:
- `manifest.json`: Full manifest of acquired artifacts, warnings, and data gaps.
- `markdown/ALL_EVIDENCE.md`: Consolidated evidence normalized into Markdown.
- `derived/analysis-readiness.json`: Readiness gate evaluation result.
- `analysis-prompt.txt`: Full context prompt assembled for LLM analysis.

---

## 🤖 Workflow 2: AI Analysis Execution

Once research is completed, run the LLM analysis stage:

```powershell
npm run analyze -- RELIANCE
```

### Single-Step Combined Pipeline
To run research and LLM analysis together in a single step:
```powershell
npm run research:full -- RELIANCE
```

### Output File
Generates `outputs/RELIANCE-analysis.json`:
```json
{
  "symbol": "RELIANCE",
  "companyName": "Reliance Industries Limited",
  "analysisDate": "2026-09-22",
  "investmentVerdict": "BULLISH",
  "valuationScore": 82,
  "growthScore": 88,
  "moatScore": 90,
  "riskScore": 25,
  "targetPriceRange": { "low": 3100, "base": 3400, "high": 3800 },
  "status": "ok"
}
```

---

## 📊 Workflow 3: Market Scans & Momentum Screens

### 1. Chartink Market Scans
Execute configured Chartink screening criteria across the market universe:
```powershell
npm run market:scans
# or
npm run chartink:scans
```
Outputs are written to `scans/chartink-market-scans.json`.

### 2. Chartink Top 20 Momentum Screen
Run the top 20 volume & price momentum scan:
```powershell
npm run chartink:top20
```

### 3. NSE 52-Week High Breakout Scan
Fetch all NSE equities touching or near 52-week highs:
```powershell
npm run nse:52week-high
```

### 4. Screener Fundamental Market Screens
Run Screener fundamental filter presets across market sectors:
```powershell
npm run screener-screens
```

### 5. Tijori Market & Sector Overview
Extract sector breakdown and industry performance dashboards:
```powershell
npm run tijori-market
```

---

## 📰 Workflow 4: News & Sentiment Research

To pull recent news headlines, press releases, and market sentiment:

```powershell
npm run research:news -- RELIANCE
```

This aggregates:
- Financial media headlines (Economic Times, Moneycontrol, Livemint).
- Regulatory announcements from NSE NextAPI.
- Evaluates overall sentiment polarity (positive, neutral, negative).

---

## 🛠️ Debugging & Diagnostics

### Run System Doctor Checks
```powershell
# Check Playwright CLI setup
npm run playwright:doctor

# Check MarkItDown tool setup
npm run markitdown:doctor

# Check TradingView browser capture readiness
npm run tradingview-doctor
```

### Inspect Acquisition Debug Log
```powershell
npm run debug:show -- RELIANCE
```
This displays detailed request timelines, response status codes, and latency breakdowns stored in `research/<SYMBOL>/debug/acquisition-timeline.txt`.

---

## 🖥️ Workflow 5: Web Dashboard Control Center

To launch the web dashboard server for visual pipeline management, settings configuration, and results inspection:

```powershell
npm run dashboard
```
Open **`http://localhost:3000`** in your browser.

---

## 🔄 Workflow 6: Batch Research Runner

To run research sequentially over a batch list of symbols (e.g. `ITC`, `HDFCBANK`, `IOC`, `HPCL`):

```powershell
# Run configured watchlist in config/config.json
npm run research:batch

# Or specify custom list of symbols
npm run research:batch -- ITC HDFCBANK IOC HPCL RELIANCE TCS
```

---

## ⏰ Workflow 7: Cron Job Setup & Scheduling

### Option 1: Cross-Platform Node Daemon
```powershell
npm run cron
```

### Option 2: Windows Task Scheduler Registration
```powershell
.\scripts\setup-cron-windows.ps1
```

### Option 3: POSIX Crontab
```bash
./scripts/setup-cron-posix.sh
```

