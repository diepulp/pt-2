# Transitional DTO Governance Caveat

The DTO catalog and DTO canonical standard remain directional authority, but they are not mechanically executable during active migration slices.

During transition, implementation specs may define temporary DTO bridge shapes that intentionally diverge from the canonical target in order to preserve behavior, avoid phase collapse, and prevent premature structural normalization.

When a PRD / EXEC-SPEC declares a DTO bridge shape, that bridge shape supersedes the catalog for the named fields and surfaces until the follow-up canonicalization slice lands.

Canonical references must therefore be read as target-state architecture, not literal implementation instructions, unless the relevant service has been explicitly marked canonicalized.

The missing distinction is:

- Canonical DTO = target-state contract
- Bridge DTO = temporary executable contract

**The bridge should be explicitly outlined:**

## Active Bridge DTO: Financial Telemetry Visit Surface Envelope

**Status:** `TRANSITIONAL`  
**Owning spec:** `PRD-072 / EXEC-072`  
**Supersedes:** Target-state DTO catalog for named fields only.

### In-Scope Fields

- RecentSessionDTO.total_buy_in
- RecentSessionDTO.total_cash_out
- RecentSessionDTO.net
- VisitLiveViewDTO.session_total_buy_in
- VisitLiveViewDTO.session_total_cash_out
- VisitLiveViewDTO.session_net

### Temporary Shape

```ts
type FinancialValueBridge = {
  value: number // existing dollar float, not canonical integer cents
  type: 'actual'
  source: string
  completeness: {
    status: 'complete' | 'unknown'
  }
}
```

### Bridge Rules

- Preserve current `/100` conversions.
- Preserve current dollar-float magnitude.
- Preserve `formatDollars(field.value)`.
- Do not enforce `financialValueSchema`.
- Do not canonicalize to cents.
- Do not create mapper refactors unless the owning `EXEC-SPEC` says so.


## Sunset Rule

A bridge DTO must name its retirement trigger.

For this bridge:

**Retired by:**

- Phase 1.2 Financial Data Canonicalization PRD

**Retirement actions:**

- remove `/100` conversions
- make `FinancialValue.value` integer cents
- apply `financialValueSchema`
- migrate UI render calls to `formatCents`
- update DTO catalog to reflect final canonical shape
 
That formulation is stronger because it prevents agents from treating every old doc as literal law while also not throwing away the canon.

## Governance Doctrine

During migration:

- The catalog describes the destination.
- The active `EXEC-SPEC` describes the road.
- The bridge DTO describes the temporary vehicle.
