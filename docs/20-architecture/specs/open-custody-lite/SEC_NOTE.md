# SEC Note: OPEN Table Custody Gate — Pilot Lite

**Feature:** open-custody-lite
**Date:** 2026-03-26
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Opening attestation record (`table_opening_attestation`) | Operational / Audit | Custody chain integrity — proves incoming pit boss verified the handoff. Tampering or deletion breaks shift accountability. |
| Predecessor close total (`predecessor_close_total_cents`) | Financial | Denormalized financial figure. Mismatch between denormalized and source value would allow falsified custody chains. |
| Actor attribution (`attested_by`, `activated_by_staff_id`) | Audit | Non-repudiation — identifies who opened and attested each table. Spoofing would undermine shift accountability. |
| Consumption linkage (`consumed_by_session_id`) | Operational | Proves which opening consumed which closing snapshot. Double-consumption forks the custody chain — one branch is fabricated. |
| Opening tray total (`opening_total_cents`) | Financial | Incoming tray value. Falsification would mask variance between shifts. |
| Dealer participation (`dealer_confirmed`) | Operational / Compliance | FIB §F: "Dealer participation is recorded on every opening attestation — MVP captures this as pit-boss-entered manual confirmation." The column is required, not nullable. `dealer_confirmed` is the pilot-lite representation of a required dealer participation field — it satisfies the current contract as a pit-boss-entered confirmation, not a separate dealer-side action. This is NOT a softening to optional dealer involvement. |
| Provenance source (`provenance_source`) | Operational | Classifies whether the opening chains from a predecessor close snapshot or bootstraps from par. Must be derived server-side from predecessor lookup state — client must not be able to select provenance. |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino attestation leakage | High | Low | P1 |
| T2: Attestation actor spoofing | High | Low | P1 |
| T3: Unauthorized OPEN→ACTIVE transition | High | Low | P1 |
| T4: Predecessor total falsification (denorm drift) | Medium | Low | P2 |
| T5: Double-consumption of closing snapshot | High | Low | P1 |
| T6: Orphan-OPEN used to bypass custody gate | Medium | Medium | P2 |
| T7: Direct INSERT to attestation table bypassing RPC | High | Low | P1 |
| T8: Provenance source abuse (false bootstrap) | Medium | Low | P2 |

### Threat Details

**T1: Cross-casino attestation leakage**
- **Description:** Staff from Casino A views or creates attestation records for Casino B tables
- **Attack vector:** Manipulate or omit casino_id in request
- **Impact:** Custody chain corruption across tenants; regulatory violation

**T2: Attestation actor spoofing**
- **Description:** Staff forges `attested_by` to attribute attestation to a different pit boss
- **Attack vector:** Pass different staff_id in the activate RPC payload
- **Impact:** Non-repudiation failure — no proof of who actually verified the handoff

**T3: Unauthorized OPEN→ACTIVE transition**
- **Description:** Dealer or non-authorized role activates a table, bypassing the custody gate
- **Attack vector:** Call `rpc_activate_table_session` with a dealer JWT
- **Impact:** Table activated without pit boss authority; custody chain has wrong actor class

**T4: Predecessor total falsification**
- **Description:** Denormalized `predecessor_close_total_cents` on attestation drifts from actual closing snapshot `total_cents`
- **Attack vector:** Race condition or direct UPDATE between open and activate steps
- **Impact:** Pit boss sees falsified prior close total, undermining visual comparison

**T5: Double-consumption of closing snapshot**
- **Description:** Same closing snapshot consumed by two different opening sessions
- **Attack vector:** Concurrent open-activate for the same table, or manual data correction without clearing consumption
- **Impact:** Two sessions claim custody from the same close — chain forks, one branch is fabricated. This is not a noisy-but-tolerable condition; it is semantic corruption of the custody chain. If it happens, one of the two successor sessions has a fabricated predecessor relationship.

**T6: Orphan-OPEN used to bypass custody gate**
- **Description:** A session reaches ACTIVE without a valid attestation record — via a future RPC, a code path that doesn't check for attestation, or a direct UPDATE.
- **Attack vector:** Direct UPDATE on `table_session.status` bypassing RPC, or a future session-status-changing RPC that transitions to ACTIVE without verifying the attestation invariant
- **Impact:** Table reaches ACTIVE without custody attestation — the gate this feature exists to enforce

**T7: Direct INSERT to attestation table**
- **Description:** Authenticated user inserts attestation rows directly via PostgREST without going through the SECURITY DEFINER RPC
- **Attack vector:** POST to `/rest/v1/table_opening_attestation` with fabricated data
- **Impact:** Attestation record exists without proper validation (dealer confirmation, note rules, predecessor linkage)

**T8: Provenance source abuse (false bootstrap)**
- **Description:** Implementation or future RPC allows the client to select `provenance_source = 'par_bootstrap'` even when a valid predecessor close snapshot exists, bypassing predecessor continuity
- **Attack vector:** Client-selectable provenance parameter, or a code path that skips predecessor lookup
- **Impact:** Custody chain silently breaks — system records "no predecessor" when one existed. Overuse of bootstrap degrades chain coverage without triggering variance warnings.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding | Pattern C hybrid on `table_opening_attestation`: `casino_id = COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)` |
| T2 | ADR-024 authoritative context | `attested_by` set from `current_setting('app.actor_id')` inside SECURITY DEFINER RPC — not from client parameter |
| T3 | Role gate in RPC | `rpc_activate_table_session` checks `app.staff_role IN ('pit_boss', 'admin')` — dealers rejected |
| T4 | Atomic denormalization | `predecessor_close_total_cents` read from `table_inventory_snapshot.total_cents` inside the same transaction as attestation INSERT — no window for drift |
| T5 | Guarded single-write consumption | `UPDATE ... WHERE consumed_by_session_id IS NULL` — RPC rejects if already consumed (zero rows affected → raise exception). The predecessor snapshot row carries exactly one nullable `consumed_by_session_id` column; once set, the guarded UPDATE cannot overwrite it. See C5. |
| T6 | Attestation-existence invariant | Any code path that transitions `table_session.status` to `'ACTIVE'` MUST verify that a valid `table_opening_attestation` record exists for the session. This is not "this RPC only" — it is a system invariant. `rpc_activate_table_session` enforces it by creating the attestation atomically. Any future RPC that can reach ACTIVE must include the same check. See C6. |
| T7 | RLS INSERT denial + REVOKE | `table_opening_attestation`: DENY INSERT to `authenticated` via RLS. INSERT happens inside SECURITY DEFINER RPC only. REVOKE INSERT from `authenticated`, `anon`. |
| T8 | Server-derived provenance | `provenance_source` is derived inside `rpc_activate_table_session` from the predecessor lookup state on the OPEN session — `predecessor_session_id IS NULL` → `'par_bootstrap'`, else `'predecessor'`. No client parameter for provenance. See C7. |

### Control Details

**C1: Casino-scoped RLS on `table_opening_attestation`**
- **Type:** Preventive
- **Location:** RLS policy on new table
- **Enforcement:** Database
- **Pattern:** Pattern C hybrid (ADR-015) — `casino_id = COALESCE(current_setting('app.casino_id', true)::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` with `auth.uid() IS NOT NULL`
- **Tested by:** RLS integration test (attestation cross-casino isolation)

**C2: Authoritative actor binding (ADR-024)**
- **Type:** Preventive
- **Location:** `rpc_activate_table_session` — SECURITY DEFINER
- **Enforcement:** Database (RPC internal logic)
- **Detail:** `attested_by` and `activated_by_staff_id` set from `current_setting('app.actor_id')` after `set_rls_context_from_staff()`. Category A identity provenance per ADR-040.
- **Tested by:** RPC integration test (verify actor matches JWT, not payload)

**C3: Role gate**
- **Type:** Preventive
- **Location:** `rpc_activate_table_session` — role check
- **Enforcement:** Database (RPC internal logic)
- **Detail:** `v_role NOT IN ('pit_boss', 'admin') → RAISE 'forbidden'`
- **Tested by:** RPC integration test (dealer JWT → rejected)

**C4: RPC-only writes to attestation table**
- **Type:** Preventive
- **Location:** RLS + REVOKE on `table_opening_attestation`
- **Enforcement:** Database
- **Detail:** RLS denies INSERT/UPDATE/DELETE to `authenticated`. Writes happen inside SECURITY DEFINER RPC only. REVOKE INSERT, UPDATE, DELETE FROM `authenticated`, `anon`, `PUBLIC`.
- **Tested by:** RLS integration test (direct INSERT → denied)

**C5: Guarded single-write consumption (T5 hardening)**
- **Type:** Preventive
- **Location:** `rpc_activate_table_session` — SECURITY DEFINER
- **Enforcement:** RPC logic (guarded UPDATE)
- **Detail:** The predecessor close snapshot row carries exactly one nullable `consumed_by_session_id` column. The activate RPC uses `UPDATE table_inventory_snapshot SET consumed_by_session_id = ?, consumed_at = now() WHERE id = ? AND consumed_by_session_id IS NULL`. If the snapshot is already consumed (column not NULL), the UPDATE affects zero rows. The RPC detects this and raises an exception — no silent chain fork.
- **Rationale:** The earlier draft treated double-consumption as "warn, not block." This was tolerance masquerading as mitigation. A forked custody chain is semantic corruption, not noise. The invariant lives on the predecessor row itself (single nullable column, guarded write), not on a consumer-side index. A partial UNIQUE on `consumed_by_session_id` would protect the wrong direction (preventing one session from consuming two snapshots, which is already structurally impossible since the RPC targets one specific predecessor). The existing FOR UPDATE lock on session open prevents the most likely concurrent-open scenario; the guarded UPDATE provides defense-in-depth.
- **Tested by:** Integration test (second activation targeting same predecessor snapshot → zero rows affected → exception raised)

**C6: Attestation-existence invariant (T6 hardening)**
- **Type:** Preventive
- **Location:** System invariant — all status-transition RPCs
- **Enforcement:** Database (RPC internal logic) + code review discipline
- **Detail:** `rpc_activate_table_session` creates the attestation and transitions OPEN→ACTIVE atomically in the same transaction. The invariant is: `table_session.status = 'ACTIVE' → EXISTS (SELECT 1 FROM table_opening_attestation WHERE session_id = table_session.id)`. Any future RPC or migration that can set `status = 'ACTIVE'` must verify this invariant or be flagged as a security regression. For pilot, this is RPC-enforced. For full FIB, consider a database CHECK or trigger to make the invariant structural.
- **Tested by:** Integration test (attempt ACTIVE without attestation → rejected). Code review gate for any new session-status RPC.

**C7: Server-derived provenance (T8 hardening)**
- **Type:** Preventive
- **Location:** `rpc_activate_table_session` — SECURITY DEFINER
- **Enforcement:** Database (RPC internal logic)
- **Detail:** `provenance_source` is not a client parameter. The RPC reads `predecessor_session_id` from the OPEN session (set during `rpc_open_table_session` from server-side predecessor lookup) and derives: `predecessor_session_id IS NULL → 'par_bootstrap'`, else `'predecessor'`. Client cannot override.
- **Tested by:** Integration test (verify provenance matches predecessor state, not client input)

---

## Service-Role Access Policy

`service_role` bypasses RLS by design (Supabase architecture). This means `service_role` can INSERT, UPDATE, and DELETE rows in `table_opening_attestation` and mutate `table_session.status` directly, circumventing all RPC-level controls (C2–C7).

**Pilot-lite posture:** This is an **accepted operational exception**, not pseudo-immutability. The SEC note does not claim the attestation table is immutable — it claims that `authenticated` users cannot mutate it outside RPCs. `service_role` mutation is restricted by operational policy:

- `service_role` credentials are not available to application code at runtime (Supabase server-side only)
- `service_role` use is limited to migrations, seed scripts, and emergency operational intervention
- Any `service_role` mutation of attestation or session-status rows in production should be logged in `audit_log` with justification

**Full FIB escalation:** If `service_role` mutation of attestation records is observed outside authorized maintenance, add a BEFORE UPDATE trigger on `table_opening_attestation` that raises an exception unless `current_setting('app.maintenance_mode', true) = 'true'`.

---

## Deferred Risks (Explicitly Accepted for Pilot Lite)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Close snapshot sealing (`is_sealed`) | Application convention sufficient for pilot. No demonstrated pilot failure from absence of database-enforced immutability. | Full FIB: if close snapshots are modified after finalization |
| Attestation record immutability trigger | Pilot relies on RPC-only write path for `authenticated` users and operational policy for `service_role`. No BEFORE UPDATE trigger on `table_opening_attestation`. | Full FIB, or if `service_role` mutation of attestation records is observed outside authorized maintenance |
| Orphan-OPEN cleanup automation | Manual cancellation sufficient for pilot. No automated timeout or shift-end sweeper. | If orphan-OPEN accumulation is observed in pilot telemetry |
| Attestation-existence as structural invariant | Pilot enforces via RPC logic. No database CHECK or trigger ensures `status='ACTIVE' → attestation EXISTS`. | Full FIB, or if a new session-status RPC is added that can reach ACTIVE |

Note: Double-consumption was previously listed here as a deferred risk with "warn, not block" tolerance. It has been **promoted to a hard control (C5)** — the RPC now rejects double-consumption via guarded single-write UPDATE on the predecessor snapshot row. A forked custody chain is semantic corruption, not an acceptable pilot tolerance.

---

## Dealer Participation Contract

FIB §F: "Dealer participation is recorded on every opening attestation — MVP captures this as pit-boss-entered manual confirmation, not a separate dealer-side action. Column is required, not nullable."

**Pilot-lite representation:** `dealer_confirmed BOOLEAN NOT NULL` with `CHECK (dealer_confirmed = true)` on `table_opening_attestation`. This is the minimum viable expression of the dealer participation requirement:
- The pit boss confirms a dealer is physically present — the system records this as a boolean attestation
- This is NOT optional dealer involvement — the column is required and must be true
- This is NOT a downgrade from the FIB requirement — it IS the FIB requirement for pilot-lite
- Full FIB may promote this to a dealer-side authentication step; pilot-lite captures it as pit-boss-entered confirmation per FIB §H rejection of dealer attestation promotion

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `opening_total_cents` | Plaintext integer | Financial operational data, not PII. Required for display and comparison. |
| `predecessor_close_total_cents` | Plaintext integer (denormalized) | Same as source — denormalized for read-path performance. Authoritative source remains `table_inventory_snapshot.total_cents`. |
| `attested_by` | UUID FK→staff | Staff identifier, not PII itself. Audit provenance. |
| `note` | Plaintext text | Operator-entered free text. May contain operational details. Not PII. |
| `dealer_confirmed` | Boolean NOT NULL, CHECK true | Required dealer participation flag. Not sensitive content. |
| `provenance_source` | Text, server-derived | Classification label derived from predecessor lookup. Not client-selectable. Not sensitive. |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `table_opening_attestation` | authenticated (same casino) | DENIED (RPC only) | DENIED (RPC only) | DENIED |
| `table_session` (existing) | authenticated (same casino) | DENIED (RPC only) | DENIED (RPC only) | DENIED |
| `table_inventory_snapshot` (existing) | authenticated (same casino) | DENIED (RPC only) | DENIED (RPC only) | DENIED |

**`service_role` note:** `service_role` bypasses all RLS policies. See Service-Role Access Policy section above for operational constraints.

---

## Validation Gate

- [x] All assets classified (7 assets including dealer participation and provenance source)
- [x] All threats have controls or explicit deferral (8 threats, 8 controls, 4 deferred risks)
- [x] Sensitive fields have storage justification
- [x] RLS covers all CRUD operations (INSERT/UPDATE/DELETE denied to authenticated; writes via SECURITY DEFINER RPC only)
- [x] No plaintext storage of secrets (no secrets in this feature — operational/financial data only)
- [x] Actor binding prevents audit spoofing (ADR-024 `app.actor_id`, Category A per ADR-040)
- [x] Role gate prevents unauthorized activation (pit_boss/admin only)
- [x] Double-consumption blocked at database level (UNIQUE constraint, not just warn)
- [x] Attestation-existence invariant documented as system-wide requirement
- [x] Provenance source is server-derived, not client-selectable
- [x] Dealer participation contract explicitly satisfies FIB §F, not softened
- [x] Service-role access acknowledged as operational exception with policy bounds
