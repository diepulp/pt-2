# Feature Intake Brief

## A. Feature identity
- **Feature name:** Visit-Anchored Cents Envelope Migration (Phase 1.1b)
- **Feature ID / shorthand:** FIB-H-FIN-CENTS-001
- **Related wedge / phase / slice:** Financial Data Distribution — Wave 1 Phase 1.1b (follow-on slice)
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-04-24
- **Priority:** P1 — Phase 1.1 closing dependency
- **Target decision horizon:** Phase 1.1 close
- **Supporting artifact:** `docs/issues/gaps/financial-data-distribution-standard/intake/FIB-S-FIN-CENTS-001-visit-anchored-cents-envelope.json`
- **Lead-architect disposition:** Accepted with amendment — 2026-04-24 (review/demo surface exclusion updated to match repo state after `app/review/` removal)
- **Parent PRD:** `docs/10-prd/PRD-070-financial-telemetry-wave1-phase1.1-service-dto-envelope-v0.md` (umbrella Phase 1.1)
- **Parent EXEC-SPEC:** `docs/21-exec-spec/PRD-070/EXEC-070-financial-telemetry-wave1-phase1.1-service-dto-envelope.md` (WS5/WS5_ROUTE/WS5_UI/WS6 — redefined here)
- **Checkpoint reference:** `.claude/skills/build-pipeline/checkpoints/PRD-070.json § blast_radius_reality_check_2026-04-24`

## B. Operator problem statement
PRD-070 Wave 1 Phase 1.1 bundled two complexity tiers under the same EXEC-SPEC: (1) a tier-1 identifier rename on the rating-slip modal BFF (`totalChipsOut` → `totalCashOut`, landed as WS4), and (2) a tier-2 shape conversion on visit-anchored currency fields (bare `number` → `FinancialValue` envelope on `RecentSessionDTO.total_buy_in/total_cash_out/net` and `VisitLiveViewDTO.session_total_buy_in/session_total_cash_out/session_net`, declared as WS5 + WS6). A mid-execution reality check against the live codebase revealed four classes of scope gaps in the original blast radius, a missing render-pattern decision, a sequencing hazard not surfaced at the PRD layer, and a demo-only surface (`/review`) incorrectly pulled into implementation scope. Those gaps are structural, not incidental — they represent scope that the parent spec under-declared. Closing them via in-flight EXEC amendments would trigger per-workstream escalation cycles against PRD-070 §2.3 / NFR-7. A scoped child PRD is more efficient and more truthful than amending the parent mid-execution.

## C. Pilot-fit / current-slice justification
This slice is the final architectural step that makes the Financial Data Distribution Standard true at the visit-anchored service boundary — every currency value leaving `services/visit/` and `services/rating-slip/` (in its visit-live-view role) carries an explicit authority, source, and completeness rather than a silently-converted dollar scalar. It is coherent as a single slice because: (a) both DTO shapes converge on `services/visit/dtos.ts` (shared file — must serialize); (b) both use the same Pattern A data flow (RPC JSONB → mapper wraps → DTO → route passthrough → UI `formatCents(.value)`); (c) both have the same test-file-birth requirement (two route-boundary test directories do not yet exist and must be created). Treating them as one slice also exposes their sequencing constraint as a first-class invariant rather than a buried EXEC-SPEC note. WS7B (shift-intelligence authority routing) and WS9 (Phase 1.1 verification matrix) are **not** in this slice — they are architecturally and/or temporally distinct.

## D. Primary actor and operator moment
- **Primary actor:** (direct) backend / frontend builder applying the envelope contract at the service boundary and its directly coupled consumers; (indirect) floor supervisor consuming Recent Sessions and Visit Live View surfaces
- **When does this happen?** During Phase 1.1b execution; no operator-visible behavior change — rendered currency values are identical in both formats, and the envelope metadata is diagnostic for governance/audit consumers, not UI decoration
- **Primary surface:** service layer (`services/visit/`, `services/rating-slip/`); route handlers (`app/api/v1/players/[playerId]/recent-sessions/`, `app/api/v1/visits/[visitId]/live-view/`); two directly coupled UI components (`components/player-sessions/start-from-previous.tsx`, `components/player-sessions/start-from-previous-modal.tsx`)
- **Trigger event:** RPC returns bare cents → mapper wraps into `FinancialValue` envelope → consumer unwraps `.value` for display

## E. Feature Containment Loop
1. RPC `rpc_get_player_recent_sessions` / `rpc_get_visit_live_view` returns bare cents in JSONB (unchanged — no SQL migration in this slice).
2. Wire-format Zod validator (`recentSessionsRpcResponseSchema`) continues to validate bare `z.number()` — it is aligned to the RPC, not to the DTO.
3. Mapper (new for recent-sessions, existing `toVisitLiveViewDTO` for live-view) wraps each currency field into `FinancialValue` with `authority: 'actual'`, explicit `source` string (e.g. `visit_financial_summary.total_in`), and explicit `completeness.status` (`'complete'` when all inputs present, `'unknown'` otherwise — never omitted).
4. CRUD / service export the envelope-shaped DTO. Pre-existing `/ 100` dollar conversions are deleted.
5. Route handler passes the DTO through unchanged (no dollar/cents math at the transport layer).
6. Route-boundary test (new file) asserts envelope shape at the wire: `type`, `source`, `completeness.status` present; `value` is integer cents.
7. UI consumer reads `dto.total_buy_in.value` and renders via `formatCents(envelope.value)` from `lib/format.ts`. No use of `<FinancialValue>` component (Phase 1.3). No inline `/100` math.

## F. Required outcomes
- **Shape migration complete:** `RecentSessionDTO.total_buy_in`, `total_cash_out`, `net` and `VisitLiveViewDTO.session_total_buy_in`, `session_total_cash_out`, `session_net` all typed as `FinancialValue` rather than `number`.
- **Dollar pre-conversion removed:** zero `/100` conversions at the visit-anchored service boundary (`services/visit/crud.ts` L516-522 block deleted; `services/rating-slip/mappers.ts` L340-342 block deleted).
- **Zod partition explicit:** wire-format schema (`recentSessionsRpcResponseSchema`) continues to validate bare numbers matching RPC JSONB. An optional outbound DTO schema built on `financialValueSchema` from `lib/financial/schema.ts` is either added or explicitly declined with rationale.
- **Completeness rule enforced:** every envelope emission passes through the `WAVE-1-CLASSIFICATION-RULES §5.1` completeness decision tree; `'unknown'` path exercised where inputs may be missing. Never omit `completeness.status`.
- **Render pattern uniform:** both UI consumers (`start-from-previous.tsx`, `start-from-previous-modal.tsx`) use `formatCents(envelope.value)` — not `<FinancialValue>` (deferred), not inline dollar math.
- **Route-boundary test coverage born:** `app/api/v1/players/[playerId]/recent-sessions/__tests__/route.test.ts` and `app/api/v1/visits/[visitId]/live-view/__tests__/route.test.ts` exist, exercise at least one success path + one envelope-shape assertion.
- **Serialization invariant satisfied:** WS5 (recent-sessions) ships fully before WS6 (live-view) touches `services/visit/dtos.ts` — or both land in one atomic commit; they never execute in parallel.
- **Grep gates:** zero `total_buy_in: number` / `total_cash_out: number` / `session_total_buy_in: number` / `session_total_cash_out: number` / `session_net: number` in `services/visit/`, `services/rating-slip/`, `app/api/v1/`, and `components/player-sessions/`.

## G. Explicit exclusions
- The former `app/review/` demo/design-review surface was deleted from the repo on 2026-04-24. It is not part of this slice; if a future mock/demo surface is reintroduced, that work remains independent of this data-contract migration.
- `<FinancialValue>` React component — Phase 1.3 scope. Not built in this slice. Interim render uses `lib/format.ts::formatCents(envelope.value)`.
- Shift-intelligence authority routing (WS7B) — different bounded context, different pattern (mapper helper vs shape conversion). Warrants a separate FIB.
- Phase 1.1 verification matrix + rollback package + Phase 1.2 handoff (WS9) — stays under parent PRD-070 as closing gate; runs after this slice closes.
- SQL migrations — the RPCs emit bare cents already (verified: `supabase/migrations/20251222142645_prd017_rpc_recent_sessions.sql` L188/L233, `20251222014553_prd016_rpc_live_view_adr015.sql` L167). No SQL work is required.
- `pit_cash_observation.amount` dollar→cents column migration — Wave 2 scope per PRD-070 §91.
- Broad API / OpenAPI envelope migration across the rest of the route surface — Phase 1.2 scope.
- Broad UI migration to `<FinancialValue>` / `<AttributionRatio>` / `<CompletenessBadge>` — Phase 1.3 scope.
- Persistent alert / anomaly envelope shape change on `AnomalyAlertDTO` / `ShiftAlertDTO` — deferred to Phase 1.2 per EXEC-070 Planning Lock Resolution (GATE-070.6) and already documented in `services/shift-intelligence/dtos.ts` JSDoc carve-out (WS7A).
- `rating-slip-modal` / `totalChipsOut → totalCashOut` rename — already landed as WS4 in PRD-070.
- Any future demo/review-surface tests — if the demo surface is reintroduced later, those tests remain out of scope for this slice.

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Amend PRD-070 in-flight with corrected blast radius | Keeps one spec to track | Triggers per-workstream escalation per §2.3 / NFR-7; mid-execution amendment pollutes completion metrics; cleaner to scope a child spec |
| Bundle WS7B (shift-intelligence) into this slice | All three are "remaining Phase 1.1 work" | Different bounded context, different pattern (mapper helper + alert path parity vs shape conversion); mixing them defeats the "manageable slice" goal |
| Bundle WS9 (verification + handoff) into this slice | Phase 1.1 needs to close | WS9 depends on WS7B too; it belongs to whichever workstream closes last, not mid-slice |
| Build `<FinancialValue>` component now to avoid `formatCents` interim | Avoids Phase 1.3 rework | Contradicts PRD-070 §87 and expands scope; `formatCents(envelope.value)` is a one-line call and not tech debt |
| Ship route passthrough without adding route-boundary test files | Reduces new-file churn | EXEC-070 WS9 verification matrix already requires the two test files; deferring creates a WS9 gap |
| Migrate the former `/review` page alongside the UI consumers | Matches EXEC-070 §442 original scope before cleanup | The demo surface was removed from the repo on 2026-04-24. Any future mock/demo refresh remains separate from the data-contract migration |
| Keep bare `number` types in route response and emit envelope only in UI | Looks smaller | Contradicts FR-1 in PRD-070 — envelope MUST be present at every service boundary, and routes are service boundaries |

## I. Dependencies and assumptions
- **WS1 primitives landed:** `lib/financial/schema.ts` exports `financialValueSchema`, `completenessSchema`, `financialAuthoritySchema`; `lib/financial/rounding.ts` exports `dollarsToCents` (not used in this slice — RPC already returns cents — but available if needed).
- **WS4 modal rename landed:** `totalChipsOut` → `totalCashOut` fully propagated including SQL migration `20260424024019_prd070_rename_modal_bff_total_cash_out.sql`. No residual `totalChipsOut` in live code.
- **`lib/format.ts::formatCents(cents: number | null | undefined): string` exists** and handles null/undefined gracefully — it is the canonical interim UI path in Phase 1.1b.
- **Canonical types:** `types/financial.ts` defines `FinancialValue`, `FinancialAuthority`, `CompletenessStatus`. Services must NOT redefine.
- **RPCs return bare cents:** confirmed by direct migration inspection for both `rpc_get_player_recent_sessions` and `rpc_get_visit_live_view`. No SQL changes required in this slice.
- **Route directories exist, test subdirectories do not:** `app/api/v1/players/[playerId]/recent-sessions/__tests__/` and `app/api/v1/visits/[visitId]/live-view/__tests__/` must be **born** — the EXEC-SPEC must treat these as `create` deliverables, not `modify`.
- **Serialization constraint:** `services/visit/dtos.ts` is touched by both WS5 (`RecentSessionDTO`) and WS6 (`VisitLiveViewDTO`). Sequential execution mandatory; EXEC-SPEC must encode this as a hard rule.
- **No feature flag required:** envelope addition is strictly additive at the TS level; UI renders identical currency string via `formatCents`.

## J. Out-of-scope but likely next
- WS7B — shift-intelligence authority routing (needs its own FIB / PRD).
- WS9 — Phase 1.1 verification matrix + rollback ownership + Phase 1.2 handoff package (stays under PRD-070 closing gate; runs after this slice and WS7B both close).
- Phase 1.2 broad API envelope migration across the rest of the route surface.
- Phase 1.2 reopening of deferred shift-intelligence public field-shape changes (`AnomalyAlertDTO.observedValue` etc.) — deferred per GATE-070.6.
- Phase 1.3 `<FinancialValue>` / `<AttributionRatio>` / `<CompletenessBadge>` component rollout and broad UI visual migration.
- Wave 2 `pit_cash_observation.amount` dollar → cents column schema migration.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes: (a) introducing a new demo/design-review surface into this implementation blast radius (including any future `/review` revival); (b) using `<FinancialValue>` component in Phase 1.1 (must defer to 1.3); (c) inline `/100` dollar math at any layer (mapper, route, or UI); (d) skipping either route-boundary test file birth; (e) widening scope to include shift-intelligence, MTL, or other bounded contexts not already owned by WS5/WS6; (f) parallel execution of WS5 + WS6 workstreams (violates `services/visit/dtos.ts` serialization invariant); (g) introducing a SQL migration at the visit-anchored RPC layer (the RPCs already return bare cents — no DDL or function rewrite needed in this slice); (h) adding Zod runtime validation at the outbound DTO boundary without lead-architect sign-off on the wire-vs-DTO partition decision.
