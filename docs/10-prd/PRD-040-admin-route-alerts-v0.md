---
id: PRD-040
title: Admin Route Group — Layout, Role Guard & Alerts Page
owner: Engineering
status: Draft
affects: [ADR-024, ADR-030, SEC-001, SEC-002]
created: 2026-03-03
last_review: 2026-03-03
phase: Phase 5 (Administrative Infrastructure)
pattern: A
http_boundary: false
scaffold_ref: docs/00-vision/admin-route/ADMIN_ROUTE_GROUP_CONTEXT.md
adr_refs: [ADR-024, ADR-030]
---

# PRD-040 — Admin Route Group: Layout, Role Guard & Alerts Page

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Build the admin route group infrastructure (`/admin` layout with role-based access guard) and the first admin page — `/admin/alerts` — for alert drill-down, history, and acknowledgment. Four sidebar navigation items currently point to non-existent routes (ghost nav). The alerts backend (`rpc_shift_cash_obs_alerts`) is fully implemented. This PRD delivers the route infrastructure prerequisite and the highest-value unblocked page. Scoped to P0 (layout + role guard) and P1 (alerts page) from the context map.

---

## 2. Problem & Goals

### 2.1 Problem

The admin route group was planned in PRD-021 (archived, never implemented). Four sidebar items in `components/layout/app-sidebar.tsx` point to non-existent routes — clicking them leads to 404s. The alert system backend is fully operational (`rpc_shift_cash_obs_alerts`, severity guardrails, `casino_settings.alert_thresholds` JSONB), but there is no dedicated surface for alert management, history, or acknowledgment. The Shift Dashboard shows a condensed alerts strip for real-time monitoring, but supervisors have no way to review, investigate, or dismiss alerts outside the shift context.

No route-level role enforcement exists anywhere in the application. Both `(dashboard)` and `(protected)` layouts check for authenticated session presence only — any authenticated user can access any route regardless of `staff_role`.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Admin route group exists with role-based access control | Users with `staff_role` of `dealer` or `cashier` are redirected away from `/admin/*` routes |
| **G2**: Alerts page displays all cash observation alerts for the current shift window | `/admin/alerts` renders alert list matching `rpc_shift_cash_obs_alerts` output |
| **G3**: Sidebar ghost nav for Alerts resolves to a working page | Clicking "Alerts" in sidebar navigates to `/admin/alerts` without 404 |
| **G4**: Sidebar alert badge shows live count | Badge displays count of unacknowledged `warn` + `critical` alerts, not hardcoded `0` |

### 2.3 Non-Goals

- `/admin/reports` page (blocked by ADR-039 Phase 1 migrations — separate PRD)
- `/admin/settings/thresholds` or `/admin/settings/shifts` (P2/P3 — separate PRD)
- Alert persistence or acknowledgment backend (no new tables/RPCs — UI-only dismiss with client state)
- Shift Dashboard relocation to `/admin/shift` (stays at `/shift-dashboard` permanently)
- Root `middleware.ts` role enforcement (layout-level guard is sufficient for this scope)
- New `components/admin/` namespace (components live alongside existing patterns)

---

## 3. Users & Use Cases

- **Primary users:** Shift supervisors (`pit_boss`), casino management (`admin`)

**Top Jobs:**

- As a **shift supervisor**, I need to review all cash observation alerts for the current shift so that I can investigate anomalies that the dashboard strip flagged.
- As a **shift supervisor**, I need to see alert details (entity, observed value, threshold, severity, downgrade indicators) so that I can assess whether floor action is needed.
- As a **casino manager**, I need to hide reviewed alerts from my current view so that I can focus on unreviewed items during my session. *(Note: dismiss is session-scoped — alerts reappear on page refresh or new session. Server-side persistent acknowledgment requires a future `alert_acknowledgment` table; see §7.2.)*
- As a **casino manager**, I need to access admin pages knowing that dealers and cashiers cannot reach them so that configuration and alert management remain supervisor-controlled.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Admin Infrastructure (P0):**
- Admin route group at `app/(dashboard)/admin/`
- Admin layout with role guard checking `staff_role` against allowed roles (`admin`, `pit_boss`)
- Redirect unauthorized roles to `/` (or previous page)
- Admin index page (`/admin`) redirecting to `/admin/alerts`

**Alerts Page (P1):**
- `/admin/alerts` page rendering full alert list for configurable time window
- Alert detail cards: entity label, entity type (table/pit), observed value, threshold, severity badge, message, downgrade indicators
- Severity filtering (all / critical / warn / info)
- Sort by severity (critical first, default) or by entity
- Dismiss/acknowledge action per alert (client-side state — dismissed alerts hidden from count and list for session duration)
- Empty state when no alerts exist for the window

**Sidebar Wiring:**
- Live alert badge count on "Alerts" nav item (count of `warn` + `critical` severity alerts)
- Replace hardcoded `badge: 0` with query-driven count

### 4.2 Out of Scope

- Server-side alert acknowledgment persistence (future — requires `alert_acknowledgment` table)
- Alert notification system (push, email, sound)
- Historical alert trends or charts
- Reports page, settings pages (future PRDs)
- Threshold configuration UI

---

## 5. Requirements

### 5.1 Functional Requirements

- The admin layout MUST check `staff_role` from session claims and deny access to roles other than `admin` and `pit_boss`.
- The role guard MUST work on both server render (layout-level `getUser()` check) and client navigation (redirect or fallback).
- `/admin` MUST redirect to `/admin/alerts`.
- `/admin/alerts` MUST call `rpc_shift_cash_obs_alerts` with the current shift time window and render results.
- Each alert card MUST display: `entity_label`, `entity_type`, `observed_value` (formatted as currency), `threshold` (formatted as currency), `severity` badge, `message`, and downgrade indicators when `downgraded === true`.
- The severity filter MUST allow selecting one or more severity levels without page reload.
- The dismiss action MUST remove the alert from the visible list and decrement the sidebar badge count for the session duration.
- The sidebar badge count MUST query alert data and display the count of unacknowledged `warn` + `critical` alerts. `info` alerts do not count toward the badge.
- If no active shift window exists, the alerts page MUST fall back to the most recent completed shift window and display a banner indicating the time range shown.
- The admin layout MUST be a server component (not `'use client'`) to guarantee the no-flash redirect via `redirect()` before any HTML is sent.

### 5.2 Non-Functional Requirements

- Alert list fetch MUST complete within the existing Supabase RPC latency budget (< 500ms p95 for typical casino with < 50 tables).
- Sidebar badge query MUST NOT block sidebar render — display skeleton or `0` until loaded.
- Role guard redirect MUST happen before page content renders (no flash of admin content for unauthorized users).

> Architecture details: See SRM v4.11.0 (table-context bounded context), ADR-024 (context derivation), ADR-030 (auth pipeline hardening).

---

## 6. UX / Flow Overview

**Flow 1: Admin Access (Role Guard)**
1. Authenticated user clicks "Alerts" or "Reports" in sidebar
2. Server layout checks `user.app_metadata.staff_role`
3. If `admin` or `pit_boss` → render admin layout + requested page
4. If `dealer` or `cashier` → redirect to `/` with no flash

**Flow 2: Alert Review**
1. Supervisor navigates to `/admin/alerts`
2. Page loads alert list for current shift window (same time window logic as Shift Dashboard)
3. Alerts render sorted by severity (critical → warn → info)
4. Supervisor clicks severity filter chip to narrow view (e.g., "Critical only")
5. Supervisor clicks "Dismiss" on a reviewed alert → alert fades, badge decrements
6. Supervisor returns to shift dashboard for real-time monitoring

**Flow 3: Sidebar Badge**
1. Sidebar renders with alert badge showing skeleton
2. Background query fetches alert count for current shift window
3. Badge updates to count of unacknowledged `warn` + `critical` alerts
4. On dismiss action from alerts page, badge decrements reactively

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **`rpc_shift_cash_obs_alerts`** — Fully implemented (migration `20260107020746`). No changes needed. **Note:** The RPC returns base alert fields (`alert_type`, `severity`, `entity_type`, `entity_id`, `entity_label`, `observed_value`, `threshold`, `message`, `is_telemetry`). It does NOT return `downgraded`, `downgrade_reason`, or `original_severity` — these are enriched client-side by the severity guardrail mapping in `services/table-context/shift-cash-obs/severity.ts`. The alerts page MUST wire the same severity enrichment step used by the Shift Dashboard.
- **`casino_settings.alert_thresholds`** — JSONB column exists (migration `20260106235906`). Read-only for this PRD.
- **`useAuth()` hook** — Returns `staffRole` from `app_metadata`. Exists at `hooks/use-auth.ts`.
- **`CashObsSpikeAlertDTO`** — Fully typed at `services/table-context/dtos.ts`. The `downgraded?`, `downgrade_reason?`, and `original_severity?` fields are optional because they are populated by the client-side severity enrichment step, not the RPC.
- **`useShiftAlerts()` hook** — Exists at `hooks/shift-dashboard/use-shift-alerts.ts` (30s stale, 60s refetch). Can be reused or adapted. Note: this hook already wires severity enrichment.
- **`AlertsPanel` component** — Exists at `components/shift-dashboard/alerts-panel.tsx`. Can inform the admin alerts page design but is not reused directly (different layout, more detail).

### 7.2 Risks & Open Questions

- **Client-side dismiss is session-scoped** — Dismissed alerts are stored in React component state (or localStorage for refresh persistence). They reappear in new browser sessions. This is intentional for P1: the page's primary value is alert review and investigation, not acknowledgment workflow. A second supervisor will see all alerts independently — there is no shared dismiss state. If persistent cross-user acknowledgment becomes a requirement, a follow-up PRD adds an `alert_acknowledgment` table with server-side state. **FAQ: "Why do dismissed alerts come back?"** Answer: "Dismiss hides alerts from your current view. Persistent acknowledgment is planned for a future release."
- **Shift window coupling** — The alerts page uses the same shift time window as the Shift Dashboard. If no active shift window exists (outside operating hours, between shifts), the alerts page MUST display the most recent completed shift's alerts with a banner: "Showing alerts from [date] [shift window]". The fallback window is derived from the most recent `shift_checkpoint` record.
- **Badge query duplication** — The sidebar badge and the alerts page both query `rpc_shift_cash_obs_alerts`. React Query deduplication (same query key) prevents double-fetching if both are mounted simultaneously.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `/admin/alerts` renders alert list from `rpc_shift_cash_obs_alerts` for current shift window
- [ ] Severity filter (all/critical/warn/info) works without page reload
- [ ] Dismiss action hides alert from current view and decrements sidebar badge (session-scoped; reappears on refresh unless localStorage persistence is used)
- [ ] Sidebar "Alerts" badge shows live count of `warn` + `critical` alerts (not hardcoded `0`)

**Security & Access**
- [ ] Admin layout role guard denies access to `dealer` and `cashier` roles
- [ ] No flash of admin content before redirect for unauthorized roles
- [ ] Role check uses authoritative `staff_role` from session claims (ADR-024), not client-spoofable state

**Data & Integrity**
- [ ] Alert data matches `rpc_shift_cash_obs_alerts` output exactly — no client-side data transformation that alters severity or thresholds
- [ ] Downgrade indicators display correctly when `downgraded === true`

**Testing**
- [ ] Unit tests for role guard logic: (1) authorized role (`admin`) renders, (2) unauthorized role (`dealer`) redirects, (3) missing/malformed `staff_role` redirects
- [ ] At least one happy-path E2E test: navigate to `/admin/alerts`, verify alert list renders
- [ ] At least one negative E2E test: unauthorized user navigating to `/admin/alerts` is redirected without flash

**Operational Readiness**
- [ ] Ghost nav items (`/admin/alerts`, `/admin/reports`) no longer 404 — alerts resolves, reports can show "Coming Soon" or redirect to alerts
- [ ] Sidebar badge degrades gracefully (shows `0` or skeleton) if alert query fails

**Documentation**
- [ ] Known limitation documented: dismiss is client-side only, resets on refresh

---

## 9. Related Documents

- **Context Map**: `docs/00-vision/admin-route/ADMIN_ROUTE_GROUP_CONTEXT.md`
- **Measurement Surface Guidance**: `docs/00-vision/strategic-hardening/PT2_Measurement_Surface_Guidance.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.11.0, table-context bounded context)
- **Schema / Types**: `types/database.types.ts` — `rpc_shift_cash_obs_alerts`, `casino_settings`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Auth Pipeline**: ADR-024 (context derivation), ADR-030 (auth pipeline hardening)
- **Archived PRD**: `docs/10-prd/_archive/PRD-021-admin-dashboard-ui.md` (superseded by this PRD)
- **Staleness Audit**: `ADMIN_ROUTE_GROUP_CONTEXT.md` §9 (ADMIN_DASHBOARD_STYLISTIC_DIRECTION.md staleness)

---

## Appendix A: Existing Infrastructure Reference

### RPC Signature

```sql
CREATE OR REPLACE FUNCTION public.rpc_shift_cash_obs_alerts(
  p_start_ts TIMESTAMPTZ,
  p_end_ts   TIMESTAMPTZ
) RETURNS TABLE (
  alert_type     TEXT,
  severity       TEXT,
  entity_type    TEXT,
  entity_id      TEXT,
  entity_label   TEXT,
  observed_value NUMERIC,
  threshold      NUMERIC,
  message        TEXT,
  is_telemetry   BOOLEAN
)
```

### DTO (existing)

```typescript
// services/table-context/dtos.ts
export interface CashObsSpikeAlertDTO {
  alert_type: 'cash_out_observed_spike_telemetry';
  severity: 'info' | 'warn' | 'critical';
  entity_type: 'table' | 'pit';
  entity_id: string;
  entity_label: string;
  observed_value: number;
  threshold: number;
  message: string;
  is_telemetry: true;
  original_severity?: 'info' | 'warn' | 'critical';
  downgraded?: boolean;
  downgrade_reason?: 'low_coverage' | 'no_coverage';
}
```

### Role Enum

```typescript
// types/database.types.ts
staff_role: "dealer" | "pit_boss" | "cashier" | "admin"
```

### Sidebar Ghost Nav (current state)

```typescript
// components/layout/app-sidebar.tsx:101-105
{ title: 'Alerts', url: '/admin/alerts', icon: Bell, badge: 0 }
// TODO: Connect to real alert count
```

---

## Appendix B: Implementation Plan

### WS1: Admin Route Group + Role Guard (P0)

- [ ] Create `app/(dashboard)/admin/layout.tsx` — server component, checks `staff_role`, redirects unauthorized
- [ ] Create `app/(dashboard)/admin/page.tsx` — redirect to `/admin/alerts`
- [ ] Verify ghost nav URLs in sidebar resolve without 404

### WS2: Alerts Page (P1)

- [ ] Create `app/(dashboard)/admin/alerts/page.tsx` — server component shell
- [ ] Create alert components colocated at `app/(dashboard)/admin/alerts/_components/` (alert list, alert card, severity filter)
- [ ] Create or adapt React Query hook for alerts page context (may differ from `useShiftAlerts` in stale time / refetch behavior)
- [ ] Wire severity enrichment step from `services/table-context/shift-cash-obs/severity.ts` — RPC output MUST pass through guardrail mapping before rendering to populate `downgraded`, `downgrade_reason`, `original_severity`
- [ ] Implement off-shift fallback: if no active shift window, query most recent `shift_checkpoint` window and show banner
- [ ] Implement dismiss action with React state or localStorage (session-scoped, not Zustand — avoids ADR-035 `resetSessionState` requirement)
- [ ] Handle empty state and loading state (skeleton)
- [ ] Handle error state (RPC failure → error boundary, not crash)

### WS3: Sidebar Badge Wiring (P1)

- [ ] Replace `badge: 0` in `app-sidebar.tsx` with live query result
- [ ] Create `useAdminAlertCount()` hook (or reuse `useShiftAlerts` with select transform)
- [ ] Badge shows count of `warn` + `critical` only, excludes dismissed alerts

### WS4: Remaining Ghost Nav (P1)

- [ ] `/admin/reports` — placeholder page or redirect to `/admin/alerts` with "Coming Soon" indicator
- [ ] `/admin/settings/thresholds` and `/admin/settings/shifts` — placeholder or redirect

---

## Appendix C: Context Map Corrections

The source context document (`ADMIN_ROUTE_GROUP_CONTEXT.md` §3.4) states "`gaming_day` and `shift` tables exist." Investigation reveals:

- **`gaming_day`** is not a standalone table — it is a computed date column (`gaming_day: string`) present on `mtl_entry`, `pit_cash_observation`, `shift_checkpoint`, `rating_slip`, `table_session`, etc. The value is derived via `compute_gaming_day()` RPC.
- **`shift`** is not a standalone table — `shift_checkpoint` is the closest equivalent, storing per-shift aggregate snapshots.

This correction is relevant for the future Settings: Shift Schedules PRD (P3) — configuring shift temporal boundaries operates on `casino_settings.gaming_day_start_time` and `shift_checkpoint` windows, not dedicated `gaming_day` / `shift` tables.

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-03 | Engineering | Initial draft — P0 + P1 scope from context map |
| 0.2.0 | 2026-03-04 | Engineering | P1 review fixes: (1) documented severity enrichment step for downgrade fields in §7.1; (2) reworded dismiss user story — session-scoped view hiding, not persistent acknowledgment; (3) added off-shift fallback requirement (most recent completed shift window); (4) added server component constraint for no-flash guarantee; (5) expanded testing requirements (3 role guard unit tests + negative E2E); (6) colocated components pattern (`_components/`) replacing `components/admin-alerts/`; (7) added error state handling to WS2 |
