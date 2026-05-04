# WS4 Direction Alignment — Player Surfaces Migration Boundary

**Artifact:** EXEC-077 / WS4_PLAYER alignment note  
**Phase:** Financial Telemetry Wave 1 Phase 1.3 — UI Split Display + Labels  
**Status:** Approved direction adjustment — amended post domain expert review  
**Date:** 2026-05-04  

---

## 1. Context

WS4 halted on two valid implementation blockers:

1. `PlayerSummaryDTO` currently emits dollar-denominated plain `number` fields, not integer-cents `FinancialValue` envelopes.
   - Affected fields include `netWinLoss`, `theoEstimate`, and `sessionTotal`.
   - These fields were not migrated in prior service/API phases.
   - Creating envelopes locally in the UI would invent authority and violate Phase 1.3 scope.

2. `FilterTile.value` and `SummaryTile.secondaryValue` are string props.
   - They cannot directly render `<FinancialValue>`.
   - Refactoring the component prop API to accept React nodes would expand WS4 beyond the approved surface-normalization slice.

Therefore, direct `<FinancialValue>` migration is not valid for these WS4 surfaces without service DTO changes or component API changes, both of which are out of scope for EXEC-077.

---

## 2. Direction

WS4 should proceed with a **Phase 1.3-compliant string-level authority fallback**.

The goal is not to pretend these surfaces are fully envelope-migrated. The goal is to prevent the UI from rendering bare, misleading financial values while preserving the current PRD/EXEC scope.

This is a controlled migration boundary, not a skipped requirement.

---

## 3. Approved Handling

### 3.1 `summary-band.tsx` — Theo Line

Replace the bare computed render:

```tsx
secondaryValue={`Theo: ${formatDollars(data.sessionValue.theoEstimate)}`}
```

with an authority-labeled computed render:

```tsx
secondaryValue={`Theo (Estimated): ${formatDollars(data.sessionValue.theoEstimate)}`}
```

**Amendment rationale:** `theoEstimate` is a real computed value derived from rating slip × policy (`house_edge × avg_bet × decisions_per_hour × duration`). Replacing a live number with "Not computed" is factually wrong and more misleading than the original. The Q-A7 guard against `$0` belongs in the mapper layer — at the UI render, if a value is present, label it honestly. The "Estimated" prefix satisfies Phase 1.3 authority transparency requirements.

### 3.2 `filter-tile-stack.tsx` and `summary-band.tsx` — String-Based Currency Renders

Do **not** leave bare dollar strings where authority is determinable.

Authority has been confirmed from service code for all four affected fields:

| Field | Source | Authority |
|---|---|---|
| `sessionValue.netWinLoss` | Settled `player_financial_transaction` (in/out) | **actual** |
| `sessionValue.theoEstimate` | Rating slip × policy formula | **estimated** (covered in §3.1) |
| `cashVelocity.sessionTotal` | Settled buy-in aggregation | **actual** |
| `cashVelocity.ratePerHour` | Derived: `sessionTotal ÷ elapsed hours` | **estimated** |

**`filter-tile-stack.tsx` — full enumeration:**

```tsx
// line 87 — session tile (netWinLoss)
value={`Actual: ${formatDollars(data.sessionValue.netWinLoss)}`}

// line 101 — financial tile (sessionTotal)
value={`Actual: ${formatDollars(data.cashVelocity.sessionTotal)}`}
```

**`summary-band.tsx` — secondary string values:**

```tsx
// line 137 — theo (handled by §3.1 above)

// line 152 — cash velocity primary (ratePerHour is estimated/derived)
primaryValue={`Estimated: ${formatRate(data.cashVelocity.ratePerHour)}`}

// line 153 — cash velocity secondary (sessionTotal is actual)
secondaryValue={`Actual: ${formatDollars(data.cashVelocity.sessionTotal)}`}
```

**Note on `ratePerHour`:** Although this is a `primaryValue` on the SummaryTile, the title "Cash Rate" does not communicate that the figure is derived. The "Estimated:" prefix is therefore required for authority transparency, unlike `netWinLoss` (see §3.3 below).

### 3.3 `summary-band.tsx` — Primary Hero Value Boundary

`summary-band.tsx` line 136 renders `netWinLoss` as the `primaryValue` on the session `SummaryTile`. This field is **actual** (settled transactions), but `SummaryTile.primaryValue: string` prevents `<FinancialValue>` embedding.

The `primaryValue` position is a hero metric display. Adding `"Actual: $1,250"` degrades primary KPI readability. At this render position, the tile `title="Net Win/Loss"` and `category="session"` (emerald styling) together provide sufficient implicit authority context.

**Decision:** `netWinLoss` `primaryValue` in `summary-band.tsx` is recorded as a **controlled migration boundary** — bare formatted dollar string permitted at this position only. Future resolution requires broadening `SummaryTile.primaryValue` to `React.ReactNode` (CAP-1A props contract review required).

---

## 4. Non-Negotiables

WS4 must not:

- create local fake `FinancialValue` envelopes from dollar floats
- convert dollars to cents locally to satisfy `<FinancialValue>`
- change `PlayerSummaryDTO`
- change service, mapper, API, or OpenAPI shape
- refactor `FilterTile` or `SummaryTile` prop types from string to ReactNode
- leave bare currency strings without visible authority where authority is known
- claim full `<FinancialValue>` migration for string-only DTO-bound surfaces

---

## 5. Implementation Note to Record

Add an implementation note similar to:

> WS4 encountered DTO/component boundary constraints: `PlayerSummaryDTO` still exposes dollar-denominated plain numbers, and `FilterTile` / `SummaryTile` accept string props only. These surfaces cannot consume `<FinancialValue>` without DTO or component API changes, which are out of EXEC-077 scope. WS4 therefore applies Phase 1.3-compliant string-level authority labeling and records the remaining full-envelope migration as a future service/component boundary slice.

---

## 6. Future Follow-Up

A future slice should decide whether to:

1. migrate `PlayerSummaryDTO` financial fields to integer-cents `FinancialValue` envelopes, and/or
2. refactor `FilterTile` and `SummaryTile` value props to accept structured React content.

Until then, WS4 is considered Phase 1.3-compliant only if it avoids bare misleading financial strings and records the boundary explicitly.

---

## 7. Final Decision

Proceed with WS4 using controlled string-level authority labeling.

This preserves:

- Phase 1.3 scope
- no service/API leakage
- no fake envelope creation
- no unlabeled known-authority currency strings
- Q-A7 Theo correction

The correct posture is:

> Do not skip. Do not invent. Label honestly at the boundary.
