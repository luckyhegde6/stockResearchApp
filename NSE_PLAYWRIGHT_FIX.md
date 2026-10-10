# v1.9 NSE + Playwright Windows fix

This version removes all dynamic JavaScript-string execution from the NSE acquisition path. The application now uses Playwright Library callbacks directly.

It also:
- uses Chromium with `--disable-http2` and `--disable-quic` for NSE compatibility;
- defaults to headed mode on Windows unless `PLAYWRIGHT_HEADLESS=true` is set;
- retries NSE navigation after transport errors by creating a fresh browser session;
- attaches network listeners before page navigation so filing/quote API responses are not missed;
- does not spawn `playwright-cli` from the research application;
- keeps Playwright CLI only for the manual/agent skill installation workflow;
- keeps NSE quote page as fallback/audit only.

Chromium documents switches for disabling HTTP/2 and QUIC. Playwright users have also reported `ERR_HTTP2_PROTOCOL_ERROR` in Chromium headless contexts, making a headed/HTTP2-disabled retry a reasonable compatibility path. This is a fallback, not a bypass of access controls.
