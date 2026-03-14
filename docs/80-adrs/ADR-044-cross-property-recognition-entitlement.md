---
id: ADR-044
title: Cross-Property Player Recognition and Loyalty Entitlement
status: Accepted
date: 2026-03-13
owner: Platform/Auth + CasinoService + LoyaltyService
amends: ADR-023 (tenancy model — company-scoped reads), SEC-001 (policy matrix — new templates), SEC-002 (security model — entitlement boundary)
related: ADR-043 (Phase 1 foundation), ADR-024 (context derivation — INV-8 intact), ADR-030 (auth hardening), ADR-042 (player exclusion), ADR-018 (SECURITY DEFINER governance), ADR-015 (connection pooling)
triggered_by: PHASE-2-SCOPE-REALIGNMENT, PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION, Loyalty Entitlement Scope Inset, Pre-Decision Freeze Inset
---

# ADR-044: Cross-Property Player Recognition and Loyalty Entitlement

## Status

**Accepted** — architectural direction frozen for Phase 2 implementation; exclusion safety signal gated on `player-exclusion` branch merge.

## Context

Phase 1 (ADR-043, commit `e86e5eb`) established the company as a real, populated tenancy parent. Every casino has a non-null `company_id`. The RPC `set_rls_context_from_staff()` derives and sets `app.company_id` via SET LOCAL. No RLS policy consumes it — Phase 1 is inert plumbing.

Business requirement: staff at Casino B should be able to recognize a player enrolled at Casino A (same company), view the player's loyalty entitlement across company properties, receive safety signals about sister-property exclusions, activate the player locally, and redeem allowed entitlement through Casino B workflows.

The investigation and scope realignment established that this capability does NOT require multi-casino staff operations, tenant switching, or broad operational telemetry exposure. Staff stays single-casino-bound. The `app.company_id` session variable (Phase 1) is the only tenancy primitive needed.

## Decisions

### D1: Two-Tier Recognition + Entitlement Surface

Company-scoped data access uses two distinct mechanisms:

**Tier 1 — RLS Policy Broadening (2 tables):**
- `player_casino` — company-scoped SELECT (enrollment visibility)
- `player_loyalty` — company-scoped SELECT (entitlement projection: `current_balance`, `tier`)

**Tier 2 — SECURITY DEFINER Scalar Extraction (0 policy changes):**
- `visit` → `last_company_visit` (single timestamp)
- `player_exclusion` → `has_sister_exclusions` (boolean) + `max_exclusion_severity` (text)

**Rationale:** Minimize RLS blast radius. Only tables whose rows are enrollment/entitlement metadata (no operational telemetry) get policy broadening. Tables containing operational, compliance, or financial data are accessed server-side inside SECURITY DEFINER and return only computed scalars. No raw operational rows cross the property boundary.

**Recognition Data Surface Rule:**
> Company-scoped reads may surface identity, enrollment, and loyalty entitlement. Operational telemetry, financial records, and compliance records remain property-scoped.

**Entitlement Boundary Rule:**
> Loyalty entitlement (`player_loyalty`: balance + tier) crosses the company boundary. Loyalty accounting (`loyalty_ledger`: individual entries, campaign context, accrual rules) does not. The distinction is: **what the player has** vs. **how the player earned it**.

### D2: RLS Policy Pattern (Dual-Mode SELECT)

Both Tier 1 tables use the same dual-mode SELECT pattern:

```sql
CREATE POLICY {table}_select_company ON {table}
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      -- Path 1: Same casino (existing behavior, unchanged)
      casino_id = COALESCE(
        NULLIF(current_setting('app.casino_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
      )
      OR
      -- Path 2: Same company (NEW — cross-property visibility)
      (
        NULLIF(current_setting('app.company_id', true), '')::uuid IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM casino c
          WHERE c.id = {table}.casino_id
          AND c.company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
        )
      )
    )
  );
```

**Key properties:**
- Path 2 activates ONLY when `app.company_id` is non-null and non-empty (fail-closed)
- Single-casino staff see zero behavioral change (Path 1 matches as before)
- Write policies are UNCHANGED — casino-scoped enforcement preserved
- `app.company_id` is derived server-side (Phase 1, ADR-024 INV-8 intact)

**Policy allowlist CI gate:** Only `player_casino` and `player_loyalty` SELECT policies may reference `app.company_id`. Any other table → CI failure.

### D3: Dedicated Audited Activation RPC

**Decision:** Local activation uses a new dedicated SECURITY DEFINER RPC.

```sql
rpc_activate_player_locally(p_player_id uuid)
```

**Contract:**
1. Calls `set_rls_context_from_staff()` (context-first, ADR-024)
2. Validates player exists within caller's company boundary
3. Checks exclusion safety signal — enforces D5 severity policy
4. Creates `player_casino` row at caller's `app.casino_id` (idempotent — no-op if already enrolled)
5. Logs `local_activation` audit event with actor, player, casino, timestamp
6. Returns activation result + current exclusion status

**Rationale:** Local activation is a distinct business action with its own intent and audit meaning. A dedicated RPC captures intent, provides a single choke point for exclusion checks and idempotency, and avoids callers inventing their own activation semantics through direct inserts.

**Role gate:** `app.staff_role IN ('pit_boss', 'admin')`. Floor supervisors with enrollment authority only.

### D4: Recognition + Entitlement Summary RPC

**Decision:** A single SECURITY DEFINER RPC provides the full recognition + entitlement surface.

```sql
rpc_lookup_player_company(p_search_term text)
RETURNS TABLE (
  player_id              uuid,
  full_name              text,
  birth_date             date,
  enrolled_casinos       jsonb,      -- [{casino_id, casino_name, status, enrolled_at}]
  loyalty_entitlement    jsonb,      -- company-usable entitlement (hybrid: total + breakdown)
  active_locally         boolean,
  last_company_visit     timestamptz,
  has_sister_exclusions  boolean,
  max_exclusion_severity text
)
```

**Contract:**
1. Calls `set_rls_context_from_staff()` (context-first)
2. Searches `player` globally by name/search term
3. Reads `player_casino` via company-scoped RLS (Tier 1)
4. Reads `player_loyalty` via company-scoped RLS (Tier 1), projects `current_balance` + `tier` only
5. Reads `visit` inside SECURITY DEFINER — returns `MAX(started_at)` scalar only
6. Reads `player_exclusion` inside SECURITY DEFINER — returns boolean flag + severity only
7. Computes `loyalty_entitlement` as hybrid surface (D7): company total primary, per-property breakdown secondary

**No raw operational rows leave the function boundary.**

### D5: Severity-Based Exclusion Policy

**Decision:** Exclusion safety signals trigger severity-based escalation.

| `max_exclusion_severity` | Effect on Activation | Effect on Redemption |
|---|---|---|
| `hard_block` | Blocked | Blocked |
| `soft_alert` | Requires elevated-role override (pit_boss/admin) | Requires elevated-role override |
| `monitor` | Warn only; allow normal flow | Warn only; allow normal flow |
| `null` | No exclusion intervention | No exclusion intervention |

**Rationale:** A single universal policy is too blunt. "Warn only" is too weak for serious exclusions. "Always block" is too rigid for informational flags. Severity-based escalation preserves safety while keeping the workflow operationally usable.

This decision intentionally freezes an open product-policy question from the Phase 2 support artifacts (Pre-Decision Freeze Inset, D5) because activation and redemption are privileged server-side actions that cannot rely on client-only interpretation of the safety signal. The support direction required an exclusion safety signal; this ADR escalates to server-side enforcement because activation and redemption RPCs are the natural choke points.

### D6: Dedicated Atomic Local Redemption RPC

**Decision:** Local redemption uses a dedicated SECURITY DEFINER RPC that atomically debits company-visible entitlement and records a local event.

```sql
rpc_redeem_loyalty_locally(p_player_id uuid, p_amount integer, p_reason text)
```

**Contract:**
1. Calls `set_rls_context_from_staff()` (context-first)
2. Validates player is enrolled at caller's casino
3. Checks exclusion safety signal — enforces D5 severity policy
4. Atomically debits the **local** `player_loyalty` row (caller's `app.casino_id`) with balance guard:
   `UPDATE player_loyalty SET current_balance = current_balance - p_amount WHERE casino_id = v_casino_id AND current_balance >= p_amount`
   (returns error if insufficient local balance — no negative balances, no partial debits)
5. Creates local `loyalty_ledger` entry at caller's `app.casino_id` (casino-scoped write)
6. Logs `loyalty_redemption` audit event
7. Returns updated entitlement state (local + company total)

**Debit Allocation Model — Local-Row-Only:**

Redemption debits only the `player_loyalty` row for the caller's casino. The `portfolio_total` in the recognition RPC (D7) is a computed aggregate (SUM across property rows) that updates as a consequence of local debits and accruals. It is not a pooled redeemable balance.

This means redemption is bounded by the **local** balance, not the company total. If Casino B has 4,500 points and Casino A has 8,000, Casino B can redeem up to 4,500 — not the portfolio total of 12,500.

**Why local-row-only:** Cross-property balance pooling (debiting Casino A's row from Casino B) requires cross-casino writes, which the scope inset prohibits ("all mutations remain local"). A canonical company-level balance abstraction is a separate architectural effort and is deferred. The local-row-only model is the only option consistent with the single-casino write principle.

**UX consequence:** The recognition RPC's `redeemable_here` field must reflect the local balance, and the frontend must distinguish between "portfolio total" (awareness) and "redeemable at this property" (actionable). D7's JSON shape is updated accordingly.

**Accrual/Redemption Symmetry Rule:**
> Accrual and redemption both execute locally. Their economic effect updates the local `player_loyalty.current_balance` row. The company total (D7) updates as a computed consequence. Raw operational provenance remains property-scoped.

**Concurrency control:** The atomic `UPDATE ... WHERE current_balance >= p_amount` serves as an optimistic guard against the local row. Cross-casino races do not arise because each casino debits only its own row. No row-level lock needed.

### D7: Hybrid Redemption Surface

**Decision:** The user-visible loyalty surface presents a hybrid model.

**Primary:** One portfolio-wide total (sum of `player_loyalty.current_balance` across company properties). `portfolio_total` is a visibility aggregate across sister properties and is **not** itself a pooled redeemable balance. Redemption is bounded by `local_balance` (D6).

**Secondary:** Optional per-property breakdown (`[{casino_name, balance, tier}]`) for support context, portfolio awareness, and reconciliation.

**`loyalty_entitlement` JSON shape:**
```json
{
  "portfolio_total": 12500,
  "local_balance": 4500,
  "local_tier": "silver",
  "redeemable_here": 4500,
  "properties": [
    {"casino_id": "...", "casino_name": "Casino A", "balance": 8000, "tier": "gold"},
    {"casino_id": "...", "casino_name": "Casino B", "balance": 4500, "tier": "silver"}
  ]
}
```

**Key fields:**
- `portfolio_total` — portfolio awareness (computed SUM, not a pooled redeemable balance)
- `local_balance` / `local_tier` — entitlement at the caller's casino
- `redeemable_here` — the actionable number (equals `local_balance` under local-row-only debit model, D6)
- `properties` — secondary breakdown for support context and reconciliation

**Rationale:** Staff needs a fast answer to "how much value can this player use here?" (`redeemable_here`). The `portfolio_total` provides portfolio awareness without implying that the full amount is redeemable locally. Per-property breakdown is useful for support, reconciliation, and program understanding. The hybrid preserves both truths without creating an expectation gap.

**`preferences` excluded:** The `player_loyalty.preferences` JSON column is not included in the cross-property projection. Its contents are program metadata, not entitlement state. If ever needed cross-property, it must be separately reviewed.

## Amendments

### ADR-023: Multi-Tenancy Storage Model
- **Company-scoped reads formalized:** Company is a secondary tenancy boundary for SELECT on `player_casino` and `player_loyalty`. All other tables remain casino-scoped.
- **Pool model unchanged.**

### SEC-001: RLS Policy Matrix
- **New template: Dual-Mode SELECT** — company-scoped read path (Path 2) alongside existing casino path (Path 1).
- **Policy allowlist:** Only `player_casino` and `player_loyalty` may use the dual-mode template. All other tables require separate ADR approval.

### SEC-002: Casino-Scoped Security Model
- **Entitlement boundary added:** Loyalty entitlement (`player_loyalty`) crosses the company boundary. Loyalty accounting (`loyalty_ledger`) does not.
- **Scalar extraction pattern documented:** SECURITY DEFINER functions may read cross-company operational data server-side and return only computed signals.

## Consequences

### Positive
- Staff can recognize players across sister properties without casino context switching
- Company-usable loyalty entitlement visible for redemption decisions
- Exclusion safety signals close the gap where recognition without exclusion awareness creates risk
- Only 2 RLS policy changes (minimal blast radius)
- ADR-024 INV-8 remains intact (no client-supplied casino selection)
- Single-casino staff see zero behavioral change

### Negative
- 3 new SECURITY DEFINER RPCs require ADR-018 governance review (`rpc_lookup_player_company`, `rpc_activate_player_locally`, `rpc_redeem_loyalty_locally`)
- Company-scoped EXISTS subquery in RLS adds one JOIN per row evaluation (mitigated by `casino.company_id` index)
- Hybrid loyalty surface adds complexity to frontend (company total + property breakdown)
- `player_exclusion` branch dependency — safety signal unavailable until merge

### Risks
- **P0: Cross-company leakage** — Mitigated by fail-closed policy (Path 2 requires non-null `app.company_id`) + CI allowlist gate + shadow policy testing
- **P1: Redemption concurrency** — Mitigated by atomic balance guard. Revisit with row-level locking if 5+ property companies create contention.
- **P1: Scope creep to operational telemetry** — Mitigated by Recognition Data Surface Rule + CI allowlist gate
- **P2: Stale entitlement** — Mitigated by per-request reads (no caching across requests)

## Security Controls

See `SEC_NOTE.md` for full threat model (11 threats, 11 controls, 13 merge criteria).

Key controls:
- C1: Fail-closed company-scoped policy (EXISTS + NOT NULL guard)
- C2: Tier 2 scalar extraction (visit/exclusion stay untouched)
- C7: Atomic redemption with balance guard
- C11: Policy allowlist CI gate

## Phase Roadmap (Updated)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Company Foundation (ADR-043) | **DONE** (e86e5eb) |
| **Phase 2** | Cross-Property Recognition + Loyalty Entitlement (this ADR) | **DECIDED** |
| Phase 3 (if needed) | Multi-Casino Staff Operations | Future — separate ADR |
| Phase 4 (if needed) | Company-Scoped Operational Dashboards | Future — separate ADR |

## References

- Feature Boundary: `docs/20-architecture/specs/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION/FEATURE_BOUNDARY.md`
- Feature Brief: `docs/20-architecture/specs/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION/FEATURE_BRIEF.md`
- SEC Note: `docs/20-architecture/specs/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION/SEC_NOTE.md`
- Scope Realignment: `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/PHASE-2-SCOPE-REALIGNMENT.md`
- Surface Optimization: `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/PHASE-2-RECOGNITION-SURFACE-OPTIMIZATION.md`
- Pre-Decision Freeze: `docs/00-vision/DUAL-BOUNDARY-TENANCY/PHASE-2/adr044_predecision_freeze_inset.md`
- Investigation: `docs/00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`
- Operational Addendum: `docs/00-vision/DUAL-BOUNDARY-TENANCY/cross-property-player-sharing-operational-addendum.md`
- Scope Insets: `cross_property_player_recognition_scope_inset.md`, `cross_property_player_recognition_loyalty_entitlement_scope_inset.md`
