---
title: "Consolidated Review — PRD-040 & PRD-042 Admin Route Group"
date: 2026-03-04
status: Review Complete
reviewers:
  - Lead Architect (route group, SRM, dependency chain, OE-01)
  - Security Expert (RLS, auth pipeline, TOCTOU, defense-in-depth)
  - Devil's Advocate (spec gaps, inconsistencies, YAGNI, value prop)
  - Frontend Patterns (codebase verification, hook/DTO/schema state)
scope: PRD-040 v0.1.0, PRD-042 v0.4.0
verdict: "Ship with amendments — 0 P0 blockers, 9 P1 critical, 7 P2 important, 6 P3 advisory"
---

# Consolidated Review — PRD-040 & PRD-042 Admin Route Group

## Executive Summary

Four domain experts reviewed both PRDs in parallel. **No P0 blockers found.** Both PRDs are architecturally sound, security-adequate, and aligned with measurement surface guidance. However, **9 P1 findings** require resolution before implementation — primarily specification gaps, codebase reality mismatches, and security hardening. The dependency chain (layout → alerts → settings) is correct. OE-01 passes cleanly.

**Key themes across all reviewers:**
1. Context map §9.4 contradicts PRD route group placement — must be reconciled
2. WS0 backend scope is significantly larger than PRD-042 documents
3. Client-side alert dismiss may undermine the alerts page value proposition
4. JSONB read-merge-write has race conditions with no mitigation specified
5. Missing frontend infrastructure: AlertDialog, unsaved changes prompt
6. Role specification inconsistency across PRDs, SEC-001, and RLS policies
7. Testing requirements are thin for security-boundary features

---

## P1 Findings (9) — Must Resolve Before Implementation

### P1-1: Route Group Placement Contradiction
**Source:** Architecture, Devil's Advocate

Context map §9.4 says `app/(protected)/admin/`. Both PRDs say `app/(dashboard)/admin/`.

**Resolution:** `app/(dashboard)/admin/` is correct. The cashier layout at `app/(dashboard)/cashier/layout.tsx` is the precedent for role-scoped nested layouts. `(dashboard)` includes `LockScreenProvider` which benefits admin settings pages. Update context map §9.4 to: *"follow the existing `app/(dashboard)/cashier/` pattern for role-scoped nested layouts."*

### P1-2: WS0 Backend Scope Underestimated
**Source:** Frontend Patterns

PRD-042 describes WS0 as "~10 lines to connect." Actual scope:

| Item | File | Current State |
|------|------|---------------|
| `SETTINGS_SELECT` | `route.ts:31-32` | Inline string, missing `alert_thresholds` AND `updated_at` |
| `updateCasinoSettingsSchema` | `schemas.ts:31-52` | Missing `alert_thresholds` |
| `CasinoSettingsDTO` / return type | `dtos.ts` | Excludes `alert_thresholds` and `updated_at` |
| `UpdateCasinoSettingsDTO` | `dtos.ts:60-65` | Excludes `alert_thresholds` |
| HTTP fetcher return type | `http.ts:135-137` | Returns `CasinoSettingsDTO`, not `CasinoSettingsWithAlertsDTO` |
| GET handler return type | `route.ts:72` | Doesn't include `alert_thresholds` |

**Resolution:** Expand WS0 task list to cover all 6 items. Estimate ~30-40 lines, not ~10.

### P1-3: RPC → DTO Gap — `downgraded` Fields Require Enrichment Step
**Source:** Devil's Advocate

PRD-040 §5.1 requires displaying `downgraded` indicators. The RPC `rpc_shift_cash_obs_alerts` does NOT return `downgraded`, `downgrade_reason`, or `original_severity`. These are enriched client-side by `services/table-context/shift-cash-obs/severity.ts`.

**Resolution:** Add to PRD-040 §7.1: *"Alert data from `rpc_shift_cash_obs_alerts` is mapped through `severity.ts` guardrail functions before rendering. The `downgraded`, `downgrade_reason`, and `original_severity` fields are computed client-side."* Add severity mapping task to WS2.

### P1-4: Client-Side Dismiss Undermines Value Proposition
**Source:** Devil's Advocate

PRD-040 user story says "dismiss or acknowledge alerts" but implementation is ephemeral component/session state. Dismissed alerts reappear on refresh. Second supervisor sees all alerts un-dismissed. No audit trail, no shift handoff.

**Resolution (choose one):**
- (A) **Accept + reword:** Change user story to "hide alerts from my current view" and add FAQ about ephemeral behavior
- (B) **Use localStorage:** Survives refresh within same browser. Still no cross-user visibility
- (C) **Promote:** Defer dismiss to server-side persistence PRD. Ship alerts page as read-only view

### P1-5: Role Specification Inconsistency
**Source:** Security

Who can write casino settings?
- PRD-042 §1: "Requires admin role"
- PRD-040 role guard: allows `admin` + `pit_boss`
- RLS `casino_settings_update`: allows `admin` + `pit_boss`
- SEC-001: "Admin (`staff_role = 'admin'`) only"

**Resolution:** Standardize. Recommended: both `admin` and `pit_boss` can view admin pages and edit thresholds. Restrict `gaming_day_start_time` changes to `admin` only (high blast radius). Update SEC-001, PRD-042 §1, and PRD-040 §5.1 to match.

### P1-6: Missing Defense-in-Depth on PATCH Route
**Source:** Security

The PATCH handler at `route.ts:103-165` has no application-level role check. Role enforcement is entirely delegated to the `casino_settings_update` RLS policy. If that policy is ever misconfigured, any authenticated staff can write settings.

**Resolution:** Add ~3 lines to PATCH handler:
```typescript
const role = mwCtx.rlsContext!.staffRole;
if (!['admin', 'pit_boss'].includes(role)) {
  throw new DomainError('FORBIDDEN', 'Admin or pit_boss role required');
}
```

### P1-7: Missing AlertDialog Component
**Source:** Frontend Patterns

PRD-042 specifies confirmation dialogs before save. No `AlertDialog` component exists in the codebase. No `components/ui/alert-dialog.tsx` found.

**Resolution:** Install shadcn AlertDialog (`npx shadcn@latest add alert-dialog`) as a prerequisite task before WS2/WS3.

### P1-8: Missing Unsaved Changes Prompt Pattern
**Source:** Frontend Patterns

PRD-042 §5.1: "Navigation away with unsaved changes MUST prompt the user." No `beforeunload` or navigation-away prompt pattern exists anywhere in the codebase.

**Resolution:** Create a shared `useUnsavedChangesPrompt` hook (using `beforeunload` + Next.js router events). Add as WS1 prerequisite or early WS2 task.

### P1-9: Build Order Ambiguity — PRD-040 vs PRD-042
**Source:** Architecture

If PRD-042 ships first (builds its own layout per EXEC-042 WS1), navigating to `/admin` will 404 — no `page.tsx` at that level. PRD-040 later adds `/admin/page.tsx` redirecting to alerts.

**Resolution:** Whichever PRD ships first MUST create `app/(dashboard)/admin/page.tsx` with a redirect. If PRD-042 ships first, redirect to `/admin/settings/thresholds`. PRD-040 overwrites to redirect to `/admin/alerts`.

---

## P2 Findings (7) — Should Address, Won't Block

### P2-1: JSONB Race Condition with Concurrent Admins
**Source:** Devil's Advocate, Security

Read-merge-write pattern for `alert_thresholds` is last-write-wins. No optimistic concurrency control.

**Recommended:** Accept for MVP with documentation. Add `expected_updated_at` optimistic lock as follow-up if concurrent editing becomes a real issue. In practice, threshold configuration is infrequent and typically single-admin.

### P2-2: Off-Shift Alert Behavior Unspecified
**Source:** Devil's Advocate

No MUST statement for what happens when navigating to `/admin/alerts` outside shift hours. `useShiftAlerts` won't fire if window is null — page shows empty with no explanation.

**Recommended:** Add to PRD-040 §5.1: *"If no active shift window exists, the alerts page MUST display the most recent completed shift's alerts with a banner indicating the time window."*

### P2-3: Gaming Day Change — Warning May Be Insufficient
**Source:** Devil's Advocate, Security

Changing `gaming_day_start_time` mid-shift affects ~10 tables with computed `gaming_day` columns. A confirmation dialog provides no technical guardrail.

**Recommended:** Add application-level check: reject if any `table_session` with `status = 'open'` exists. ~5 lines in PATCH handler. Alternatively, restrict temporal changes to `admin` role only.

### P2-4: Sidebar Navigation Split Across Groups
**Source:** Architecture

Alerts/Reports under "Administrative", Thresholds/Shifts under "Other > Settings". All four are `/admin/*` routes but split across two sidebar groups.

**Recommended:** Address during implementation — move settings items under "Administrative" group or create "Admin Settings" child item.

### P2-5: SRM Documentation Gaps
**Source:** Architecture

`rpc_shift_cash_obs_alerts` not registered in SRM. `casino_settings.alert_thresholds` not in SRM schema invariants.

**Recommended:** Add both to SRM as documentation updates (~5 lines).

### P2-6: Testing Requirements Too Thin
**Source:** Devil's Advocate

2 unit tests + 2 E2E tests for security boundary + 8 threshold categories + JSONB patterns + gaming day config.

**Recommended:** Increase minimums:
- Role guard: 3 unit tests (authorized, unauthorized, missing `staff_role`)
- Threshold save: 2 unit tests (valid save, invalid value rejection)
- E2E: Add negative test for role guard redirect

### P2-7: `casino_settings` UPDATE Uses Category B COALESCE
**Source:** Security

Write-path uses JWT fallback via COALESCE pattern. Extending write surface to `alert_thresholds` increases blast radius of stale-JWT writes.

**Recommended:** Track as ADR-034 follow-up. Not blocking for this PRD since `withServerAction` enforces `withRLS` in the standard path.

---

## P3 Findings (6) — Advisory

| # | Finding | Source | Recommendation |
|---|---------|--------|----------------|
| P3-1 | Baseline config panel is YAGNI (no consumer exists) | Devil's Advocate | Defer to Phase 2 baseline service PRD, or justify per OE-01 §6 |
| P3-2 | `components/admin-alerts/` contradicts PRD-040 §2.3 non-goal | Devil's Advocate | Use colocated `_components/` pattern or domain-first `components/alerts/` |
| P3-3 | No error boundary / degraded state requirements | Devil's Advocate | Add NFR: "alerts page MUST display error state on RPC failure; badge MUST degrade gracefully" |
| P3-4 | Admin layout MUST remain server component for no-flash | Security | Add explicit note in implementation plan |
| P3-5 | Context map §12 open questions need disposition | Architecture | Q1 resolved (dashboard), Q3 resolved (stays), Q2/Q4 need closure |
| P3-6 | Document route guard vs RPC context derivation distinction | Architecture, Security | Add note to ADR-024 or SEC-002 clarifying two-layer pattern |

---

## Codebase Verification Summary (Frontend Patterns)

| PRD Claim | Status | Detail |
|-----------|--------|--------|
| Ghost nav at sidebar lines 101-105, 108-109, 124-125 | CONFIRMED | All four items verified |
| `useCasinoSettings()` returns `alert_thresholds` | INCORRECT | GET route `SETTINGS_SELECT` excludes it |
| `useUpdateCasinoSettings()` works for thresholds | PARTIAL | `UpdateCasinoSettingsDTO` type excludes `alert_thresholds` |
| `updateCasinoSettingsSchema` at schemas.ts:31-52 | CONFIRMED | Exists, missing `alert_thresholds` as documented |
| `updateAlertThresholdsSchema` at schemas.ts:276-290 | CONFIRMED | Exists, ready to wire |
| `AlertThresholdsDTO` at dtos.ts | CONFIRMED | All 8 categories + baseline match |
| `CasinoSettingsWithAlertsDTO` exists | CONFIRMED | Exists but unused by API/hooks |
| PATCH handler auto-passes validated fields | CONFIRMED | `.update(input)` pattern works |
| `useShiftAlerts()` reusable | CONFIRMED | Clean TanStack Query hook, adaptable |
| `useAuth()` provides `staffRole` | CONFIRMED | `appMetadata?.staff_role ?? null` |
| Cashier layout as precedent | CONFIRMED | Tab nav sub-layout pattern matches admin needs |
| react-hook-form + Zod pattern | CONFIRMED | `player-edit-form.tsx` reference implementation |
| AlertDialog component | NOT FOUND | Must install from shadcn |
| Unsaved changes prompt | NOT FOUND | No existing pattern in codebase |

---

## Recommended Pre-Implementation Checklist

Before starting build pipeline:

- [ ] **Resolve P1-1:** Update context map §9.4 to align with `app/(dashboard)/admin/`
- [ ] **Resolve P1-2:** Expand WS0 scope in PRD-042 to cover all 6 items
- [ ] **Resolve P1-3:** Document severity enrichment step in PRD-040 §7.1
- [ ] **Resolve P1-4:** Decide dismiss strategy (accept ephemeral / localStorage / defer)
- [ ] **Resolve P1-5:** Standardize role spec across PRDs, SEC-001, RLS
- [ ] **Resolve P1-6:** Add role check to PATCH handler (~3 lines)
- [ ] **Resolve P1-7:** Install shadcn AlertDialog
- [ ] **Resolve P1-8:** Plan `useUnsavedChangesPrompt` implementation
- [ ] **Resolve P1-9:** Decide build order (PRD-040 first or PRD-042 first)
- [ ] **Review P2s:** Accept or plan remediation for each

---

## Overall Verdict

**Ship with amendments.** Both PRDs are well-scoped and architecturally aligned. The P1 findings are resolvable with documentation updates, minor spec amendments, and ~20 lines of code (role check + schema wiring expansion). No design changes needed. The dependency chain is sound. OE-01 passes cleanly. Measurement surface guidance compliance is confirmed.

**Recommended build order:** PRD-040 first (layout + role guard + alerts), then PRD-042 (settings pages). PRD-040 establishes the infrastructure that PRD-042 depends on.
