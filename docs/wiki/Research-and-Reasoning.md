# Research & Reasoning

## 1. Research philosophy

StockResearchApp separates **acquisition**, **normalization**, **evidence**, **findings** and **reasoning**.

The important distinction is:

> Facts should come from sources; conclusions should come from explicit reasoning over those facts.

The LLM/reasoning layer should not be used to invent missing acquisition data.

## 2. Evidence hierarchy

A practical hierarchy is:

1. structured primary-source data
2. deterministic normalized values
3. calculations derived from verified structured values
4. source-page text
5. screenshots as visual/provenance evidence
6. model interpretation

The lower levels should not silently override stronger evidence.

## 3. Evidence record

A useful evidence row identifies:

- field
- value
- unit
- source
- source artifact
- as-of date
- reporting period
- confidence
- verification state
- notes

This allows a reader to ask:

**What is the number?**

**Where did it come from?**

**When was it true?**

**Was it verified?**

**Was it calculated or directly sourced?**

## 4. Findings

Findings are not raw facts.

Example:

**Fact:** revenue grew from one reporting period to another.

**Finding:** the growth trend is positive.

**Reasoning:** sustained growth combined with improving margins may indicate operating leverage, subject to cash-flow quality and valuation.

The sheet should preserve this distinction.

## 5. Quality

Quality should expose:

- missing evidence
- source gaps
- unresolved conflicts
- stale data
- incomplete acquisition
- readiness state
- warnings

A visually complete sheet must not imply that research is complete.

## 6. Analysis readiness

The presence of a sheet is not proof that an investment analysis is ready.

A research run can legitimately be:

`NOT_READY`

when required evidence is missing.

That state is valuable because it prevents downstream reasoning from treating incomplete research as complete.

## 7. Financial conflicts

When values disagree, first test:

### Period

Are both values for the same fiscal period?

### Scope

Are both standalone or both consolidated?

### Units

Is one value in thousands/crores/millions while the other is in absolute units?

### Currency

Are both values denominated in the same currency?

### Definition

Do the sources define the metric in the same way?

### Freshness

Could one source be stale?

Only after these checks should a conflict be classified.

## 8. Investment reasoning

A strong research output should separate:

### Facts

What is objectively supported?

### Interpretation

What does the evidence suggest?

### Risks

What could invalidate the interpretation?

### Catalysts

What could improve the outcome?

### Scenarios

What happens under different assumptions?

### Decision

What action follows from the evidence and risk/reward?

The final decision should never be stronger than the evidence supporting it.

## 9. Research quality rule

A useful invariant is:

`confidence(decision) ≤ confidence(evidence)`

If critical evidence is missing, the recommendation should become more conditional rather than more confident.
