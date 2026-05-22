# SURFACE RENDERING CONTRACT — Financial Telemetry (PT-2 Pilot), "binding UI rulebook"

---

status: Accepted — Frozen 2026-04-23 (binding for UI/API surfaces; companion to ADR-FINANCIAL-EVENT-PROPAGATION §4)
date: 2026-04-23
frozen_date: 2026-04-23
scope: All financial surfaces (dashboard, API DTOs, reports)
depends_on:
- Fact Authority Matrix
- ADR-FINANCIAL-EVENT-PROPAGATION §4 (Surface Rendering Contract)
- ADR-FINANCIAL-FACT-MODEL (authority taxonomy source)
frozen_with:
- ../decisions/ADR-FINANCIAL-FACT-MODEL.md
- ../decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md
- ../decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md
purpose: Prevent semantic drift at the presentation layer
---------------------------------------------------------

# 1. Purpose

This contract defines how financial data MUST be presented.

It exists because:

> The system’s primary failure mode is not incorrect data, but incorrect interpretation.

This contract ensures:

* no number misrepresents its authority
* no mixed data appears as unified truth
* all financial surfaces are semantically explicit

---

# 2. Core Principle

> Every number must declare what it is, where it comes from, and how complete it is.

If a number does not satisfy all three:

→ it MUST NOT be displayed

---

# 3. Financial Value Classification

Every financial value MUST be classified into exactly one type:

| Type           | Label      | Source               | Meaning                                   |
| -------------- | ---------- | -------------------- | ----------------------------------------- |
| **Actual**     | Actual     | PFT                  | Authoritative, attributed financial event |
| **Estimated**  | Estimated  | Grind / TBT          | Unattributed operational estimate         |
| **Observed**   | Observed   | pit_cash_observation | Physical observation (non-transactional)  |
| **Compliance** | Compliance | MTL                  | Regulatory record                         |

---

# 4. Mandatory Labeling Rules

## L1 — Every value MUST include a label

Examples:

✔ `Rated In: $28,000 (Actual)`
✔ `Unrated In: $12,000 (Estimated)`

❌ `Total In: $40,000`

---

## L2 — Labels MUST be visible at first glance

Labels cannot be:

* hidden in tooltips
* implied by context
* assumed by user

---

## L3 — Naming must reflect authority

| Forbidden | Replace With                  |
| --------- | ----------------------------- |
| Total     | Rated / Estimated / Observed  |
| Handle    | Estimated Drop                |
| Chips Out | Cash Out                      |
| Win       | Inventory Win / Estimated Win |

---

# 5. Composition Rules (Critical)

## C1 — No implicit aggregation

> Mixed sources MUST NOT be combined into a single number.

Forbidden:

```text
Total In = PFT + Grind
```

---

## C2 — If combined, MUST be exploded

Allowed:

```text
Rated In (Actual): $28,000
Unrated In (Estimated): $12,000
```

Optional:

```text
Estimated Total In: $40,000 (Derived)
```

But ONLY if:

* explicitly labeled as derived
* never presented as authoritative

---

## C3 — Derived values must declare inputs

Example:

```text
Estimated Total In = Rated In + Unrated In
```

---

# 6. Attribution & Completeness

These are **two distinct signals** and MUST NOT be collapsed into one.

## K1 — Attribution Ratio (KPI, not completeness)

Attribution Ratio reports what share of observed table activity has player attribution:

```text
Attribution Ratio = Rated Activity / (Rated Activity + Estimated Activity)
```

Displayed as:

```text
Attribution Ratio: 70%
```

Rules:

* Labeled **"Attribution Ratio"** (previously "Coverage" — renamed to prevent conflation with completeness)
* Numerator is Class A (Ledger / Actual) activity
* Denominator sums Class A + Class B within the same aggregation window
* Classes A and B remain distinct in every other surface; this ratio is the **one** permitted place where their volumes are compared, and only as a ratio of counts/amounts — never as a merged total
* This is **not** a completeness measure. A 100% attribution ratio does NOT imply complete data — it only implies all observed activity was rated

---

## K2 — Completeness must be visible, not implied

Completeness is a per-surface signal carried in the DTO envelope (§10) — not the attribution ratio.

Forbidden:

* presenting partial data as full
* omitting unattributed activity
* using Attribution Ratio as a proxy for completeness
* rendering a value whose `completeness.status` is `unknown` without saying so

---

# 7. Authority Hierarchy (UI Enforcement)

| Level | Authority    | Display Priority   |
| ----- | ------------ | ------------------ |
| 1     | Actual (PFT) | Primary            |
| 2     | Observed     | Secondary          |
| 3     | Estimated    | Contextual         |
| 4     | Derived      | Explicitly labeled |

---

# 8. Surface Patterns

## Pattern A — Split Display (REQUIRED)

```text
Rated In (Actual): $28,000
Unrated In (Estimated): $12,000
Attribution Ratio: 70%
```

---

## Pattern B — Derived Summary (OPTIONAL)

```text
Estimated Total In: $40,000
(Actual + Estimated)
```

---

## Pattern C — Variance Awareness (FUTURE)

```text
Variance vs Count: +$2,000
```

(Not required for pilot)

---

# 9. Forbidden Patterns

## F1 — Single ambiguous totals

```text
❌ Total In: $40,000
```

---

## F2 — Mixed authority numbers

```text
❌ Win: $5,200 (mixed PFT + observation)
```

---

## F3 — Silent estimation

```text
❌ Handle: $40,000
```

(where handle includes grind but is unlabeled)

---

## F4 — Placeholder authority

```text
❌ Theo: 0
```

---

# 10. DTO / API Requirements

Every financial field MUST include:

```ts
{
  value: number
  type: 'actual' | 'estimated' | 'observed' | 'compliance'
  source: string
  completeness: {
    status: 'complete' | 'partial' | 'unknown'
    coverage?: number   // 0.0 – 1.0, present when computable
  }
}
```

Field rules:

* `type` — carries authority; matches `origin_label` from ADR-FINANCIAL-EVENT-PROPAGATION §4.2. Never omitted. Never "unknown".
* `source` — human-readable origin (e.g. `"PFT"`, `"grind"`, `"pit_cash_observation"`, `"mtl_entry"`).
* `completeness.status` — mandatory. `'unknown'` is an allowed status (say so, don't guess). Previously optional; now required so consumers cannot silently assume `complete`.
* `completeness.coverage` — optional numeric refinement of `partial`/`complete`. Omitted when not computable. NOT a substitute for `status`.

---

# 11. Developer Rules

* No UI may invent financial numbers
* No UI may merge sources implicitly
* All transformations must be explicit
* Naming must match authority

---

# 12. Consequences

## Positive

* Eliminates semantic confusion
* Aligns UI with real-world uncertainty
* Prevents reintroduction of shadow truth
* Improves operator trust

## Trade-offs

* More verbose UI
* Requires disciplined naming
* Forces explicit thinking about data

---

# 13. Closing Statement

The system does not fail when data is incomplete.

It fails when incomplete data is presented as complete.

> This contract ensures that every number tells the truth—
> not just mathematically, but semantically.

---
