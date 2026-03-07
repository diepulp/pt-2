# INV-SEC007: Delegation Parameter Spoofability Audit

**Filed**: 2026-03-06
**Severity**: P1 (broader than original gap doc scope)
**Source**: 5-agent parallel investigation of GAP-SEC007-D3D4-UNBLOCK-CASINO-ID-FROM-DELEGATION.md
**Status**: RESOLVED (ADR-040 + EXEC-ADR040, 2026-03-07)
**Supersedes**: Findings extend GAP-SEC007-D3D4 with full-stack spoofability analysis

## Executive Summary

A 5-domain-expert investigation was deployed to validate the claims in GAP-SEC007-D3D4 and determine whether the 4 remaining RPCs represent a simple decoupling effort or a broader security gap. The investigation found **both**:

1. **Decoupling is valid** -- `p_casino_id` removal IS independent from delegation params and should proceed immediately.
2. **A broader P1 security gap exists** -- delegation params (`p_awarded_by_staff_id`, `p_issued_by_staff_id`) are spoofable end-to-end from HTTP request body through RPC to database row. SEC-003 is blind to 2 of 3 delegation param variants. The OQ-1/OQ-2 "business decision" framing is incorrect -- the code already answers these questions.

## Investigation Team

| Agent | Focus | Key Finding |
|-------|-------|-------------|
| RLS Expert | RPC function body audit, SEC-003 gate analysis, cross-casino attack vectors | `rpc_manual_credit` and `rpc_redeem` accept arbitrary staff UUIDs with zero validation |
| Lead Architect | ADR-024 INV-8 scope, derivation vs delegation, SRM analysis | Delegation params violate the SPIRIT of INV-8; OQ-1/OQ-2 are already answered by code |
| Devil's Advocate | Stress-testing gap doc claims, finding false assumptions | Gap doc understates risk; loyalty route handlers pass client input without override |
| QA Specialist | Test coverage gaps, security gate blind spots | Zero integration tests for `rpc_create_financial_adjustment`; no cross-casino delegation tests anywhere |
| Backend Service | Full data-flow trace UI to DB, broader spoofability scan | Financial route overrides from context (safe); loyalty routes do not (spoofable) |

## Findings

### F1 [P1]: Loyalty RPCs Accept Arbitrary Staff Identity Without Validation

**RPCs affected**: `rpc_manual_credit`, `rpc_redeem`
**Params**: `p_awarded_by_staff_id`, `p_issued_by_staff_id`

These delegation params are written directly to `loyalty_ledger.staff_id` and audit metadata JSON without any validation against the derived `app.actor_id`. A caller with pit_boss/admin role can attribute a manual credit or redemption to any staff member -- including staff from a different casino (the FK constraint checks existence only, not casino scope).

**Evidence**:
- `supabase/migrations/20251229154020_adr024_loyalty_rpcs.sql` line 591: `p_awarded_by_staff_id` written to `loyalty_ledger.staff_id`
- Same file line 436: `p_issued_by_staff_id` written to `loyalty_ledger.staff_id`
- Same file line 451-452: `p_issued_by_staff_id` written to `metadata.overdraw.approved_by_staff_id`

**Contrast with financial RPC** (`supabase/migrations/20260217153443_prd033_rpc_financial_txn_external_ref.sql` lines 57-58):
```sql
IF v_actor_id IS NULL OR v_actor_id <> p_created_by_staff_id THEN
    RAISE EXCEPTION 'actor_id mismatch: context is % but caller provided %';
END IF;
```
The financial RPC validates the delegation param against context. The loyalty RPCs do not.

**Agent consensus**: 5/5

---

### F2 [P1]: SEC-003 Check 4 Blind Spot

**File**: `supabase/tests/security/03_identity_param_check.sql` line 108

Check 4 only scans for `p_created_by_staff_id`:
```sql
AND 'p_created_by_staff_id' = ANY(p.proargnames)
```

Missing from scan:
- `p_awarded_by_staff_id` (used by `rpc_manual_credit`)
- `p_issued_by_staff_id` (used by `rpc_redeem`)

The gap doc claims delegation params are "already tracked by SEC-003 check 4." This is only 1/3 true.

**Agent consensus**: 3/3 (RLS, DA, QA)

---

### F3 [P1]: Full-Stack Spoofability Chain in Loyalty Routes

The delegation params are spoofable at EVERY layer of the stack:

```
Layer 1 - Client:       Can forge request body           -- OPEN
Layer 2 - Route handler: Passes body through directly     -- NO OVERRIDE
Layer 3 - Service layer: Forwards param verbatim          -- NO VALIDATION
Layer 4 - RPC:           No actor_id comparison           -- NO CHECK
Layer 5 - Database:      FK checks existence, not casino  -- NO SCOPE CHECK
```

**Secured pattern** (financial transactions, `app/api/v1/financial-transactions/route.ts` lines 143-144):
```typescript
casino_id: mwCtx.rlsContext!.casinoId,        // DERIVED
created_by_staff_id: mwCtx.rlsContext!.actorId // DERIVED
```

**Unsecured pattern** (loyalty, `app/api/v1/loyalty/redeem/route.ts` lines 42-49):
```typescript
const input = redeemInputSchema.parse(body);   // FROM REQUEST BODY
const data = await service.redeem(input);       // PASSED DIRECTLY
```

**Agent consensus**: 2/2 (DA, Backend)

---

### F4 [P1]: Cross-Casino Staff ID Injection

A staff member at Casino A can call `rpc_manual_credit` or `rpc_redeem` with `p_awarded_by_staff_id` / `p_issued_by_staff_id` set to a UUID belonging to a staff member at Casino B. The `loyalty_ledger.staff_id` foreign key references `staff(id)` -- it validates existence but not casino scope. The resulting ledger row has `casino_id` correctly scoped to Casino A but `staff_id` pointing to a Casino B employee.

**Impact**: Audit trail poisoning across tenant boundaries. Not a data access breach (casino_id scoping prevents data leakage), but a data integrity and compliance violation.

**Agent consensus**: 1/1 (RLS -- unique finding)

---

### F5 [P2]: OQ-1/OQ-2 Are Already Answered

The gap doc and EXEC-043 defer D3/D4 pending "business decisions" about delegation params. The code evidence shows no decision is needed:

| Question | Evidence | Answer |
|----------|----------|--------|
| OQ-1: Should `rpc_create_financial_txn` keep `p_created_by_staff_id`? | Route handler already overrides from `rlsContext.actorId` (line 144). RPC validates match (lines 57-58). Param is redundant. | **Remove** -- derive from `current_setting('app.actor_id')` |
| OQ-2: Should loyalty RPCs keep delegation params? | No delegation UI exists. No delegation authorization rules exist. P1-6 already fixed the identical pattern in `rpc_issue_mid_session_reward` by deriving from context (migration `20260302230030` line 243). | **Remove** -- derive from `current_setting('app.actor_id')` |

**Precedent**: `rpc_issue_mid_session_reward` P1-6 fix (`20260302230030_fix_sec007_p1_rpc_toctou_context.sql` lines 180-183):
```sql
v_context_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
-- ...
v_context_actor_id,  -- SEC-007 P1-6: was p_staff_id (spoofable)
```

The sibling RPCs `rpc_manual_credit` and `rpc_redeem` serve the same bounded context, write to the same table, and have the same spoofability profile. The derive pattern is established.

**Agent consensus**: 3/3 (Architect, DA, Backend)

---

### F6 [P2]: `rpc_create_financial_adjustment` Blocked for No Reason

Confirmed by all investigating agents: this RPC has zero delegation params. It already uses `v_actor_id` (derived from context) for the `created_by_staff_id` column. The only remaining issue is `p_casino_id`, which is trivially removable using the D1/D2 pattern.

**File**: `supabase/migrations/20260219002247_enable_adjustment_telemetry.sql` line 183

**Agent consensus**: 3/3 (RLS, DA, QA)

---

### F7 [P2]: Overdraw Metadata Mixes Trust Levels

In `rpc_redeem`, the overdraw authorization metadata mixes spoofable and derived fields:

```sql
'overdraw', jsonb_build_object(
    'allowed', true,
    'approved_by_staff_id', p_issued_by_staff_id,  -- SPOOFABLE (user param)
    'approved_by_role', v_caller_role,              -- DERIVED (secure)
    'note', p_note
)
```

A pit_boss could attribute overdraw approval to a different pit_boss. In a regulated casino environment, overdraw approval attribution is audit-critical.

**File**: `supabase/migrations/20251229154020_adr024_loyalty_rpcs.sql` lines 448-455

---

### F8 [P2]: Zero Test Coverage for `rpc_create_financial_adjustment`

No test file anywhere in the codebase calls `rpc_create_financial_adjustment`. Zero integration tests, zero unit tests, zero security tests. This is the only RPC among the 4 with complete test absence.

**Agent consensus**: 1/1 (QA)

---

### F9 [P3]: `rpc_create_financial_txn` Delegation Param Is Redundant But Safe

The param `p_created_by_staff_id` is validated against `app.actor_id` at the RPC level AND overridden from server context at the route handler level. It cannot be spoofed. Removing it is ADR-024 polish, not a security fix.

---

## Broader Scan Results

### Other Identity Params in rpc_* Functions

The backend agent identified additional delegation-style params in chip custody RPCs:

| RPC | Param | Assessment |
|-----|-------|------------|
| `rpc_request_table_fill` | `p_delivered_by` | Legitimate third-party attribution (different person delivers vs records) |
| `rpc_request_table_credit` | `p_sent_by` | Legitimate third-party attribution |
| `rpc_log_table_drop` | `p_witnessed_by` | Legitimate witness attribution |
| `rpc_log_table_inventory_snapshot` | `p_verified_by` | Legitimate verifier attribution |

These chip custody params differ from the loyalty delegation params: they model real-world scenarios where the recording staff member is intentionally different from the attributed party. They are not identity spoofing -- they are by-design multi-party attribution. However, they lack same-casino validation and should be tracked for future hardening.

### No Additional `p_casino_id` or `p_actor_id` Violations Found

SEC-003 Check 1 (p_actor_id) and Check 2 (p_casino_id) cover all current rpc_* functions. No new violations outside the 4 known RPCs.

---

## Recommended Action Plan

### Phase 1: Immediate -- Decouple and Unblock (no business decision needed)

| Action | Effort | Unblocks |
|--------|--------|----------|
| Remove `p_casino_id` from all 4 remaining RPCs (D1/D2 pattern) | Medium | SEC-003 zero-tolerance enforcement |
| Widen SEC-003 Check 4 to scan `p_awarded_by_staff_id`, `p_issued_by_staff_id` | Low | Gate visibility |
| Remove `rpc_create_financial_adjustment` from OQ-1 scope (zero blockers) | Trivial | Immediate shipment |

### Phase 2: Resolve Delegation Params (OQ-1/OQ-2 answered as "derive")

| Action | Effort | Rationale |
|--------|--------|-----------|
| Replace `p_awarded_by_staff_id` in `rpc_manual_credit` with `current_setting('app.actor_id')` | Medium | Matches P1-6 precedent for `rpc_issue_mid_session_reward` |
| Replace `p_issued_by_staff_id` in `rpc_redeem` with `current_setting('app.actor_id')` | Medium | Same precedent |
| Replace `p_created_by_staff_id` in `rpc_create_financial_txn` with `v_actor_id` | Medium | Already validated as redundant |

### Phase 3: Defense in Depth

| Action | Effort | Layer |
|--------|--------|-------|
| Fix loyalty route handlers to override delegation params from `mwCtx.rlsContext!.actorId` | Low (1 line per route) | Transport |
| Add integration tests: cross-casino staff_id injection, actor_id mismatch, role-gate enforcement | Medium | Test |
| Add `rpc_create_financial_adjustment` test coverage (currently zero) | Medium | Test |

### Future: If Delegation Is Ever Needed

Implement as a proper feature with:
- Dual-attribution record (both `actor_id` as "who performed" and `delegated_to` as "on behalf of")
- Same-casino validation on the delegatee (`staff.casino_id = app.casino_id`)
- Authorization rules (caller must have delegation permission)
- Dedicated ADR documenting the INV-8 exception
- UI for selecting the delegatee

---

## ADR-024 INV-8 Scope Clarification

This investigation surfaces an ambiguity in INV-8:

> "No client-callable RPC may accept `casino_id`/`actor_id` as user input (ops-only exceptions allowed)"

**Letter**: Only `casino_id` and `actor_id` are named. Delegation params like `p_awarded_by_staff_id` are not literally `actor_id`.

**Spirit**: INV-8 exists to prevent identity spoofing. Delegation params ARE identity inputs -- they assert "staff member X performed this action." A caller supplying `p_awarded_by_staff_id` is making an unverified identity claim.

**Recommendation**: Amend INV-8 to read:

> "No client-callable RPC may accept `casino_id`, `actor_id`, or any staff identity attribution parameter as user input unless validated against derived context or documented as intentional multi-party attribution (e.g., chip custody witness fields)."

---

## Gap Doc Update Required

GAP-SEC007-D3D4 should be amended with:
1. The decoupling recommendation (Option A) remains valid
2. OQ-1 resolved: remove `p_created_by_staff_id` (redundant, already validated)
3. OQ-2 resolved: remove `p_awarded_by_staff_id` and `p_issued_by_staff_id` (no delegation feature exists, P1-6 precedent)
4. SEC-003 Check 4 blind spot documented
5. Cross-reference to this investigation document

---

## References

| Document | Path |
|----------|------|
| Original gap doc | `docs/issues/gaps/sec-007/GAP-SEC007-D3D4-UNBLOCK-CASINO-ID-FROM-DELEGATION.md` |
| EXEC-043 spec | `docs/21-exec-spec/PRD-043/EXEC-043-sec007-remaining-rpc-remediation.md` |
| ADR-024 | `docs/80-adrs/ADR-024_DECISIONS.md` |
| SEC-001 RLS policy matrix | `docs/30-security/SEC-001-rls-policy-matrix.md` |
| SEC-003 identity gate | `supabase/tests/security/03_identity_param_check.sql` |
| P1-6 precedent migration | `supabase/migrations/20260302230030_fix_sec007_p1_rpc_toctou_context.sql` |
| Loyalty RPC definitions | `supabase/migrations/20251229154020_adr024_loyalty_rpcs.sql` |
| Financial RPC definition | `supabase/migrations/20260217153443_prd033_rpc_financial_txn_external_ref.sql` |
| Financial adjustment RPC | `supabase/migrations/20260219002247_enable_adjustment_telemetry.sql` |
| Financial route handler (secured) | `app/api/v1/financial-transactions/route.ts` |
| Loyalty redeem route (unsecured) | `app/api/v1/loyalty/redeem/route.ts` |
| Loyalty manual-credit route (unsecured) | `app/api/v1/loyalty/manual-credit/route.ts` |
| Loyalty service layer | `services/loyalty/crud.ts` |
| Loyalty DTOs | `services/loyalty/dtos.ts` |
| Loyalty schemas | `services/loyalty/schemas.ts` |
