# Playwright NSE runtime (v1.9)

The production research application uses the Playwright **Library**, not the Playwright CLI daemon.

Why:
- avoids Windows `.cmd`/`cmd.exe` process launch issues;
- avoids the Node 24 + CLI lifecycle assertion observed on Windows;
- allows deterministic request/response capture directly from a browser context.

For NSE, the browser is launched with `--disable-http2` and `--disable-quic` as a compatibility attempt because Chromium exposes those switches. The application also retries navigation with a fresh browser session when it sees transport errors such as `ERR_HTTP2_PROTOCOL_ERROR`.

Normal CLI/skill use remains available for manual agent workflows:

```cmd
npx playwright-cli install --skills
npx playwright-cli --help
```

The application itself does not spawn `playwright-cli`.
