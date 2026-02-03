# PRD — WIZARDS: TENANT BOOTSTRAP + INITIAL SETUP (v0.1)

**Status:** Draft  
**Date:** 2026-01-30  
**Product:** PT‑2 (Casino Player Tracker)  
**Primary Users:** Tenant Admin (casino admin), Operations Lead (pit manager), Implementation Owner (vendor-side)  
**Related Specs:**  
- `EXECUTION-SPEC-ONBOARDING-v0.1` (technical bootstrap RPCs + invites)  
- `EXECUTION-SPEC-CUSTOMER-ONBOARDING-v0.1` (commercial → rollout lifecycle)  
- `AUTH-HARDENING v0.1` (context + WS5 revised)  
- `COMPANY-RLS-GAP v0.1` (company containment posture)

---

## 0) Problem

PT onboarding/provisioning currently focuses on auth/tenancy mechanics, but lacks a guided path to:
- **create a usable tenant** (bootstrap), and
- **configure a working casino floor** (setup).

Without guided configuration, early customers either:
- stall (“blank system syndrome”), or
- misconfigure critical defaults (timezone/gaming day / table catalog / role gates), causing trust collapse on the floor.

---

## 1) Goals

### G1 — Fast tenant creation
Enable an authenticated user to create a new casino tenant and become its admin in **≤ 5 minutes**.

### G2 — Fast floor readiness
Enable an admin to configure a minimum viable floor (areas + tables + game defaults) in **≤ 30 minutes**.

### G3 — No scope creep into “admin console”
Wizards are for *first-run acceleration* and a few high-leverage defaults—not a full settings platform.

### G4 — Security and tenancy correctness
All wizard actions must respect the casino-scoped RLS model; no cross-tenant leakage.

---

## 2) Non-Goals (explicit)

- SSO/SAML/SCIM
- Subscription/billing engine, customer portal
- Company-as-security-boundary (company relationships + company-level RLS)
- Full “promo rule engine” (complex eligibility graphs, segmentation, scheduling automation)
- Full floor CAD/visual editor (drag/drop map, seat-level modeling)
- Migration of historical data beyond basic imports

---

## 3) Users & Jobs-To-Be-Done

### Tenant Admin
- “I need to create a tenant and invite staff.”
- “I need the system configured so my pit bosses can use it tonight.”

### Ops Lead / Pit Manager
- “I need tables and game defaults correct so tracking is frictionless.”
- “I need promos visible with simple guardrails, not a bureaucratic maze.”

### Vendor Implementation Owner (internal)
- “I need a repeatable onboarding path that reduces hand-holding.”

---

## 4) Product Shape: Two Wizards, One Flow

### Wizard A — Tenant Bootstrap Wizard (One-time)
**Purpose:** Create the tenant + first admin binding, and guarantee the app is usable.

- Runs **once** per tenant creation.
- Creates security boundary objects and minimal settings.
- May optionally seed placeholder data for pilots.

### Wizard B — Initial Setup Wizard (Repeatable)
**Purpose:** Configure operational defaults and floor configuration.

- Can be started immediately after Bootstrap, and re-run later.
- Idempotent: safe to revisit and modify.
- Provides a “Ready to run” checklist and highlights missing configuration.

---

## 5) Wizard A — Tenant Bootstrap Wizard (v0.1)

### 5.1 Entry Conditions
- User is authenticated (Supabase Auth).
- User does **not** already have an active staff binding (unless vendor explicitly supports multiple tenants per user; default: no).

### 5.2 Inputs (Minimal)
Required:
- Casino name
- Timezone
- Gaming day start

Optional:
- Casino legal name (metadata only)
- “Seed demo data” toggle (creates placeholder floor, optional)

### 5.3 Actions (Backend)
- Call `rpc_bootstrap_casino(...)` (SECURITY DEFINER) to create:
  - `casino`
  - `casino_settings`
  - initial `staff` admin binding (`auth.uid() → staff.user_id`)
- Ensure context derivation (`set_rls_context_from_staff()`) succeeds post-bootstrap.

### 5.4 Output
- A navigable tenant with a logged-in admin.
- CTA: “Continue to Setup Wizard”.

### 5.5 UX Requirements
- Single page (or 2-step max)
- Clear confirmation of tenant created
- If user already bound: show the tenant picker (future) or error (v0.1)

### 5.6 Success Metrics
- Time to complete: ≤ 5 minutes
- Bootstrap success rate: ≥ 95% without manual intervention

---

## 6) Wizard B — Initial Setup Wizard (v0.1)

### 6.1 Core Concept
A guided sequence of configuration steps. Each step is “good enough to run” and can be improved later.

### 6.2 Steps (v0.1)

**Step 1 — Floor Skeleton (Required)**
- Create areas/pits (simple list)
- Add tables:
  - name/number
  - area
  - game_type
  - initial status
- Minimal: allow CSV paste/import for table list.

**Step 2 — Game Defaults (Required-ish)**
- Defaults per game_type:
  - min/max limits (or a single “typical limit” field)
  - optional overrides per table
- Store in `game_settings` / `gaming_table_settings` as applicable.

**Step 3 — Promo Catalog (MVP Minimal)**
- Create promo types (match play / free play etc.) as catalog items:
  - name, type, default value, notes
  - optional `cooldown_minutes` (soft guardrail)
- No automation engine. Show warnings, not blocks.

**Step 4 — Staff Readiness**
- Invite staff (links to the invite flow from ONBOARDING v0.1)
- Confirm role assignments (admin/pit_boss/cashier)

**Step 5 — Ready-to-Run Checklist**
- Summarize missing config and what will break if missing
- Allow “mark ready” with warnings (no false perfectionism)

### 6.3 UX Requirements
- Multi-step wizard with save-and-exit
- Progress indicator + “incomplete steps”
- Fast entry controls (bulk add tables, CSV paste)
- Warnings over hard blocks unless a config would cause data integrity issues.

### 6.4 Success Metrics
- Time to “floor ready” for a typical single-pit pilot: ≤ 30 minutes
- First shift friction: < 3 critical “permission/denial” issues per shift

---

## 7) Data & Security Requirements

### 7.1 RLS & Context
All writes occur:
- via authenticated client paths using correct hybrid patterns (where applicable), or
- via SECURITY DEFINER RPCs when required (bootstrap, invite acceptance, privileged writes).

Wizard B uses tenant-scoped writes; it must not depend on cross-request `SET LOCAL` persistence.

### 7.2 Auditability
At minimum, log:
- tenant bootstrap event
- floor config changes (tables created/updated)
- promo catalog changes
- staff invites created/accepted

(Do not build a full observability context—just enough for support and compliance posture.)

---

## 8) Open Questions (v0.1 decision points)

1) Do we allow a single auth user to bootstrap multiple casinos?  
   Default: **no** in v0.1 (prevents accidental multi-tenant confusion).

2) Does “seed demo data” create:
   - one area + N tables only, or
   - include sample game settings and promos?  
   Recommendation: **area + tables only** for MVP.

3) Do we require game defaults before floor is marked ready?  
   Recommendation: yes (at least minimal defaults), but allow warnings.

---

## 9) Definition of Done (PRD-level)

- [ ] Wizard A ships and creates a usable tenant + admin
- [ ] Wizard B ships with floor skeleton + game defaults steps
- [ ] Promo catalog step exists with minimal schema usage (no rule engine)
- [ ] Staff readiness links exist (invite flow)
- [ ] Ready-to-run checklist exists
- [ ] RLS-safe writes verified; no cross-transaction context assumptions
- [ ] UX supports fast bulk entry (CSV/paste)
- [ ] Basic audit events exist

---

## 10) Phased Delivery Plan

**Phase 1 (PRD v0.1 scope)**
- Wizard A: Bootstrap tenant
- Wizard B: Step 1 + Step 2 + Checklist
- Staff invite link-out

**Phase 2 (v0.2)**
- Promo catalog step (minimal)
- Better bulk import + templates
- “Re-run setup” improvements

**Phase 3 (post-MVP)**
- If demanded: company relationships + company-level consolidated views
- If demanded: richer promo automation (still not a full engine unless paid for)

