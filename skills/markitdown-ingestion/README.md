# MarkItDown ingestion phase

The research pipeline runs Microsoft MarkItDown deterministically over supported downloaded documents (PDF, DOCX, XLSX/XLS, PPTX/PPT, HTML, TXT and CSV when accepted by the installed MarkItDown build). Originals stay under `raw/`; converted files are mirrored beneath `markdown/`.

Screenshots are not treated as text-extracted facts by this phase. They are indexed in `visual-evidence.json` and `markdown/VISUAL_EVIDENCE.md` for later multimodal review. Numeric values visible in screenshots must be corroborated by structured source data where available.

Use:

```cmd
npm run ingest -- RELIANCE
```

For a complete deterministic preparation pass:

```cmd
npm run prepare:analysis -- RELIANCE
```
