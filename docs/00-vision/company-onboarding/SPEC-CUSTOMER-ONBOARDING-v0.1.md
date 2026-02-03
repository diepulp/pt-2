# EXECUTION-SPEC — CUSTOMER ONBOARDING v0.1 (PT‑2)

**Description:** This spec covers contracting/payment and operational rollout. Technical provisioning is defined in ONBOARDING v0.1. 
**Status:** Proposed  
**Date:** 2026-01-30  
**Scope Type:** Business/Operations + Provisioning handshake (NOT a billing platform)  
**Companion Docs:**  
- `EXECUTION-SPEC-ONBOARDING-v0.1` (Product/Technical tenant bootstrap + invites)  
- `COMPANY-RLS-GAP-v0.1` (company containment + casino active validation)  
- `AUTH-HARDENING v0.1` (context + bypass + WS5 revised)

---

## 0) Intent

Define the end-to-end onboarding lifecycle for a casino customer—from **contract signature and payment** to the point where PT is established as the **primary floor tracking tool** (within MVP boundaries).

This spec does **not** build a full CRM, subscription engine, or enterprise IAM. It defines:
- the **operational steps** you (vendor) run,
- the **handshake** into product provisioning,
- the **Definition of Done** for adoption (“primary tool”),
- the **minimum product features** required to support onboarding.

---

## 1) MVP Stance (anti-scope-creep)

### 1.1 Company is a billing/legal container, not a security boundary (v0.1)
- `casino_id` remains the **authorization boundary** (RLS boundary).
- `company` is metadata for contracting/billing identity only.
- Company-scoped RLS is **deferred** until relationships exist.

### 1.2 Billing is not a platform in v0.1
v0.1 supports:
- invoice/receipt tracking,
- “paid/unpaid” gating of provisioning,
- manual ops workflows.

v0.1 explicitly does NOT include:
- prorations, coupons, dunning, seat metering, usage billing,
- customer portal for invoices,
- automated collections.

---

## 2) Roles & Responsibilities (RACI-lite)

**Vendor (You)**
- owns provisioning, environment setup, training materials, and go-live support.

**Customer Stakeholders**
- **Exec sponsor (GM/Director):** approves success criteria and “primary tool” directive  
- **Operations lead (Shift manager/pit manager):** owns floor adoption and SOP enforcement  
- **Compliance lead:** validates audit posture and decides what stays on paper  
- **IT/Systems:** approves network/device access, if required  
- **Finance/AP:** handles invoice/ACH terms

---

## 3) Onboarding Phases & Deliverables

### Phase A — Contracting & Payment Gate

**A1. Discovery (fit + risk check)**
- Confirm the workflows PT will own in v0.1 (and what stays paper)
- Confirm compliance posture expectations (audit trail, exports, internal controls alignment)

**Deliverables**
- Scope + Success Criteria (1–2 pages)
- Explicit “MVP exclusions” list
- Implementation timeline draft

**A2. Contract Execution**
Minimum set:
- MSA
- Order Form (sites/casinos, seats, term)
- DPA (if required)

**A3. Payment Collection**
- Invoice sent (typical for casinos) OR ACH/CC processed
- Provisioning gate: **paid** or **PO approved** (choose one standard)

**Deliverables**
- Signed documents stored (vendor-side)
- Payment confirmation logged
- Provisioning ticket opened

**Exit Criteria**
- Contract signed
- Payment gate satisfied
- Customer assigns Ops lead + Admin contact email

---

### Phase B — Provisioning Handshake (ops → product)

**Goal:** move from “customer exists” to “tenant exists”.

**B1. Provision tenant**
- Create `company` record (legal/billing identity) *if you are using it*
- Create `casino` tenant (security boundary)
- Create initial admin staff binding (or invite)

**Important:** Do NOT block on a perfect company model. In v0.1:
- if `company` relationships are underdeveloped, you may record company name as casino metadata.

**Deliverables**
- Tenant created (`casino_id`)
- Admin created/bound OR invite issued
- Baseline settings created (`casino_settings`)

**Exit Criteria**
- Admin can log in
- RLS context succeeds
- Admin can access settings and invite staff

**Implementation Pointer**
This phase uses the companion technical spec:
- `rpc_bootstrap_casino` (create tenant + first admin)
- invite flows (`rpc_create_staff_invite`, `rpc_accept_staff_invite`)

---

### Phase C — Floor Configuration (minimum viable setup)

**C1. Configure the floor model**
- Tables / pits / areas (at minimum: table list + status)
- Game settings (limit / type / defaults)
- Staff roster + roles (admin, pit_boss, cashier, etc.)

**C2. Decide on “system of record” boundaries**
Write it down:
- What is entered in PT first?
- What stays paper for compliance/accounting?
- What is the fallback if PT is down?

**Deliverables**
- “Floor Ready” checklist completed
- Draft SOP: PT usage rules by role

**Exit Criteria**
- A pit boss can complete top 5 tasks in PT in under 5 minutes each
- Permissions match role responsibilities (no surprise denials)

---

### Phase D — Training & Pilot

**D1. Role-based training**
- Pit boss: player lookup, sessions/ratings, notes, rewards visibility
- Cashier (if applicable): transactions logging and exception handling
- Admin: staff management, settings, reports
- Compliance: audit logs, exports, review posture

**D2. Pilot shift (soft launch)**
- Pick one pit / subset of tables
- Run for 1–3 shifts
- Log issues; fix only the top blockers

**Deliverables**
- Training quick guides (1–2 pages per role)
- Pilot issue log + triage outcomes

**Exit Criteria**
- Pilot shift completes with PT used for agreed workflows
- Customer sponsor agrees to go-live date

---

### Phase E — Go‑Live as Primary Tool

**E1. Cutover**
- Communicate: “If it’s not in PT, it didn’t happen” (for the workflows PT owns)
- Freeze config changes during first live shift window
- Ensure support escalation path is known

**E2. Hypercare (2–4 weeks)**
- Daily check-ins week 1 (short)
- Weekly thereafter
- Track adoption metrics (see §4)

**Deliverables**
- Go-live announcement
- Hypercare schedule and escalation contacts

**Exit Criteria**
- Adoption metrics hit threshold
- Customer signs off “primary tool” status for MVP workflows

---

## 4) Adoption Metrics (MVP)

You do not need fancy analytics to detect failure. Track these:

- **Active staff users** per week, by role
- **# of visit/session entries** per shift
- **% of tables/areas** using PT (during pilot/go-live scope)
- **Exception count** (failed writes/permission errors)
- **Time-to-complete** key workflows (spot checks)

**Success thresholds (example)**
- Week 1: 60% of pilot scope shifts recorded in PT
- Week 2–3: 85%+
- Permission/denial errors trend to near-zero after week 1

---

## 5) Product Requirements (minimum to support onboarding)

### Must-have (blocks go-live)
- Tenant bootstrap (casino + settings + first admin)
- Staff invite + accept flow
- Role gates enforced by RLS
- Audit log for admin actions (at least create/update staff, settings changes)
- Export/report baseline needed by compliance/ops

### Nice-to-have (does not block)
- Email delivery automation for invites
- In-app onboarding checklist UI
- “Training mode” sandbox

---

## 6) Risks & Mitigations

**Risk: “We still use paper, PT is optional.”**  
Mitigation: define “primary tool” boundaries and enforce via SOP + sponsor directive.

**Risk: Data migration scope creep.**  
Mitigation: start clean; import only active players/table list; defer history.

**Risk: Permission denies during live shift.**  
Mitigation: pilot shift + role-based smoke tests; keep WS5 hybrid tables correct.

**Risk: Underdeveloped company schema causes confusion.**  
Mitigation: treat company as billing metadata only; keep security casino-scoped.

---

## 7) Definition of Done (Customer onboarded)

A customer is “onboarded” when:

- [ ] Contract signed and payment gate satisfied
- [ ] Tenant provisioned; admin can log in and invite staff
- [ ] Floor configuration complete for agreed scope
- [ ] Training completed for pit bosses (and other required roles)
- [ ] Pilot completed and go-live date executed
- [ ] PT used as primary tool for agreed workflows for ≥2 weeks
- [ ] Hypercare complete; open issues triaged into roadmap

---

## 8) Rollout Plan (vendor execution)

- Start with a single “pilot customer” playbook
- Iterate the checklists and SOP templates after each onboarding
- Keep product changes separate from operational changes (avoid mixing concerns)

