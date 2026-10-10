# NSE troubleshooting

## `Playwright CLI not found`

The application resolves Playwright in this order:

1. `PLAYWRIGHT_CLI` environment override, if configured
2. local `node_modules/.bin/playwright-cli(.cmd)`
3. `npx --no-install playwright-cli`
4. `npx --yes --package=@playwright/cli@latest playwright-cli`

Install explicitly with:

```powershell
npm install
npx playwright-cli install-browser
npx playwright-cli install --skills
```

See the official Playwright CLI documentation for installation details.

## NSE API 403

The adapter first uses a cookie-aware HTTP client modeled on TradeNext's current NSE client, including homepage warm-up, browser-like headers and bounded retries. citeturn513555view0

When the direct request still fails, the same GET is attempted from the prepared Playwright browser session. This is deterministic browser execution, not an LLM step and not an attempt to defeat a CAPTCHA or access control.

If the quote API remains unavailable, the quote page is visited only as a fallback/audit. Its network requests are captured; if the page itself successfully requested `/api/quote-equity`, that JSON payload is recovered into `raw/nse-api/quote.json`. The quote page is not required for the normal path.

## Architecture

```text
NSE API
├── quote
├── trade info
├── financial results
├── announcements
├── corporate actions
└── historical prices / delivery

Playwright
├── annual-report filing discovery
├── shareholding filing discovery
└── quote-page fallback/audit only
```


## Windows `spawn EINVAL`

The project invokes Windows `.cmd` shims (for example `npx.cmd` and `playwright-cli.cmd`) through the Windows shell. This avoids Node `child_process.spawn()` returning `EINVAL` even when `npx playwright-cli ...` works in CMD.

Run:

```powershell
npm run playwright:doctor
```

A successful check prints `CLI: OK` and `Browser: OK`.
