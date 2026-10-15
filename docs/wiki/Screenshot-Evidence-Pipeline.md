# Screenshot Evidence Pipeline

## 1. Problem

Google Apps Script has a Blob-size constraint and an image pixel limit. Sending original browser captures may fail even when locally valid.

## 2. Optimization pipeline

The exporter uses Playwright Chromium canvas processing:

`read → decode → resize if needed → JPEG re-encode → size check → base64 → Apps Script → insert`

Current constraints:
- target maximum: 900,000 pixels
- default maximum per image: 1.4 MB
- hard per-image cap: 1.8 MB
- default total screenshot payload: 5 MB
- default maximum images: 8
- JPEG quality attempts descend from 0.88 to 0.34; image dimensions are reduced further if needed

For sources over the default source-size limit of 20 MB, compression is skipped and the row gets an explicit status. If Chromium cannot launch, decoding fails or compression cannot meet limits, the image is marked with a clear failure/skip reason instead of being reported as uploaded.

## 3. Metadata

The row retains original filename, original bytes, optimized bytes, original dimensions, output dimensions, optimization flag, JPEG quality and status. These fields allow reviewers to confirm whether a file was reduced and whether final payload remained within client limits.

## 4. Receiver-side validation

Apps Script checks bytes <= 1,800,000, positive image dimensions, and width × height <= 1,000,000 before insertion. It inserts the image into the run's screenshot-gallery tab, sets alt text and preserves aspect ratio; the image is not exposed as a public Drive URL.

## 5. Status lifecycle

Success: `pending_embedding → embedded_in_sheet`

Failure: `pending_embedding → embed_failed: <reason>`

Skip: `skipped_<reason>`

The receiver synchronizes `value`, `status` and `embedding_status` after the insertion attempt. The `StockResearch` index contains run links and a screenshot-embedded count.

## 6. Live acceptance

Source code and contract tests prove the optimizer and receiver guards are implemented; they do not prove that the deployed Apps Script is current or that images are visible in the target workbook.

1. Deploy latest `integrations/google-sheets/Code.gs` as a new Web App version.
2. Set Script Properties `SHEET_ID` and `API_TOKEN`; configure matching local `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_WEBHOOK_URL`, and `GOOGLE_SHEETS_WEBHOOK_TOKEN`.
3. Run `npm run sheets:doctor`, expecting `serviceVersion: 3` and the matching workbook ID.
4. Run a research export with existing chart screenshots.
5. Confirm exporter embedded/failed counts and each screenshot row's metadata/status agree.
6. Run `npm run acceptance:e2e -- HDFCBANK --publish`. It uses the strict export mode, requires at least one eligible upload, per-image receiver outcomes, matching aggregate counts, and successful insertion of every uploaded image. It fails on missing, duplicate, failed or skipped outcomes and writes a pending visibility report only when receiver-side insertion succeeds.
7. Open the workbook URL in that report, navigate to the exact run's screenshot-gallery tab (the tab whose dataset is `visual-evidence`), and visually confirm image objects are actually visible and legible.
8. After inspecting that same run, execute `npm run acceptance:e2e -- HDFCBANK --confirm-visible`. This consumes the pending report without republishing. The flag is an operator attestation; the CLI cannot prove the browser UI rendered the image.

An HTTP success without visible image objects is not sufficient acceptance.
