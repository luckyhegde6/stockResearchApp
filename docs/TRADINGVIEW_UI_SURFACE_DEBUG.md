# TradingView UI Surface Debugging

## Current UI model

TradingView Supercharts uses a four-square/grid control on the right-hand instrument card. Hovering the control shows the tooltip `Metrics`.

Do not rely on a text `More` button being present.

## Launcher order

1. `aria-label="Metrics"`
2. `title="Metrics"`
3. `data-tooltip="Metrics"`
4. `data-tooltip-content="Metrics"`
5. TradingView semantic/data-name metrics selectors
6. Instrument-card geometry + SVG/grid scoring

## News

The News surface has an alternate direct right-panel route. The adapter tries exact accessible News controls before falling back to Metrics.

## Required debug fields

- launcher strategy
- semantic attributes
- stock card bounds
- candidate controls
- selected candidate
- click result
- post-launch controls
- surface click result
- final URL/title
- route hint
- content hint
- screenshot bytes

## Failure interpretation

- `ok`: launcher + surface click + confirmation + screenshot
- `partial`: screenshot exists but selection/confirmation failed
- `error`: screenshot unavailable or capture failed

A partial surface must not poison the core TradingView source health because UI surfaces are supplementary evidence.
