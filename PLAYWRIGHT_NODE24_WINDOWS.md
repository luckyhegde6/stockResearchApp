# Playwright on Windows + Node 24

The project uses the stable Playwright Library (`playwright@1.62.1`) for application runtime browser automation.

The Playwright CLI and its daemon remain installed for manual/agent workflows and for the `.claude/skills/playwright-cli` skill, but the stock-research runtime does not depend on the CLI daemon.

Why: current reports document a Windows + Node 24 `UV_HANDLE_CLOSING` assertion during CLI/child-process teardown, including in the Playwright CLI ecosystem. The application therefore avoids spawning the CLI daemon from Node and launches Chromium through the Playwright Library directly.

Setup:

```cmd
npm install
npm run setup:playwright
npm run playwright:doctor
```

The doctor treats CLI health as non-blocking and Playwright Library launchability as authoritative.
