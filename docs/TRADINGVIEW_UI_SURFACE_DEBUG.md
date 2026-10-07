# TradingView Public UI Surface Debugging

## Current capture model

The production path is:

`chart page → canonical public symbol page → route/content confirmation → full-page screenshot`

It does not depend on the Metrics/More launcher.

## Debug fields

Each `raw/tradingview/ui-<surface>.json` records:

- target URL and final URL
- navigation success/error
- exact route confirmation
- surface-specific content confirmation
- surface name/label
- visible body-text sample
- screenshot existence and byte size
- capture strategy

## Failure interpretation

- `ok`: navigation + exact route + surface content + screenshot succeeded
- `partial`: screenshot exists but one or more confirmation checks failed
- `error`: screenshot could not be created

A partial surface remains supplementary evidence and must not replace structured numeric sources.

For historical Metrics-menu troubleshooting, see the archived v1.49 release documentation.