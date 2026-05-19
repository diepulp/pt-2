## PRD-086: Wave 2 Phase 2.3a — Operational Outbox Observability — Delivery Précis

### What This Was (And Was Not)

PRD-086 is the **read-only operational observability surface** for the Wave 2 transactional outbox. It does not expand producers, introduce projection consumers, modify relay behavior, add write paths, or change any authoring-store schema. Its sole function is to make `finance_outbox` relay delivery state and full event semantic envelopes directly inspectable by casino admins without raw SQL access. All six producer paths were wired and I1–I4 certified by Phase 2.2 close; this slice closes the operational visibility gap that remained.

**Containment boundary (one-line invariant):** *If it is not a read-only admin RPC, a DTO addition derived from existing DB schema, a GET-only admin route, a read-only admin UI component, or a wave-tracker governance update — it is not in this PRD.*

Zero writes exist in this slice. The route, both RPCs, and all UI components perform no DML against `finance_outbox`, `processed_messages`, or any other table. This is enforced at the implementation level (GET-only route, read-only `SELECT` RPCs, no action buttons in the UI) and verified by code review gate.

**Phase 2.3a authorization:** Phase 2.2 exit — PRD-085/EXEC-085 complete, 2026-05-19.

**Parallelization status:** Proceeded concurrently with Phase 2.3 (PRD-087). The four parallelization conditions (frozen relay topology, unchanged replay ordering semantics, no projection logic introduced, no write/replay/repair actions added) were preserved throughout delivery.

---

### Artifacts Delivered (6 files across 4 workstreams)

**WS1 — Admin Read RPCs + DTO Additions**

- `supabase/migrations/20260519010436_wave2_outbox_admin_read_rpcs.sql`

  Single migration wrapped in `BEGIN; … COMMIT;`. Opens with a `DO $$` pre-state assertion block that raises a clear exception if `finance_outbox.delivery_attempts` or `finance_outbox.last_error` are absent (message: "PRE-STATE FAIL: … Apply Wave 2 transform migration first."), preventing forward application against a stale schema. Defines two read-only SECURITY DEFINER functions, both with `SET search_path = ''` and all public/anon/authenticated grants revoked.

  **`rpc_get_outbox_relay_health(p_casino_id UUID)`** — returns a single-row summary over `finance_outbox` for the given casino using `COUNT(*) FILTER` aggregates: `pending_count` (unprocessed rows), `oldest_pending_age_seconds` (seconds since the oldest unprocessed row's `created_at`; NULL when no pending rows), `retry_row_count` (`delivery_attempts >= 1 AND processed_at IS NULL`), `poison_candidate_count` (`delivery_attempts >= 3 AND processed_at IS NULL`), `processed_count_24h` (`processed_at IS NOT NULL` within the last 24 hours). Single `SELECT` — no joins.

  **`rpc_get_outbox_event_page(p_casino_id UUID, p_event_type TEXT, p_status TEXT, p_search_id UUID, p_limit INTEGER)`** — returns up to 100 `finance_outbox` rows with the full semantic envelope and all relay lifecycle columns. `v_limit` is `GREATEST(1, LEAST(COALESCE(p_limit, 100), 100))` — hard server-side cap regardless of caller input. Includes a SQL-level `p_status` guard (`RAISE EXCEPTION … USING ERRCODE = 'invalid_parameter_value'`) as a second line of defence after the API-layer 400 validation. Status filter semantics are non-overlapping by design:
  - `'pending'`: `processed_at IS NULL AND delivery_attempts < 3`
  - `'processed'`: `processed_at IS NOT NULL`
  - `'failing'`: `processed_at IS NULL AND delivery_attempts >= 1 AND delivery_attempts < 3`
  - `'poison'`: `processed_at IS NULL AND delivery_attempts >= 3`

  A `'failing'` row can never be a `'poison'` row and vice versa — the boundary is `delivery_attempts = 3`. Search filter (`p_search_id`) matches any of `event_id`, `aggregate_id`, or `table_id` via OR predicate.

- `services/player-financial/dtos.ts` (additions)

  Two standalone types added alongside the frozen `FinancialOutboxEventDTO`. Neither extends nor intersects the consumer DTO — they share the same DB row origin but are independent contracts that evolve separately.

  **`OutboxAdminEventDTO`** — `Pick<FinancialOutboxRow, 'event_id' | 'event_type' | 'casino_id' | 'table_id' | 'player_id' | 'aggregate_id' | 'created_at' | 'processed_at' | 'delivery_attempts' | 'last_attempted_at' | 'last_error'>` intersected with literal union refinements for `fact_class: 'ledger' | 'operational'`, `origin_label: 'actual' | 'estimated' | 'observed' | 'compliance'`, and `payload: Record<string, unknown>`. Critically includes `delivery_attempts`, `last_attempted_at`, and `last_error` — the three relay lifecycle fields deliberately excluded from `FinancialOutboxEventDTO` (which is the frozen consumer shape per ADR-054 Wave 2).

  **`OutboxRelayHealthDTO`** — standalone struct matching the five RPC return columns: `pending_count: number`, `oldest_pending_age_seconds: number | null`, `retry_row_count: number`, `poison_candidate_count: number`, `processed_count_24h: number`. Not derived from a DB row type — directly mirrors the RPC return shape.

**WS2 — Internal Admin API Route**

- `app/api/internal/outbox-observability/route.ts`

  GET-only route. Implements the two-client auth pattern to prevent auth-semantic blurring:

  1. **Session client** (`createClient()` from `@/lib/supabase/server`): calls `auth.getUser()` (401 if no session), then queries `staff` directly — `select('role, casino_id').eq('user_id', user.id).eq('status', 'active').single()` — returning 403 if the row is absent or `staff.role !== 'admin'`. `casino_id` is derived from the confirmed `staff` row; it is never read from query params or request body (ADR-024 authoritative context derivation).

  2. **Service-role client** (`createServiceClient()` from `@/lib/supabase/service`): constructed only after authorization succeeds; used exclusively for the two RPC calls.

  Input validation runs between the auth check and the RPC calls: `status` is validated against a `Set` constant (`'all' | 'pending' | 'processed' | 'failing' | 'poison'`) returning 400 for any other value; `search_id` is validated against a UUID regex (`/^[0-9a-f]{8}-…$/i`) returning 400 if present but malformed. Both RPCs are called in parallel via `Promise.all`. Each error case returns a 500 with `safeErrorDetails(error)` from `@/lib/errors/safe-error-details`. Response shape: `{ health: OutboxRelayHealthDTO | null, events: OutboxAdminEventDTO[] }`.

**WS3 — Admin Outbox Observability Page**

- `app/(dashboard)/admin/outbox-observability/page.tsx`

  Server Component entry with no `'use client'` directive. Exports Next.js `metadata` (`title: 'Outbox Observability | d3lt'`) and a default page component that renders `OutboxObservabilityClient`. No data fetching, no filter state.

- `app/(dashboard)/admin/outbox-observability/OutboxObservabilityClient.tsx`

  `'use client'` component owning all interactive state. TanStack Query `useQuery` with `staleTime: 30_000` fetches `/api/internal/outbox-observability` whenever the committed filter state changes. Filter state (`Filters` interface: `eventType`, `status`, `searchId`) is staged locally and committed on form submit, preventing API refetch on every keystroke.

  **Relay Health Card** — `Card` with five metric chips derived from `OutboxRelayHealthDTO`. `oldest_pending_age_seconds` is formatted as a human-readable duration by `formatAge()` (null → `'—'`; sub-60s: `'Ns'`; sub-hour: `'Nm Rs'`; hours: `'Nh Mm'`). `poison_candidate_count > 0` applies an amber accent variant to that metric chip and its label (`text-amber-600 dark:text-amber-400`) — the only conditional visual distinction on the health card.

  **Filter Bar** — three controls: `event_type` select (All + 6 event types), `status` select (All + 4 status values), UUID search input. The search input validates client-side against `UUID_RE` on submit, showing an inline "Must be a valid UUID" error if invalid. Filter state commits on form submit via `onSubmit={(e) => { e.preventDefault(); applySearch(); }}` — the `applySearch` function is parameter-less (no `FormEvent` annotation, consistent with React 19).

  **Event Table** — 9 columns per the spec. `player_id` null renders as `'—'`. `created_at` and `last_attempted_at` rendered by `formatRelative()`. `processed_at` null renders a muted "pending" badge; present renders relative time. `delivery_attempts` column: rows with `delivery_attempts >= 3 AND processed_at === null` receive an inline amber "poison" span badge. `last_error` is truncated to 80 chars with `'…'` in the table cell; full text appears in the row-expand detail panel.

  **Row Expand** — `expandedRowId` state toggled by row click. Each row is rendered as `<Fragment key={event.event_id}>` wrapping the data `<tr>` and a conditional detail `<tr>`. The detail row contains a full field grid (all envelope + relay fields) plus a monospace `<pre>` JSON payload block limited to 2000 characters with the note "(payload truncated at 2000 chars)". No action buttons anywhere in the component tree.

  **`origin_label` display** — all four values (`actual`, `estimated`, `observed`, `compliance`) receive a uniform neutral `Badge` with `className="border-border/50 bg-muted/30 font-mono text-[10px] text-muted-foreground"`. No conditional color progression from `'estimated'` toward `'actual'`. ADR-054 D5 (`origin_label` immutability) is enforced at the display layer: the label is rendered as-stored with no visual upgrade logic.

- `components/layout/app-sidebar.tsx` (modification)

  Added `Activity` to the lucide-react import set. Added a new nav item in the Admin `navGroup` between the Loyalty and Settings items:
  ```ts
  { title: 'Outbox Observability', url: '/admin/outbox-observability', icon: Activity }
  ```
  No children array — the item links directly. Sidebar icon strip renders the `Activity` icon in collapsed mode.

**WS4 — Wave Tracker Governance**

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` — cursor advanced: `active_phase: "2.3"`, `last_closed_phase: "2.3a"`, `last_closed_prd: "PRD-086"`, `last_closed_exec: "EXEC-086"`, `next_action` updated. `phases[2.3a]` status → `"complete"`, `exec_spec`/`exec_spec_path`/`checkpoint`/`exit_date`/`exit_gates_passed` populated. `transport_infrastructure_posture` extended with Phase 2.3a database-layer migration, application-layer DTOs/route/page, and test-layer entries.
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` — header/current-position updated; §1 table 2.3a row → `✅ COMPLETE / PRD-086 / EXEC-086`; §6 item 7 → `[x]`; §7 Phase 2.3a status, deliverables, and exit gate all marked complete.

---

### Critical Implementation Decisions

**DEC-086-001 — Two-client auth pattern (never blend auth semantics):** The API route uses two distinct Supabase client instances. The session client (`createClient()`) performs identity resolution and admin-role verification; the service-role client (`createServiceClient()`) calls service-role-gated RPCs. Constructing the service-role client before authorization would allow the role-check to fail silently while the RPC call proceeds. The separation is an explicit implementation constraint, not an optimization.

**DEC-086-002 — `casino_id` from staff row, not request input:** Consistent with ADR-024 authoritative context derivation. The route queries the `staff` table and reads `casino_id` from the confirmed row. Any `casino_id` value in query params is ignored. This matches the pattern in `app/(dashboard)/admin/layout.tsx`.

**DEC-086-003 — `OutboxAdminEventDTO` does not extend `FinancialOutboxEventDTO`:** The consumer DTO is frozen by ADR-054. The observability DTO is the admin contract — it includes relay lifecycle fields (`delivery_attempts`, `last_attempted_at`, `last_error`) that are deliberately absent from the consumer shape. Extending would couple the observability surface to the consumer contract's evolution boundary. Both types share the same DB row origin but evolve independently.

**DEC-086-004 — `origin_label` uniform neutral display (ADR-054 D5 enforcement):** All four `origin_label` values receive identical neutral badge styling. Conditional color progression (grey → amber → green as a proxy for data quality) was explicitly rejected. Such progression would imply an upgrade from `'estimated'` toward `'actual'` at the display layer, violating the immutability rule. The label is a provenance annotation; its visual representation must be informationally equivalent across values.

**DEC-086-005 — Poison candidate is a display-only heuristic label:** `delivery_attempts >= 3 AND processed_at IS NULL` is labeled "poison candidate" as a pilot operational heuristic to surface stuck rows. It has no routing consequence, does not move rows to a dead-letter store, and confers no authoritative classification. The threshold (3 attempts) is a display parameter, not a relay or consumer contract boundary.

**DEC-086-006 — SQL-level `p_status` validation as second line of defence:** The RPC validates `p_status` against known values and raises `invalid_parameter_value` before executing the `RETURN QUERY`. This guard is independent of the API-layer 400 validation — it prevents misuse if the RPC is ever called directly via service-role tooling, seeds, or tests that bypass the route's input validation.

**DEC-086-007 — `staleTime: 30_000` on TanStack Query:** The observability surface is not a real-time dashboard. A 30-second stale time avoids hammering the database on every interaction while ensuring the data remains operationally current. Filters are committed on form submit rather than on keystroke to further reduce unnecessary fetches.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `wave-2/phase-2.3a/FIB-H-W2-OUTBOX-OBS-001-operational-outbox-observability.md` — scope authority |
| FIB-S | null — not generated for this phase (read-only observability slice) |
| PRD-086 | `docs/10-prd/PRD-086-wave2-phase-2.3a-operational-outbox-observability-v0.md` |
| EXEC-086 | `docs/21-exec-spec/EXEC-086-wave2-phase-2.3a-operational-outbox-observability.md` — 4 workstreams, no write path |
| Checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-086.json` — status: complete |
| Wave Tracker | `wave-2/WAVE-2-TRACKER.json` — cursor: 2.3, last_closed: 2.3a/PRD-086/EXEC-086 |
| Progress Tracker | `wave-2/WAVE-2-PROGRESS-TRACKER.md` — 2.3a row: ✅ COMPLETE |

**Governing ADRs (frozen):**
- ADR-052: Financial Fact Model — discriminator fields, class attribution rules
- ADR-054: Financial Event Propagation & Surface Contract — `origin_label` immutability (D5), surface contract
- ADR-056: Outbox write-path governance — SECURITY DEFINER enforcement, service-role gating

---

### Validation Results

| Gate | Result |
|------|--------|
| Turbopack compilation | PASS — "✓ Compiled successfully in 2.9min" |
| TypeScript check (`app/` + `components/` scope) | PASS — 0 new errors in application code |
| Lint | PASS — exit 0 after auto-fix of pre-existing Prettier issue in `app-sidebar.tsx` |
| Page output | PASS — `.next/server/app/(dashboard)/admin/outbox-observability/page.js` confirmed |
| Pre-existing type errors | 18 errors in `scripts/outbox-proof/` referencing `outbox_integration_proof_state` (local DB stale post-teardown); all pre-exist from PRD-082 teardown, none introduced by this slice |

---

### Phase 2.3a Gate Status

**COMPLETE.** All four workstreams delivered. Read-only admin surface live at `/admin/outbox-observability`. Cursor advanced to Phase 2.3. Phase 2.3 (PRD-087, Lifecycle-Aware Completeness Projection) is the next active track. Parallelization conditions remain in force.

**What is explicitly deferred:**

- Replay, retry, repair, or dead-letter routing controls — no write path will be added without a new PRD and FIB amendment
- `outbox_backlog_size` and `processing_lag_ms` relay log-line metrics — Phase 2.5
- Real-time/live-polling mode for the observability surface — not in Wave 2 scope
- Outbox row retention policy — Phase 2.5
- DEC-1 (`completeness.status: 'unknown'` on visit-level aggregates) — Phase 2.3 (PRD-087)
