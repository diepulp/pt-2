# ADR-031: Financial Amount Convention — Cents Storage, Dollars at Service Boundary

**Status:** Proposed
**Date:** 2026-02-02
**Owner:** Platform / All bounded contexts with financial fields
**Decision Scope:** Storage format, conversion boundary, formatting API, DTO annotation
**Related:** ISSUE-CENTS-TO-DOLLARS-STANDARDIZATION, ISSUE-4E623BC1, ADR-015, SRM v4.11.0
**Triggered By:** Recurring display bugs (buy-in of $100 displayed as $10,000; shift dashboard showing raw cents)

---

## Context

### Problem Statement

PT-2 stores financial amounts in **cents** (integer multiples of 100) in core tables (`player_financial_transaction`, `mtl_entry`, `table_buyin_telemetry`, shift metric RPCs) but in **dollars** in others (`rating_slip.average_bet`, possibly `pit_cash_observation.amount`). This dual convention is:

1. **Undocumented at the database level** — no `COMMENT ON COLUMN` specifies the unit on any core financial column
2. **Undocumented in DTOs** — `amount: number` carries no semantic unit; only `services/mtl/dtos.ts` references `ISSUE-FB8EB717`
3. **Inconsistently converted** — three competing patterns exist for the same cents-to-dollars operation
4. **Fragmented in formatting** — 10+ independent `formatCurrency` implementations with different input expectations
5. **Not type-safe** — `number` type allows passing cents where dollars are expected (or vice versa) with zero compiler feedback

This has produced at least three user-visible display bugs since 2025-12:

| Date | Bug | Root Cause |
|------|-----|-----------|
| 2026-01-29 | Player 360 summary: $100 buy-in displayed as $10,000 | Service layer passed raw cents without `/100` |
| 2026-01-29 | Timeline events: "$10,000" instead of "$100" | RPC returned cents, no conversion before display |
| 2026-02-02 | Shift dashboard: cent values visible in UI | `formatCurrency` applied inconsistently across two data paths |

### Current State: Three Conversion Patterns

**Pattern A — RPC-level conversion** (1 instance):
`rpc_get_player_timeline` returns `ROUND(pft.amount / 100.0, 2)` — SQL does the conversion.

**Pattern B — Service-layer conversion** (3 instances):
`player360-dashboard/crud.ts`, `visit/crud.ts`, `rating-slip/mappers.ts` each divide by 100 in TypeScript.

**Pattern C — Component-level conversion** (6+ instances):
MTL components, rating-slip modal, rundown-summary-panel each divide by 100 at render time.

When a new consumer is added, the developer must discover which layer already converts. No type-system enforcement, no naming convention, and no documentation prevents double-conversion or omission.

### Storage Convention Map (As-Is)

| Table / Column | Type | Actual Unit | Evidence |
|---|---|---|---|
| `player_financial_transaction.amount` | numeric | **CENTS** | `use-save-with-buyin.ts:121` multiplies by 100 on write |
| `mtl_entry.amount` | numeric | **CENTS** | `services/mtl/dtos.ts:84` comment, test values (5000 = $50) |
| `table_buyin_telemetry.amount_cents` | bigint | **CENTS** | Column name + SQL COMMENT |
| `table_context` fields (`amount_cents`, `discrepancy_cents`) | int | **CENTS** | Explicit `_cents` suffix |
| Shift metric RPCs (`fills_total_cents`, `win_loss_*_cents`) | bigint | **CENTS** | Column names + `chipset_total_cents()` helper |
| `rating_slip.average_bet` | numeric | **DOLLARS** | Displayed directly without conversion |
| `pit_cash_observation.amount` | numeric | **UNDOCUMENTED** | No column comment, no `_cents` suffix, no write-path evidence |
| `visit_financial_summary` (view) | numeric | **CENTS** | Aggregates raw `pft.amount` |

---

## Decision

### Rule 1: Cents as Canonical Storage Unit

All financial amounts MUST be stored in **cents** (integer representation, 1 dollar = 100 cents) at the database level. This eliminates floating-point precision errors in aggregation and comparison.

Columns that already store dollars (`rating_slip.average_bet`) are grandfathered but MUST carry a SQL `COMMENT` declaring their unit. New financial columns MUST use cents.

### Rule 2: Service Layer Is the Single Conversion Boundary

The **service layer** (mappers, crud functions) is the single place where cents become dollars. This means:

| Layer | Returns | Responsibility |
|---|---|---|
| **Database / RPC** | Raw cents (or documented unit) | No conversion — return what is stored |
| **Service / Mapper** | Dollars | Convert cents to dollars in mapper or crud function |
| **Hook / Component** | Dollars (received from service) | Display only — never divide by 100 |

RPCs that currently return dollars (e.g., `rpc_get_player_timeline` after migration `20260129`) are acceptable as long as the corresponding service layer does NOT double-convert. The key invariant is: **each financial value is converted exactly once, and the service/mapper layer owns that conversion.**

### Rule 3: Two Named Formatting Functions

Replace all `formatCurrency` variants with two explicit functions in `lib/format.ts`:

```typescript
/**
 * Format a dollar amount for display.
 * Input MUST be in dollars (already converted from cents at service boundary).
 */
export function formatDollars(dollars: number | null | undefined): string;

/**
 * Format a cent amount for display.
 * Converts cents to dollars internally. Use ONLY when consuming raw
 * cents that bypassed the service layer (e.g., component-level display
 * of a DTO field explicitly documented as cents).
 */
export function formatCents(cents: number | null | undefined): string;
```

The existing `formatCurrency(cents)` function MUST be **deprecated** with a JSDoc `@deprecated` tag and eventually removed. New code MUST use `formatDollars()` or `formatCents()` — the function name makes the expected input unit unambiguous.

`formatCurrencyDelta` follows the same split: `formatDollarsDelta` / `formatCentsDelta`.

### Rule 4: DTO Field Naming Convention

Financial fields in DTOs MUST declare their unit via one of:

**Option A — Suffix convention (preferred for cents):**
```typescript
fills_total_cents: number;    // Unambiguous — the field IS in cents
```

**Option B — JSDoc annotation (required for dollars or mixed):**
```typescript
/** Total buy-in amount in dollars (converted from cents at service layer) */
total_buy_in: number;
```

Every financial `number` field MUST have either a `_cents` / `_dollars` suffix OR a JSDoc `@unit` comment. Bare `amount: number` with no unit documentation is a lint violation (enforced via code review until automated).

### Rule 5: SQL Column Documentation

Every financial column MUST carry a `COMMENT ON COLUMN` declaring its unit:

```sql
COMMENT ON COLUMN player_financial_transaction.amount IS
  'Transaction amount in cents (1 dollar = 100). Positive for buy-ins, negative for adjustments.';

COMMENT ON COLUMN pit_cash_observation.amount IS
  'Observed cash amount in cents. Pit boss estimates are converted to cents on write.';

COMMENT ON COLUMN rating_slip.average_bet IS
  'Average bet in dollars. Stored as-is from user input (not cents).';
```

A migration MUST be created to add comments to all existing financial columns listed in the Storage Convention Map above.

---

## Consequences

### Positive

- **Eliminates ambiguity** — function names and DTO suffixes make the unit explicit at every call site
- **Prevents double-conversion** — service layer is the single boundary; components never see cents
- **Self-documenting schema** — SQL comments make the convention discoverable without reading application code
- **Reduces fragmentation** — 10+ `formatCurrency` implementations collapse to 2 shared functions
- **Catches bugs at review time** — `formatDollars(pit.fills_total_cents)` is an obvious mismatch; `formatCurrency(value)` is not

### Negative

- **Migration effort** — existing components must be updated to use the new function names
- **Grandfathered exceptions** — `rating_slip.average_bet` (dollars) and any pre-existing RPC that returns dollars require documentation but not schema changes
- **No compile-time enforcement** — branded types (`CentsAmount` / `DollarsAmount`) would provide stronger guarantees but are deferred as aspirational (see Future Work)

### Risks

- Existing `formatCurrency()` callers that pass dollars (not cents) will silently produce wrong results until migrated. The deprecation warning and naming convention mitigate this during the transition period.

---

## Implementation Plan

### Phase 1 — Shared Formatting Functions

1. Add `formatDollars()`, `formatCents()`, `formatDollarsDelta()`, `formatCentsDelta()` to `lib/format.ts`
2. Deprecate `formatCurrency()` and `formatCurrencyDelta()` with `@deprecated` JSDoc
3. Migrate shift dashboard v3 components (6 files) to use the correct function

### Phase 2 — SQL Column Comments

1. Create migration `YYYYMMDDHHMMSS_financial_column_comments.sql`
2. Add `COMMENT ON COLUMN` for all financial columns listed in Storage Convention Map
3. Resolve `pit_cash_observation.amount` unit — inspect write path, add comment

### Phase 3 — DTO Annotations

1. Add JSDoc `/** Amount in cents */` or `/** Amount in dollars */` to all financial DTO fields
2. Priority: `services/table-context/shift-metrics/dtos.ts`, `services/table-context/dtos.ts`, `services/player-financial/dtos.ts`, `services/visit/dtos.ts`

### Phase 4 — Component Migration (Incremental)

1. Replace remaining `formatCurrency()` calls across the codebase with `formatDollars()` or `formatCents()`
2. Remove `formatCurrency()` once all callers are migrated

### Future Work (Aspirational)

Branded types for compile-time unit enforcement:

```typescript
type Cents = number & { readonly __brand: 'cents' };
type Dollars = number & { readonly __brand: 'dollars' };
```

This makes `formatDollars(cents_value)` a type error. Requires the most refactoring and is deferred until the team has capacity.

---

## Compliance Checklist

| Rule | Enforcement |
|------|-------------|
| Cents storage for new columns | Code review + SQL COMMENT requirement |
| Service-layer conversion boundary | Code review + DTO naming convention |
| Named formatting functions | Lint: `formatCurrency` flagged as deprecated |
| DTO unit annotations | Code review (automated lint deferred) |
| SQL column comments | Migration review checklist |

---

## References

- `docs/issues/ISSUE-CENTS-TO-DOLLARS-STANDARDIZATION.md` — Full audit of all conversion touchpoints
- `docs/issues/ISSUE-SHIFT-DASHBOARD-DROP-DOUBLE-COUNT.md` — Double-count bug blocked by this ADR (naming ambiguity symptom)
- `lib/format.ts` — Current shared formatting functions
- `services/table-context/shift-metrics/dtos.ts` — Shift metrics DTOs (exemplar `_cents` naming)
- `services/mtl/dtos.ts` — MTL DTOs (exemplar `ISSUE-FB8EB717` annotations)
- Commit `0ac6321` — Partial remediation of cents-to-dollars bugs (2026-01-29)
