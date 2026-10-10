# Screenshot Evidence Pipeline

## 1. Problem

Google Apps Script rejects oversized image Blobs.

The original failure was:

`The blob was too large. The maximum blob size is 2 MB.`

and:

`The maximum number of pixels is 1 million.`

Therefore simply sending the original browser screenshot was not reliable.

## 2. Optimization pipeline

Each screenshot follows:

`read → inspect → resize → JPEG encode → size check → base64 → Apps Script → insert`

The target is:

- at most 900,000 pixels
- below the configured exporter byte limit
- comfortably below the Apps Script 2 MB limit

The current configured upload cap is 1.4 MB.

## 3. Metadata retained

Optimization must not destroy provenance.

Each screenshot row can retain:

- original filename
- original size
- optimized size
- original width
- original height
- optimized width
- optimized height
- optimization flag
- JPEG compression quality
- embedding status

## 4. Receiver-side validation

Apps Script enforces a second boundary:

`size < 1.8 MB`

and:

`pixels ≤ 1,000,000`

This protects the receiver even if another client sends an invalid payload.

## 5. Embedding

The image is inserted into the same consolidated run tab as the screenshot metadata.

It is not uploaded as a public Drive link.

The row remains the authoritative metadata record while the actual image is the visual evidence.

The receiver preserves aspect ratio when setting the displayed image size.

## 6. Status lifecycle

Expected lifecycle:

`pending_embedding → embedded_in_sheet`

Failure:

`pending_embedding → embed_failed: <reason>`

Skip:

`pending_embedding → skipped_<reason>`

The three public status fields are synchronized after the insertion attempt.

## 7. Troubleshooting

If all screenshots fail:

1. run `npm run sheets:doctor`
2. verify `serviceVersion: 2`
3. redeploy Apps Script
4. run a fresh export
5. inspect the screenshot row's error
6. confirm optimized bytes and pixels are within limits

If the optimized image is already small but insertion still fails, the likely issue is the deployed receiver rather than the Node optimizer.

## 8. Important limitation

A successful exporter response is not sufficient proof that the images are visually present.

The final acceptance test is opening the generated Google Sheet and confirming that the image objects are actually visible in the SCREENSHOTS section.
