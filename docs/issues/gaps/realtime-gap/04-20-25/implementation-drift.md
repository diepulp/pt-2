Understood. Pure posture audit, no prescriptions.

---

# PT-2 Realtime System — Comprehensive Posture Audit (2026-04-20)

## 1. Canonical Governance Stack

The body of rules that collectively govern realtime behavior:

| Doc                                              | Date       | Status      | Governs                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-004 Real-Time Strategy**                   | 2025-10-25 | Accepted    | Channel architecture: domain-scoped namespacing (`rt.<domain>.<scope>`), ref-counted channel registry, micro-batched invalidation scheduler (50ms debounce), hybrid cache strategy (`setQueryData` vs `invalidateQueries`), auth refresh integration (`refreshAuth(token)` on registry), reconnection/resilience, memory leak prevention |
| **INT-002 Event Catalog**                        | —          | Accepted    | 21 typed events with payload schemas, channel naming conventions, cache invalidation mappings. Source of truth for *what* should propagate.                                                                                                                                                                                              |
| **UX_DATA_FETCHING_PATTERNS**                    | —          | Governance  | SWR tier table, optimistic update policy, **"realtime updates must reconcile through TanStack Query cache"** rule                                                                                                                                                                                                                        |
| **HOOKS_STANDARD**                               | —          | Governance  | Hook naming, query-key factories, React Query defaults. Does **not** address realtime-hook specifics.                                                                                                                                                                                                                                    |
| **ADR-050 Financial Surface Freshness Contract** | 2026-04-19 | Accepted    | D1–D4 declarations (authoritative source, event source, consumer surface, reaction model + SLA) and enforcement rules E1 (factory-only invalidation), E2 (window correctness), E3 (publication membership). **Silent on socket authentication.**                                                                                         |
| **REPLICATION-CHECKLIST-ADR-050 §2**             | 2026-04-19 | Derived     | Canonical replication pattern for ADR-050 slices. Code sample assumes `createBrowserComponentClient()` returns an authenticated client. **No auth-bridge contract surfaced.**                                                                                                                                                            |
| **FINANCIAL-FRESHNESS-ROLLOUT (W0–W4)**          | 2026-04-19 | Operational | Phased workstreams per slice. No auth-bridge workstream defined.                                                                                                                                                                                                                                                                         |
| **SEC-002 Casino-Scoped Security Model**         | —          | Security    | RLS patterns (Pattern C hybrid), `set_rls_context_from_staff()` context derivation. Does not document Phoenix subscriber role evaluation or the interaction between unauthenticated sockets and authenticated-scoped RLS.                                                                                                                |
| **QA-006 E2E Testing Standard**                  | —          | Quality     | Mode A (DEV_AUTH_BYPASS), Mode B (browser login), Mode C (session injection). §8 marks E2E as advisory-only in CI. §1 mandates per-spec mode declaration (16+ specs non-compliant).                                                                                                                                                      |

**Canon completeness:** The set covers architecture + events + cache + security + testing. On paper, the stack is thorough.

## 2. Implemented Surface

### 2.1 Infrastructure (ADR-004-prescribed)

| Component                                                 | Specified | Built                                                                                    |
| --------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `lib/realtime/channel-registry.ts`                        | ✓         | ✗ (directory does not exist)                                                             |
| `lib/realtime/invalidation-scheduler.ts`                  | ✓         | ✗                                                                                        |
| Shared `useRealtimeSubscription` template                 | ✓         | ✗                                                                                        |
| Registry `refreshAuth(token)` method                      | ✓         | ✗ (by extension, no canonical home for `setAuth`)                                        |
| Domain-scoped channel namespacing (`rt.<domain>.<scope>`) | ✓         | ✗ (existing hooks use ad-hoc topic names like `shift-dashboard-rated-buyin-${casinoId}`) |

### 2.2 Consumer Hooks

| Hook                        | File                                                    | Tables                                                      | Events                   | Polling Fallback | Pattern Compliance                                                          |
| --------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ | ---------------- | --------------------------------------------------------------------------- |
| `useDashboardRealtime`      | `hooks/dashboard/use-dashboard-realtime.tsx`            | `gaming_table`, `rating_slip`, `table_fill`, `table_credit` | INSERT/UPDATE/DELETE all | 30–60s           | Off-canon (hand-rolled, no registry)                                        |
| `useShiftDashboardRealtime` | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` | `table_buyin_telemetry`                                     | INSERT/UPDATE/DELETE all | 30s              | Off-canon but codified by REPLICATION-CHECKLIST as the pattern to replicate |

**Consumer count: 2.** Mount points: 4 (pit-dashboard-client, pit-panels-client, shift-dashboard-v3, and whatever surfaces either client). No shared wrapper, no abstraction layer.

### 2.3 Publication + Event Wiring

- `supabase_realtime` publication members (explicit `ALTER PUBLICATION` migrations): **1 table** — `table_buyin_telemetry` (added 2026-04-20 in commit `b1646023`).
- INT-002 catalog: 21 events documented. Client-side listeners: **2 tables' worth** (the two hooks above). Coverage: ~10% of the catalog.
- Broadcast / presence channels: 0.

### 2.4 Client Factories

| Factory                             | Package                      | Realtime? | Auth bridge?                                    |
| ----------------------------------- | ---------------------------- | --------- | ----------------------------------------------- |
| `lib/supabase/client.ts` (browser)  | `@supabase/ssr@0.8.0`        | Yes       | **No — no `setAuth` call anywhere in codebase** |
| `lib/supabase/server.ts`            | `@supabase/ssr@0.8.0`        | N/A       | N/A                                             |
| `lib/supabase/middleware.ts` (edge) | `@supabase/ssr@0.8.0`        | N/A       | N/A                                             |
| `lib/supabase/service.ts`           | `@supabase/supabase-js@2.97` | N/A       | N/A (service role)                              |

**`realtime.setAuth` call sites in codebase: 0.**

## 3. Contract Gaps (Spec vs. Implementation)

| Contract                                            | Specified In                                    | Implementation Reality                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Channel registry with `refreshAuth(token)`          | ADR-004 §5                                      | No registry exists. `refreshAuth` has no home.                                                                               |
| Invalidation scheduler (50ms debounce)              | ADR-004                                         | None. Hooks invalidate synchronously per event; PRD-068 introduced ad-hoc debouncing inline.                                 |
| Domain-scoped channel names (`rt.<domain>.<scope>`) | ADR-004                                         | Hooks use `shift-dashboard-rated-buyin-${casinoId}` and `dashboard-${casinoId}` — their own convention.                      |
| Socket authentication                               | Assumed by ADR-050 §4, REPLICATION-CHECKLIST §2 | Not wired. Phoenix joins as `anon`. RLS on authenticated-scoped tables silently filters events.                              |
| 2s cross-tab LIVE SLA for FACT-RATED-BUYIN          | ADR-050 Appendix B (registry row ACTIVE)        | Delivered at ~30s via `refetchInterval` polling, not realtime. Registry row is promoted but runtime behavior does not match. |
| INT-002 event coverage                              | 21 events                                       | 2 tables wired (~10%). Fill/credit/settlement/session events have documented schemas but no client listener.                 |
| Realtime reconnection + resilience                  | ADR-004                                         | Ad-hoc per hook. No central retry/backoff; hooks rely on SDK defaults.                                                       |
| Memory leak prevention (ref-counted unsubscribe)    | ADR-004                                         | Each hook manages its own channel lifecycle with `useEffect` cleanup. No ref-count, so duplicate mounts = duplicate sockets. |

**Shape of the gap:** canon is well-designed but was never operationalized. REPLICATION-CHECKLIST-ADR-050 codified an off-canon ad-hoc implementation as the replication template, inheriting every gap into any future slice that "follows the checklist mechanically."

## 4. Adjacent Governance Surfaces

Realtime failures here are entangled with broader `authenticated`-role governance.

### 4.1 Authenticated-Role Dependency Surface

- ~95 `rpc_*` functions, 201 explicit `GRANT EXECUTE TO authenticated` statements. Estimated ~3–6 functions still lacking explicit grant after ADR-018/SEC-007 bulk-REVOKE cycles (exact count unknown without running the audit gate).
- 438 RLS policies; ~180 with `auth.uid()` or Pattern C hybrid (`current_setting('app.casino_id')` + JWT fallback).
- 1 realtime-published table, with `authenticated`-only RLS.
- 0 storage policies in scope.

### 4.2 Existing Gates (Built but Unenforced)

| Gate                                | File                                                       | Runs Where                               | CI-Required?                |
| ----------------------------------- | ---------------------------------------------------------- | ---------------------------------------- | --------------------------- |
| Grant audit gate                    | `supabase/tests/security/10_authenticated_grant_audit.sql` | Migration PRs against ephemeral Postgres | No                          |
| Integration tests (Mode C real JWT) | 60+ `.int.test.ts` files                                   | Local / on-demand                        | No                          |
| E2E Mode B (browser login)          | 5 Playwright specs                                         | Local / on-demand                        | No (advisory per QA-006 §8) |
| E2E Mode C (authenticated client)   | 3+ Playwright specs                                        | Local / on-demand                        | No                          |
| E2E mode labeling compliance        | QA-006 §1                                                  | Code review                              | 16+ specs non-compliant     |

### 4.3 DEV_AUTH_BYPASS Scope

- 8 call sites across `lib/supabase/*`, `lib/server-actions/middleware/*`, `hooks/use-auth.ts`, and three dashboard page components.
- When active: swaps to service-role client, skips `set_rls_context_from_staff()` RPC, synthesizes fake staff claims, never calls `realtime.setAuth`.
- Guard: dual-switched (`NODE_ENV === 'development'` AND `ENABLE_DEV_AUTH === 'true'`). No observed production leakage path.
- **Mimicry failure mode:** with bypass on, realtime joins as `anon`; `anon` has no grants on authenticated-scoped tables, so the channel is silent. With bypass off in a broken prod, realtime also joins as `anon` (missing `setAuth`) and is also silent. **Dev and broken-prod produce the same observable symptom** — which is why neither P1 bug was caught in dev.
- Real-auth dev mode exists (`ENABLE_DEV_AUTH=false` + sign in as `pitboss@dev.local`) but has friction (manual sign-in each session, no `/dev/login` shortcut); not the developer default.

### 4.4 Test Coverage of Realtime Specifically

- Unit tests on `createBrowserComponentClient`: **0**.
- Integration tests exercising realtime auth: **0**.
- E2E tests asserting realtime delivery under Mode B: **1** (`exemplar-rated-buyin.spec.ts`, but it uses service-role direct inserts — bypasses the browser auth path, so structurally incapable of detecting `setAuth` regressions even though it runs under Mode B).
- Jest tests that would catch removal of a `setAuth` bridge: **0**.
- Tests covering ADR-004 channel registry: **N/A** (registry does not exist).

## 5. Historical Signals

The realtime / authenticated-role blind spot has surfaced repeatedly:

| Date        | Artifact                                                                              | Signal                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-10-25  | ADR-004 accepted                                                                      | Full realtime architecture specified; infrastructure never built.                                                                                                                                              |
| — (undated) | `docs/issues/gaps/realtime-gap/adr-004-gap.md`                                        | Explicit acknowledgement: "The canon exists and is thorough... the realtime infrastructure was planned but never implemented, so the panel falls back to `refetchInterval` polling as a pragmatic workaround." |
| 2026-02-20  | Migration `20260219235800` (ADR-018)                                                  | Bulk `REVOKE ALL ON ALL FUNCTIONS` + selective re-grant introduced; enumeration pattern became fragile.                                                                                                        |
| 2026-03-02  | Migration `20260302230032` (SEC-007 P1)                                               | Re-granted 10 functions that slipped through ADR-018.                                                                                                                                                          |
| 2026-04-08  | `GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT.md` filed                                    | `rpc_get_rating_slip_duration` discovered missing `GRANT EXECUTE TO authenticated` in production. P1 status. "Partially resolved" — hotfix applied, systemic prevention pending.                               |
| 2026-04-08  | Migration `20260408112838`                                                            | Hotfix for the grant gap.                                                                                                                                                                                      |
| 2026-04-19  | ADR-050 accepted; commit `b1646023`                                                   | Phase 1 exemplar ships with 2s LIVE SLA claim in the registry.                                                                                                                                                 |
| 2026-04-20  | `INVESTIGATION-2026-04-20-PRECIS.md` + `ISSUE-2026-04-20-realtime-setauth-missing.md` | Present investigation. Discovers the SLA is not met in-browser; diagnoses missing `setAuth` bridge.                                                                                                            |

**Pattern:** Three P1-severity discoveries (ADR-018 re-grant gap → SEC-007 re-grant gap → `rpc_get_rating_slip_duration` → `setAuth`) over ~8 weeks, all sharing one shape: a behavior that only manifests against the real `authenticated` role, invisible to the default test loop. The realtime gap was flagged pre-ADR-050 (`adr-004-gap.md`) but not resolved before ADR-050 was written on top of it.

## 6. Posture Summary (descriptive)

- **Canon exists, implementation lags.** ADR-004's full architecture (registry, scheduler, template, auth bridge) is unbuilt. Current realtime consumers are hand-rolled ad-hoc implementations.
- **ADR-050 assumes an authenticated socket.** The canonical replication pattern in REPLICATION-CHECKLIST §2 does not surface socket authentication as a contract property, even though every slice relying on `postgres_changes` against authenticated-scoped RLS depends on it.
- **Two consumer hooks, both off-canon, both silently degraded.** Blast radius is small in absolute terms (2 hooks, 4 mount points) but proportionally total — the `setAuth` gap affects 2 of 2 realtime consumers.
- **Test infrastructure for `authenticated`-role exercise is built but not CI-enforced.** Integration tests, Mode B/C E2E, grant audit gate — all exist, all advisory.
- **DEV_AUTH_BYPASS is scope-broad, mechanistically safe, behaviorally hiding.** It doesn't leak to production but produces observation-identical symptoms to a broken prod, making the very class of bug it enables structurally invisible to developers.
- **The gap has surfaced before.** `adr-004-gap.md` documented the unbuilt infrastructure pre-ADR-050; `GAP-AUTHENTICATED-ROLE-GRANT-BLIND-SPOT.md` documented the invisibility pattern two weeks before the present investigation. Both remain PARTIALLY RESOLVED.

## 7. Open Questions (items the audit could not resolve)

- Whether INT-002's other 19 unwired events have planned consumer hooks elsewhere or are speculative.
- Whether ADR-004 has been amended or partially superseded by any ADR not surfaced in the review (e.g., an explicit decision to defer the registry).
- Exact count of `rpc_*` functions currently missing explicit `GRANT EXECUTE TO authenticated` — requires running the audit gate against the current DB state.
- Whether REPLICATION-CHECKLIST-ADR-050 §2 has been updated since 2026-04-19 (read via agent summary, not direct).
- Whether any ongoing workstream exists to build the ADR-004 infrastructure (no EXEC-SPEC surfaced; `realtime-gap/adr-004-gap.md` has no linked action item).
- Whether the `/api/v1/mtl/gaming-day-summary` UI rendering bug surfaced in the investigation shares a realtime-related cause or is purely a BFF response-shape mismatch.