# TradingView Public UI Surface Capture

The production adapter captures supplementary TradingView surfaces by navigating directly to stable public symbol-page routes with Playwright.

## Active surfaces

- `forecast` → `/symbols/NSE-<SYMBOL>/forecast-price-target/`
- `news` → `/symbols/NSE-<SYMBOL>/news/`
- `documents` → `/symbols/NSE-<SYMBOL>/documents/`
- `seasonals` → `/symbols/NSE-<SYMBOL>/seasonals/`
- `community` → `/symbols/NSE-<SYMBOL>/community/`

The symbol and exchange are generated dynamically through `src/lib/tradingview-url.ts`. The production surface path does not depend on TradingView's Metrics/More launcher DOM.

## Capture contract

1. Open the requested NSE chart page first to establish a clean Playwright session.
2. Navigate to the canonical public symbol-page URL with `page.goto()`.
3. Wait for the configured direct-surface settle period.
4. Confirm the exact TradingView host and symbol/surface pathname.
5. Confirm surface-specific visible content.
6. Capture a full-page screenshot.
7. Write `raw/tradingview/ui-<surface>.json` and `screenshots/tradingview-<surface>.png`.

The resulting evidence is supplementary visual/audit evidence. Numeric investment facts must continue to come from structured sources.

## Failure handling

A screenshot may be retained as `partial` evidence when the route/content confirmation fails. A surface must be marked `ok` only when navigation, exact-route confirmation, content confirmation, and a non-empty screenshot all succeed.

Historical Metrics-menu implementation details belong in the archived release notes, not the active adapter documentation.