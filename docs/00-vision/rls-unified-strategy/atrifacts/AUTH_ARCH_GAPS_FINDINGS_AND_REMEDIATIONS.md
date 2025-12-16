# Player Tracker Auth Architecture — Gap Findings & Remediation Notes

**Date:** 2025-12-14  
**Scope:** Authentication + authorization architecture as currently discussed (Supabase RLS + connection pooling + RPC workflows).  
**Tone:** Blunt, on purpose.

---

## Executive summary

You currently have a **mismatch** between:

- **Transaction pooling** (requests hop across pooled connections/transactions), and
- An auth pattern that assumes **“session context set once, reused later”** (e.g., via `SET LOCAL` / session vars + `current_setting()`).

This yields a recurring failure mode: **RLS context isn’t reliably present when later RPCs run**, because *there is no “later” session* under transaction pooling.

There are two tracks:

- **Patch (MVP-safe):** make every RPC **self-sufficient** in the same transaction (JWT-derived or self-injected context).
- **Overhaul (clean end-state):** go **JWT-first/JWT-only RLS** (Supabase “native” style), and treat session vars as optional/legacy.

---

## Current conceptual model (as implemented / implied)

### What the system *wants* to do
1. A request arrives.
2. Middleware calls something like `set_rls_context(...)` to set:
   - `app.casino_id`, `app.actor_id`, `app.staff_role`, etc.
3. The request then performs several DB operations / RPC calls that assume those values exist.

### Why pooling breaks it
With **transaction pooling**, DB calls may run on **different connections** and **different transactions**.
So the “context set earlier” is **not guaranteed** to exist when later statements execute.

---

## Gap findings

### GAP 1 — “Sticky context” assumption under transaction pooling
**Symptom:** RLS checks (or RPC preconditions) fail because session vars are missing.

**Root cause:** Session vars set in one transaction are not reliably available in another transaction under pooling.

**Impact:** Any multi-step workflow (close → reopen, create → mutate, etc.) can fail intermittently and will be painful to debug.

---

### GAP 2 — Ambiguous execution identity (user JWT vs service role)
**What goes wrong:** JWT-only patterns depend on the DB seeing the **caller’s JWT**.

If you sometimes run requests with **service role** (or a server-side client that bypasses user JWT), then:
- `auth.jwt()` / `auth.uid()` may be empty/irrelevant for user claims, or
- authorization becomes “trust the server” (which is fine for system-path, not fine for user-path).

**Impact:** You can “solve” pooling but accidentally create a bigger security hole: user actions executed as service role.

---

### GAP 3 — SECURITY DEFINER RPCs bypass RLS (easy footgun)
**Fact:** `SECURITY DEFINER` functions can bypass RLS depending on owner/role settings.

**Impact:** If you rely on RLS for protection, but a function runs as a privileged role, RLS can be effectively irrelevant unless you re-check authorization inside the function.

**Operational consequence:** You end up with “we have RLS” on paper, but privileged RPCs quietly become the real gatekeepers.

---

### GAP 4 — RPCs are not treated as trust boundaries / transaction boundaries
Right now, RPCs are being used as operations, but not consistently as:
- A single transaction boundary, and/or
- A trust boundary that must validate identity/claims itself.

**Impact:** Bugs manifest as “context missing” rather than “authorization contract explicit.”

---

### GAP 5 — Over-reliance on implicit context (magic variables)
When authorization depends on magic values (`current_setting(...)`) rather than explicit, verifiable inputs (JWT claims or validated args), it becomes:
- harder to reason about,
- easier to break,
- easier to “fix” incorrectly.

---

### GAP 6 — Audit/observability is not a first-class part of auth
If privileged paths exist (service role endpoints, SECURITY DEFINER), then:
- audit logs are part of the auth system, not a nice-to-have.

**Impact:** Without audit correlation (actor_id, casino_id, request_id), you can’t prove what happened or debug reliably.

---

## Patch vs overhaul (what this really is)

### Patch (MVP-friendly): stop the bleeding without rewriting everything
**Goal:** Ensure every DB operation that depends on context has it **within its own transaction**.

Acceptable patch patterns:

1) **Self-inject inside each RPC**
- At top of each RPC, set required context (`set_config(...)` / call `set_rls_context(...)`) using values derived from JWT or verified args.
- Pro: minimal app churn.
- Con: still a “session vars” model, just localized.

2) **Pass context as RPC args + verify against JWT**
- RPC signature includes `casino_id`, `actor_id`, maybe `role`.
- RPC verifies these against `auth.jwt()` claims (never trust caller-provided args alone).
- Pro: explicit contract, easier to test.
- Con: more signature surface area; discipline required.

3) **Wrapper RPC for multi-step flows**
- Example: `rpc_close_and_restart_slip(...)` does close+start in one transaction.
- Pro: solves the specific workflow class nicely.
- Con: doesn’t fix other future multi-call flows unless you wrap those too.

**What makes it a patch:** RLS still depends on session vars *somewhere*, and architectural ambiguity remains unless you enforce identity separation and authorization rules.

---

### Overhaul (clean end-state): JWT-first/JWT-only authorization (Supabase-native)
**Definition:** Authorization context is derived from the JWT on every statement:
- `casino_id`, `staff_role`, `actor_id` from `auth.jwt()` / `auth.uid()`
- RLS policies don’t need `current_setting(...)` to function correctly
- Pooling becomes a non-issue because nothing needs to “persist” across transactions

**What changes:**
- RLS policies migrate to JWT claims
- RPCs use JWT context, not session vars
- App calls must reliably pass user JWT for user-path operations

**What makes it an overhaul:** It changes the **source of truth** for authorization and forces consistency across services.

---

## Recommended approach (sound, high-level)

### 1) Enforce a strict identity model
- **Human identity:** Supabase Auth (`auth.users`)
- **Domain actor:** `staff` row (your canonical actor)
- JWT includes:
  - `casino_id`
  - `staff_role`
  - (optionally) `staff_status`
- Decide whether JWT `sub` is `staff.id` or you map `auth.users.id → staff.id`, but don’t half-do both.

### 2) Make tenancy non-negotiable
- Everything that matters is `casino_id` scoped.
- RLS is the default enforcement mechanism for user-path queries.

### 3) Split execution paths cleanly
- **User-path:** uses **user JWT**, **RLS enforced**, `SECURITY INVOKER` by default.
- **System-path:** uses **service role**, may bypass RLS, but is rare, guarded, and heavily audited.

### 4) Treat RPCs as trust boundaries
For each RPC, pick exactly one of:
- **Invoker RPC:** relies on RLS + JWT claims; minimal privileged behavior.
- **Privileged RPC (definer):** does its own explicit authorization checks + writes audit logs.

### 5) Adopt a migration posture
- **Now (MVP):** Patch (make RPCs self-sufficient under pooling).
- **Next:** Move policies and RPCs toward JWT-first until session vars become unnecessary.

---

## Concrete MVP remediation checklist (no code)

### A. Fix pooling mismatch (choose one)
- [ ] RPCs self-inject context (localized)
- **or**
- [ ] RPCs accept explicit args and verify vs JWT
- **or**
- [ ] wrapper RPCs for multi-step flows (plus one of the above for future-proofing)

### B. Stop identity leakage
- [ ] Ensure user-path calls always execute with a real user JWT
- [ ] Ensure service-role is server-only and never used for normal user actions

### C. Police SECURITY DEFINER usage
- [ ] Inventory all `SECURITY DEFINER` functions
- [ ] For each: decide if it must exist; if yes, add explicit authorization checks + audit trail
- [ ] Prefer `SECURITY INVOKER` unless there is a very clear reason

### D. Audit as a contract
- [ ] Audit log includes `actor_id`, `casino_id`, `request_id`, `action`, `object_id`
- [ ] Privileged actions must be auditable and attributable

---

## Decision heuristic (quick and dirty)

- If you want **MVP velocity**: patch pooling mismatch inside RPCs today.
- If you want **boring reliability long-term**: migrate to JWT-first/JWT-only as the enforcement baseline.
- If you find yourself adding more middleware context hacks: you’re paying interest on technical debt.

---

## Risks if you don’t address this
- Intermittent auth failures that look like “random DB bugs”
- Security drift (service role creeping into user paths)
- RLS gives false confidence while definer RPCs do the real gating
- Audit gaps that make compliance and incident response a nightmare

---

## Suggested next artifacts (docs you should have)
- **ADR:** “Authorization Source of Truth (JWT-first with pooling)”
- **Inventory:** list of RPCs with `SECURITY DEFINER/INVOKER` classification
- **Policy spec:** standard RLS templates per bounded context (Casino/Player/Visit/Finance/MTL/Loyalty)
- **Threat model (lite):** service role boundaries + privileged RPC authorization expectations
