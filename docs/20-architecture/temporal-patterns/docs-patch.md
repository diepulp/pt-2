# Temporal Pattern Patch Guidance

## Verdict
- Don’t replace TEMP-001 or TEMP-002; patch both and let the new doc act as the enforcement layer.
- Preserve their canonical intent while upgrading the enforcement story so engineers feel a hard guardrail instead of a soft guideline.

## TEMP-001 (Gaming Day Specification)

### Strengths
- States the correct ownership model (CasinoService controls `casino_settings`).
- Documents canonical inputs (timezone + start time) and downstream consumption rules (derive via triggers/RPCs/DTO and never accept `gaming_day` as an input).
- Already identifies the “application-layer override” failure mode and forbids RPCs/services from accepting `gaming_day` directly.

### Gaps
- Reads like a spec, not a guardrail, so nothing converts the rule into CI/code-review gates.
- Never addresses the RSC/perf excuse that triggered the bypass: avoiding client waterfalls led teams to run compute in RSC and accidentally minted JS temporal authority.

## TEMP-002 (Temporal Authority Pattern)

### Strengths
- Reinforces “single source of truth” propagation via triggers/RPCs/DTOs and limits app-layer caches to display-only eventual consistency.
- Covers cache invalidation, update conflict handling, and operational hazards such as mid-day timezone flips.

### Gaps
- Still descriptive; it never bans common foot-guns (UTC slicing, `new Date()` arithmetic in business logic) or encodes them as CI/code-review gates.

## RPC Parameter Rule Consistency
- The remediation snippet calls `compute_gaming_day` with `p_casino_id` from server auth context.
- The new doc correctly says client-callable RPCs must not accept `casino_id`/`actor_id` (per the RLS-context pattern).
- Reconcile the two by treating `compute_gaming_day(...)` as an internal helper while public surfaces call `rpc_current_gaming_day()` that derives scope from `current_setting('app.casino_id')`/JWT claims.
- This keeps TEMP-001’s consumption rule intact: RPCs query `casino_settings` internally with zero overrides.

## Standardization That Won’t Rot

### 1. Patch TEMP-001 and TEMP-002 With Enforcement Hooks
- Append an “Enforcement Addendum” or similar guardrail section to each doc.
- TEMP-001: add a **Banned Patterns** callout that forbids `toISOString().slice(0, 10)` and similar UTC slicing inside query paths; tie it to CI/lint gates (FM-4 gets explicit teeth).
- TEMP-002: add an **RSC/Perf Safe Path** that explains how to avoid client waterfalls without inventing JS time logic—the root cause in the issue doc.

### 2. Promote the New Doc as the Operational Standard
- Rename and position it as the enforcement checklist engineers must satisfy before shipping work that touches:
  - `gaming_day` filters
  - Date range queries (weeks/months)
  - “Casino local” display logic
  - Dashboard rollups keyed by `gaming_day`

## Bottom Line
- TEMP-001 and TEMP-002 are good and should remain canonical.
- The generated doc augments them as an enforcement/implementation standard; it should not replace the core spec/pattern docs.
