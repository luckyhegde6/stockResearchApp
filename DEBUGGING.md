# Debugging and Checkpoint Logs

`npm run research:nse -- RELIANCE` now prints a checkpoint for every major NSE acquisition stage and writes three files under `research/<TICKER>/debug/`:

- `acquisition-debug.json` — complete structured checkpoint history and final summary.
- `acquisition-debug.jsonl` — one JSON checkpoint event per line, useful for sharing/streaming.
- `acquisition-timeline.txt` — human-readable timeline.

The console also prints a final summary with the paths to these files.

## Status meanings

- `OK`: primary route succeeded.
- `OK_WITH_FALLBACK`: primary route failed, but a deterministic fallback recovered usable evidence.
- `WARN`: evidence was acquired but has a quality/coverage warning.
- `FAIL`: checkpoint could not acquire required evidence.
- `SKIP`: capability was unavailable or unnecessary.

## What to submit for debugging

For a failed or suspicious run, paste:

1. The terminal output from `npm run research:nse -- TICKER`.
2. `research/TICKER/debug/acquisition-debug.json`.
3. If historical data is suspicious, `research/TICKER/raw/nse-api/historical-validation.json`.
4. The relevant raw JSON artifact if a source payload looks wrong.

The debug files do not contain API keys or LLM output. They do contain source URLs and acquisition metadata.
