# PRD-002 — Local Dashboard

## Objective

Provide a thin local control center over the existing CLI and research filesystem.

## Requirements

- Launch single-symbol and batch research.
- Launch market scans.
- Show live run progress.
- Inspect readiness and deterministic results.
- Trigger final analysis and Laya decisions.
- Manage watchlist/configuration.
- Keep GitHub Pages static; the functional dashboard is local.

## Design rule

The dashboard is orchestration UI, not a second research engine. Truth comes from CLI-produced artifacts.
