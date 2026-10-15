# ADR-008 — Vendor-neutral model provider boundary

- Status: accepted
- Date: 2026-10-15

## Context

The analysis orchestration previously combined environment configuration, HTTP transport, response parsing, JSON syntax validation, and file persistence inside `runLlmAnalysis`. That made provider behavior hard to test without reaching the network and coupled orchestration to one compatible API response shape.

## Decision

Introduce a small `ModelProvider` interface and a default `OpenAICompatibleProvider` adapter. The current `LLM_ENDPOINT`, `LLM_API_KEY`, `LLM_MODEL`, and `LLM_TIMEOUT_MS` variables remain supported; optional `LLM_PROVIDER_ID` identifies the configured adapter in code. Provider fetch is injectable for deterministic tests.

The CLI keeps the same orchestration boundary: deterministic acquisition/preparation and readiness gate first, model call second, schema validation after returned JSON. No provider call can bypass the existing readiness gate.

## Consequences

- Provider transport is isolated behind a typed interface.
- Fixture tests cover request construction, response parsing, config validation, malformed/error responses, and file output without external network access.
- Additional vendor adapters can implement `ModelProvider` without rewriting analysis orchestration.
- This slice does not add retries, multi-step agent loops, streaming, tools/function calling, or live execution.
