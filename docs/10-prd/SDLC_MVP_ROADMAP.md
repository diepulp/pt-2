# SDLC Roadmap → MVP

Awesome milestone. You’ve locked in the SRM, schema alignment, API surface, hooks, and server actions—now it’s time to march cleanly to MVP using a tight SDLC frame. Here’s a pragmatic, phase-based plan with concrete deliverables and exit criteria so you can keep scope crisp and momentum high.

## 0) North Star MVP (1 paragraph + 5 bullets)
**Goal:** “Table-centric player tracking with compliant session logging and basic loyalty accrual, ready for pilot at a single casino.”  
**Must-have slices (one per bounded context):**
- **Casino**: staff auth, casino settings (gaming day), table catalog.
- **Table Context**: open/close table, dealer rotation log (happy-path).
- **Player & Visit**: enroll player, start/stop visit, assign to table.
- **Rating Slip (telemetry)**: start/pause/resume/close; seconds accrued; simple AOV metric.
- **Loyalty**: mid-session reward (RPC), ledger write, readback in session view.
- **Finance**: record deposit/withdrawal manually (no cashier workflows).
- **MTL (read-only for MVP)**: show threshold proximity + recent loyalty events (context only).

> Everything else is a Phase-2 conversation.

---

## 1) Inception → PRD (2–3 days)
**Artifacts**
- **PRD v1.0**: problem, users, non-goals, KPIs (e.g., session creation < 2s p95; LCP ≤ 2.5s).
- **User flows**: “Open table → seat player → start slip → award mid-session reward → close slip”.
- **MVP Scope Matrix** mapping each PRD flow to SRM contexts/tables/RPCs.
- **Risks & Assumptions**: network flakiness, RLS misconfig, schema cache parity.
- **Balanced Architecture Intake Cards** (ADR-009) for every scoped slice: scope vs SRM, slice type, transport choice, estimated timeline, OE-01 trigger (if applicable).

**Exit criteria**
- MVP scope frozen; success metrics defined; “nice-to-haves” parked.
- Intake cards stored with links to SRM sections + API catalogue rows (ADR-007).
- Any infra ask documents OE-01 trigger per ADR-011 before backlog grooming closes.

---

## 2) Architecture & Security Design (3–4 days)
**Artifacts**
- **Service Layer Diagram (Mermaid)** per SRM v3.0.2-PATCHED and ADR-008.
- **RLS/RBAC Matrix** (per table + RPC): who can `select/insert/update/delete` (CasinoService, StaffRole).
- **API Catalog + OpenAPI diff** (ADR-007): server actions + routes documented alongside `25-api-data/api-surface.openapi.yaml`.
- **DTO/Service Compliance Audit** (ADR-010): confirm impacted domains already use canonical DTOs + service template layout.
- **Performance Budgets**: p95 latency per server action, query-key pattern, cache windows.
- **Observability Spec**: logs, metrics, traces; domain event IDs; correlation keys (casino_id, gaming_day, rating_slip_id).
- **Data Lifecycle**: gaming-day derivation, retention for logs, soft-delete policy.
- **OE-01 Review** (ADR-011): document triggers for any horizontal/platform track that slips into this phase.

**Exit criteria**
- No cross-context imports beyond public DTOs; RLS policies drafted for MVP tables; error codes standardized.
- API catalogue + OpenAPI updated and linked in PR; service diagram approved.
- DTO/service audit gaps have remediation tickets before slicing starts.

---

## 3) Implementation Plan (Vertical Slices) (rolling; 2–3 weeks total)
Deliver slice-by-slice; each slice includes schema migration (if any), RLS, server actions, React Query hooks, UI, tests, and telemetry.

**Slice order (minimize coupling)**
1. **Casino core** (settings, staff auth guard, gaming day): compute_gaming_day parity verified.
2. **Table Context** (open/close; table UI; live status, table settings).
3. **Player & Visit** (create player, start/stop visit; seat at table).
4. **Rating Slip** (start/pause/resume/close; seconds accrued + AOV display).
5. **Loyalty** (rpc_issue_mid_session_reward with idempotency key; show ledger rows in session).
6. **MTL (read-only)** badge: show threshold proximity + last N loyalty actions for correlation.
7. **Finance (minimal)** manual deposit/withdraw (optional for MVP, feature-flagged).

**Per-slice exit criteria**
- Intake card (ADR-009) still accurate; changes documented if scope shifts.
- Supabase migrations follow timestamp standard + `supabase gen types` committed; DTO/service compliance check passes (ADR-010).
- API catalogue + OpenAPI updated when routes/actions change (ADR-007); service diagram updated as needed (ADR-008).
- All RLS tests pass; PostgREST and server actions green.
- React Query cache keys follow the canonical standard; hooks live in documented directories (ADR-003).
- Real-time wiring follows ADR-004 event map: cache invalidation strategy + batching documented in domain README.
- Metrics emitted: action latency, error rate, and domain counters (slips_open, rewards_issued).
- OE-01 guardrail reviewed for any infra/supporting work (ADR-011).

---

## 4) Stabilization & Hardening (4–5 days)
**Tracks**
- **QA Test Plan**: happy-path + core edge cases (pause/resume overlaps; duplicate reward attempt → idem OK).
- **Load/Perf**: table of p95s vs budget; DB EXPLAIN on top 5 queries; index review.
- **RLS Red-Team**: attempt privilege escalation across casino_id; row-leak tests.
- **Telemetry Review**: dashboards for operational KPIs; alerts for failure spikes.
- **Contract Audit**: SRM ↔ schema diff clean (ADR-000); API catalogue/OpenAPI in sync (ADR-007); service template diagram refreshed (ADR-008); DTO/service lint reports clean (ADR-010); OE-01 checklist signed (ADR-011).

**Exit criteria**
- p95 budgets met; zero critical RLS leaks; SLOs + alerts live.
- Contract + documentation gates signed off (SRM, API catalogue, ADR references above).

---

## 5) Pilot & Feedback (3–7 days)
- **Pilot Runbook**: feature flags, rollback switches, data capture checklists.
- **On-site Metrics**: operator friction notes; mean time to complete common tasks.
- **Bug triage**: severity gates (P0 ship-blockers only).

**Exit criteria**
- “MVP ready” sign-off from operator; P0 backlog empty, P1 deferred with owners/dates.
- Intake cards, API catalogue entries, and realtime event map updated for any pilot-learned adjustments; OE-01 checklist re-run before Phase-2 asks.

---

## Cross-Cutting Workstreams (do in parallel)

### A) RLS/RBAC Finalization
- Derive each policy from SRM ownership: `(casino_id, staff.role)` + gaming_day where applicable.
- Integration tests: “deny by default”; prove allow-paths per role (Dealer, PitBoss, Auditor).

### B) Observability/Logging
- Correlation IDs for every server action: `{casino_id, staff_id, rating_slip_id, visit_id}`.
- Domain events (structured logs): `rating_slip.started|paused|resumed|closed`, `loyalty.reward_issued`.
- Minimal dashboards: “Active tables”, “Open slips”, “Rewards per hour”, error rate.

### C) Data Consistency & Idempotency
- **Idempotency keys** on reward RPC and any financial write.
- Natural key constraints wherever possible (unique `rating_slip_id + reward_reason` for mid-session).
- Background reconciliation job (read-only): detect gaps between slip seconds and ledger accruals (report only).

### D) DX & Docs
- “How we ship a slice” checklist (Standardization Protocol V3): Retrieve → Rerank → Compress → Inject.
- ADR compliance log: reference [ADR-000](80-adrs/ADR-000-matrix-as-contract.md), [ADR-007](80-adrs/ADR-007-api-surface-catalogue.md)–[ADR-011](80-adrs/ADR-011-over-engineering-guardrail.md) in PR templates and docs; compact JSON schema for DTOs.
- One-pager “Query-Key Standard” and “Mutation Patterns” for React Query.

---

## Bounded Context Focus & What “Done” Means

- **Casino**: settings, staff, gaming day RPC parity → *Done =* staff can log in, settings load, gaming day computed consistently client/server.
- **Table Context**: table open/close, status, rotation log → *Done =* live board shows table states; rotation saved with RLS.
- **Player/Visit**: create player, start/stop visit → *Done =* visit timeline visible; seat mapping to table.
- **Rating Slip**: reliable time accrual; pause intervals tracked → *Done =* no double-count; AOV visible; RLS prevents cross-casino access.
- **Loyalty**: `rpc_issue_mid_session_reward` hooked; ledger read in UI → *Done =* reward issuance is idempotent; ledger rows correlate back to slip.
- **Finance (optional)**: manual deposit/withdraw → *Done =* basic entries with compute_gaming_day; no cashier automation.
- **MTL (read-only)**: threshold badge + recent loyalty sidebar → *Done =* aids investigations; no points→cash inference.

---

## Quality Gates (ship / no-ship)

- **Security**: All RLS tests pass; least-privilege roles.
- **Reliability**: p95 per action met; zero “stuck slip” defects.
- **Usability**: operator can complete 3 key flows in < 2 minutes total.
- **Observability**: dashboards live; alarms wired to error budgets.
- **Docs**: PRD + API Catalog + RLS Matrix + Test Plan + Runbook checked into repo.

---

## The Next 2 Weeks (concrete plan)

**Week 1**
1. Draft **PRD v1.0** and **Scope Matrix**; lock MVP flows.  
2. Generate **RLS/RBAC Matrix** for: casino, table, player, visit, rating_slip, loyalty_ledger.  
3. Implement slice **Casino core** and **Table Context** (open/close) with tests + dashboards v0.

**Week 2**
4. Implement **Player/Visit** and **Rating Slip**; verify accrual math + pause intervals.  
5. Wire **Loyalty RPC** with idempotency keys; show ledger in session view.  
6. Add **MTL read-only badge**; run perf + RLS red-team; fix P0s.

---

## Risks & Mitigations

- **Scope creep** → Strict slice gates; anything not in PRD goes to Phase-2.
- **RLS complexity** → Start with deny-all; add allow-paths incrementally with tests.
- **Schema drift** → Only migrate via Supabase CLI; verify PostgREST schema cache health post-migration.
- **Perf regressions** → Add p95 SLOs now; EXPLAIN before merging heavy queries.
