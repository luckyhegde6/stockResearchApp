# Playwright Windows launcher

The application does not invoke `node_modules/.bin/playwright-cli.cmd` directly. It resolves `@playwright/cli/playwright-cli.js` and runs it with the current Node executable. This avoids CMD quoting problems, `shell:true`, and Windows `spawn EINVAL` / libuv assertion failures.

The official `@playwright/cli` package declares `playwright-cli` -> `playwright-cli.js` as its bin entry.
