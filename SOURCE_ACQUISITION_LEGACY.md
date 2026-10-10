# Source Acquisition Pipeline — Playwright CLI + Skills + MarkItDown

This document shows how to build the six evidence packs shown in the reference workflow.

The recommended division of labor is:

**Playwright CLI** → navigate dynamic websites, interact with elements, capture text/snapshots/screenshots/PDFs.

**Microsoft MarkItDown** → convert downloaded PDFs, DOCX/XLSX/PPTX/HTML/etc. into Markdown for indexing and analysis.

**Stock Analysis Skill** → inspect the normalized evidence and make the investment decision.

Playwright's current CLI documentation supports browser interaction, accessibility snapshots, screenshots and PDF export, and it can install local agent skills with `playwright-cli install --skills`. citeturn115003search1turn115003search2

Microsoft MarkItDown is a Python package and CLI for converting files to Markdown. Its official documentation shows `pip install 'markitdown[all]'` and `markitdown file.pdf -o output.md`. citeturn115003search0turn115003search9

---

## 1. Install the tooling

### Node / Playwright CLI

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
playwright-cli install --skills
```

The official Playwright docs list the global installation above and the `install --skills` command. citeturn115003search1

### Microsoft MarkItDown

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS/Linux
# source .venv/bin/activate

pip install 'markitdown[all]'
markitdown --help
```

MarkItDown's official README documents the `[all]` install and CLI conversion. citeturn115003search0

---

## 2. Recommended project layout

```text
stock-research/
├── skills/
│   ├── stock-analysis/
│   │   └── SKILL.md
│   ├── playwright-research/
│   │   └── SKILL.md
│   └── markitdown-ingestion/
│       └── SKILL.md
├── research/
│   └── RELIANCE/
│       ├── raw/
│       │   ├── annual-reports/
│       │   ├── concalls/
│       │   ├── technical/
│       │   ├── screener/
│       │   └── shareholding/
│       ├── markdown/
│       ├── screenshots/
│       └── manifest.json
└── outputs/
    └── RELIANCE-analysis.json
```

---

# Evidence Pack 1 — Annual Reports

### Primary sources

The reference workflow names:

- BSE
- NSE
- company website

NSE maintains an Annual Reports area on its site. citeturn115003search12

### Playwright workflow

Start at the company's exchange/company investor-relations page.

```bash
playwright-cli open "https://www.nseindia.com/"
playwright-cli snapshot --filename=research/RELIANCE/screenshots/nse-home.yml
```

For a known company page, navigate to the relevant annual-report or corporate-filings section, inspect the accessibility snapshot, and use the returned element refs to click the annual-report link.

Typical sequence:

```bash
playwright-cli open "<company-investor-relations-or-exchange-page>"
playwright-cli snapshot
playwright-cli click <annual-report-ref>
playwright-cli snapshot
playwright-cli screenshot --full-page --filename=research/RELIANCE/screenshots/annual-report-index.png
```

When the annual-report PDF opens in the browser, save the PDF through an allowed browser/download workflow or use the direct document URL if it is exposed by the page.

Do not try to defeat a CAPTCHA or access control. If the exchange page is difficult to automate, use the company investor-relations annual-report archive instead.

### MarkItDown workflow

```bash
markitdown research/RELIANCE/raw/annual-reports/annual-report-2026.pdf \
  -o research/RELIANCE/markdown/annual-report-2026.md
```

Repeat for the previous 1–2 years.

### Extraction prompt for the ingestion skill

```text
From this annual report Markdown, identify:
- consolidated vs standalone basis
- revenue, EBITDA, EBIT, PAT, EPS
- operating cash flow and free cash flow if derivable
- debt and net debt
- working-capital metrics
- ROE / ROCE / ROIC if available
- segment performance
- contingent liabilities
- related-party transactions
- auditor qualifications/observations
- accounting policy changes
- exceptional items
- MDA/business review section
- principal risks
Return structured facts with page/section references and do not infer missing values.
```

---

# Evidence Pack 2 — MDA

The MDA is usually inside the annual report.

After MarkItDown conversion, search the Markdown for headings such as:

```text
Management Discussion and Analysis
Management Discussion & Analysis
MD&A
Business Review
Industry Overview
Risk Management
```

Do not download a second copy of the annual report if the MDA is already present.

---

# Evidence Pack 3 — Concall Transcripts

The reference workflow names:

- Screener.in
- Tijori Finance

Screener company pages currently expose a `Concalls` section with transcript/PPT material for many companies. For example, the Reliance Industries page shows recent quarterly concall entries including Jul 2026, Apr 2026 and Jan 2026. citeturn126794search0

Tijori company pages also expose conference-call material for covered companies. citeturn126794search12

### Playwright workflow — Screener

```bash
playwright-cli open "https://www.screener.in/company/RELIANCE/"
playwright-cli snapshot
```

Find the `Concalls` section in the accessibility snapshot.

```bash
playwright-cli snapshot --filename=research/RELIANCE/screenshots/screener-concalls.yml
```

Use the returned element refs to open the latest transcript, save/capture the accessible text, and retain the URL and quarter/date in the manifest.

If a transcript is provided as a PDF or downloadable document:

```bash
markitdown research/RELIANCE/raw/concalls/q1-fy27-transcript.pdf \
  -o research/RELIANCE/markdown/q1-fy27-concall.md
```

If the transcript is ordinary HTML, MarkItDown can also convert HTML to Markdown.

### Playwright workflow — Tijori

```bash
playwright-cli open "https://www.tijorifinance.com/company/<company-slug>/"
playwright-cli snapshot
```

Locate the conference-call section. Use the browser-visible content and download links provided by the site.

Do not bypass login, subscription restrictions, or anti-bot controls.

### Transcript evidence extraction

For each quarter store:

```json
{
  "quarter": "Q1 FY27",
  "date": "2026-07-xx",
  "source": "Screener.in",
  "transcript_path": "markdown/q1-fy27-concall.md",
  "guidance": [],
  "key_questions": [],
  "management_claims": [],
  "risks_discussed": []
}
```

---

# Evidence Pack 4 — Daily TradingView Chart

This pack should be treated as a visual artifact.

### Chart setup

Open the TradingView chart for the target stock and set:

- timeframe: 1D
- 50 EMA
- 200 EMA
- RSI
- Volume

Then capture the chart.

Playwright's screenshot command is explicitly intended for visual capture and supports full-page and named-file screenshots. citeturn115003search2

Example:

```bash
playwright-cli open "<tradingview-chart-url>"
playwright-cli snapshot
playwright-cli screenshot --filename=research/RELIANCE/raw/technical/reliance-1d.png
```

For chart/canvas content, prefer the screenshot rather than assuming accessibility text contains the indicator values. The stock-analysis skill should inspect the screenshot visually.

### Do not use MarkItDown for the chart

MarkItDown is excellent for documents, but a TradingView canvas is better preserved as a screenshot. The chart should be analyzed as an image artifact, optionally accompanied by raw OHLC data from another source if you have it.

---

# Evidence Pack 5 — Screener Snapshot

Open:

```bash
playwright-cli open "https://www.screener.in/company/RELIANCE/"
playwright-cli snapshot --filename=research/RELIANCE/screenshots/screener-snapshot.yml
```

Capture the page or relevant metric element:

```bash
playwright-cli screenshot --full-page --filename=research/RELIANCE/raw/screener/reliance-screener.png
```

Retain the page text/snapshot for structured extraction, and the screenshot as an audit artifact.

The Screener page for Reliance currently exposes metrics such as market cap, current price, P/E, book value, dividend yield, ROCE, ROE and quarterly results, plus concalls. citeturn126794search0

### Fields to extract

```text
Current Price
Market Cap
P/E
P/B or Book Value
ROE
ROCE
Debt/Equity
Revenue Growth
Profit Growth
Operating Cash Flow
Promoter Holding
Promoter Pledge
52-week High/Low
```

Use the exact figures visible in the page at retrieval time.

---

# Evidence Pack 6 — Latest Shareholding Pattern

Use BSE/NSE or the company's exchange filing.

### Playwright workflow

```bash
playwright-cli open "<exchange-company-page>"
playwright-cli snapshot
```

Locate the latest shareholding-pattern filing, then download/open it through the normal site workflow.

If the filing is a PDF:

```bash
markitdown research/RELIANCE/raw/shareholding/latest-shareholding.pdf \
  -o research/RELIANCE/markdown/latest-shareholding.md
```

Extract:

- promoter and promoter group
- promoter pledge
- FII/FPI
- DII
- mutual funds
- public/retail
- changes vs previous quarter

Keep the filing period explicit.

---

# Build a Manifest

Create `research/<TICKER>/manifest.json`:

```json
{
  "company": "Reliance Industries Limited",
  "ticker": "RELIANCE",
  "retrieved_at": "2026-08-28T01:58:00+05:30",
  "packs": [
    {
      "id": "annual_report_2026",
      "type": "annual_report",
      "source": "NSE/BSE/company",
      "url": "",
      "artifact": "raw/annual-reports/annual-report-2026.pdf",
      "markdown": "markdown/annual-report-2026.md",
      "reporting_period": "FY2025-26"
    },
    {
      "id": "concall_q1_fy27",
      "type": "concall",
      "source": "Screener.in",
      "url": "",
      "artifact": "raw/concalls/q1-fy27-transcript.pdf",
      "markdown": "markdown/q1-fy27-concall.md",
      "reporting_period": "Q1 FY27"
    },
    {
      "id": "technical_1d",
      "type": "technical_chart",
      "source": "TradingView",
      "url": "",
      "artifact": "raw/technical/reliance-1d.png",
      "reporting_period": "daily"
    },
    {
      "id": "screener_snapshot",
      "type": "screener",
      "source": "Screener.in",
      "url": "https://www.screener.in/company/RELIANCE/",
      "artifact": "raw/screener/reliance-screener.png",
      "reporting_period": "retrieval-time"
    },
    {
      "id": "shareholding_q1_fy27",
      "type": "shareholding",
      "source": "BSE/NSE",
      "url": "",
      "artifact": "raw/shareholding/latest-shareholding.pdf",
      "markdown": "markdown/latest-shareholding.md",
      "reporting_period": "Q1 FY27"
    }
  ]
}
```

---

# Recommended Automation Loop

```text
Ticker
  ↓
Resolve official company/exchange URLs
  ↓
Playwright CLI navigates dynamic pages
  ↓
Collect PDFs / HTML / screenshots / snapshots
  ↓
Store raw artifacts unchanged
  ↓
MarkItDown converts documents to Markdown
  ↓
Build manifest + normalized evidence
  ↓
Stock Analysis Skill performs cross-checks
  ↓
ANALYSIS_PROMPT.md requests JSON only
  ↓
Validate JSON against JSON_SCHEMA.md
  ↓
Frontend renders cards/charts/decision
```

---

# Important Practical Notes

### Dynamic exchange sites

NSE/BSE pages can change their UI, file links and anti-bot behavior. Build selectors around stable accessibility roles/text where possible and keep source adapters isolated.

### Annual reports

The MDA is generally part of the annual report, so the six-pack process does not require six separate downloads.

### Concall data

Screener and Tijori coverage may differ by company and quarter. Treat the sources as interchangeable fallbacks, not as guaranteed mirrors of every call.

### Charts

Use screenshots for TradingView because visual chart state matters. Playwright documentation explicitly recommends screenshots for verifying visual layout and canvas/chart content. citeturn115003search2

### MarkItDown

MarkItDown converts supported documents to Markdown and is useful for indexing/text analysis. Keep the original files as the canonical evidence and Markdown as the normalized analysis layer. citeturn115003search0
