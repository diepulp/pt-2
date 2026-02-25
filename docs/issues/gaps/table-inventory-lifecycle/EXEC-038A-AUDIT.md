---
doc: "EXEC-SPEC Audit"
target: "EXEC-038A-table-lifecycle-audit-patch"
date: "2026-02-25"
status: "Review"
---

# Audit: EXEC-038A — Table Lifecycle Audit Patch

Source: **EXEC-038A-table-lifecycle-audit-patch.md** fileciteturn6file0

## Verdict

**Good direction, but tighten scope and fix a few contradictions.**  
This patch reads less like “table lifecycle” and more like **close governance / compliance hardening** (guardrails, force-close, attribution columns). That’s fine—arguably the right priority—but you need to remove drift traps (role literals), clarify back-compat vs “required close_reason,” and fix attribution semantics so the DB doesn’t encode lies.

---

## What’s strong (keep)

1) **Close guardrail + privileged force-close**  
Blocking close on unresolved liabilities and providing a privileged override that sets `requires_reconciliation=true` and emits audit trail is the right operational pattern.

2) **Audit logging is mandatory for force-close**  
Good, explicit, testable.

3) **Shared helper for inline rundown persistence**  
Prevents divergence between close and force-close logic.

4) **UI out of scope**  
Correct; keep this DB/API hardening focused.

---

## P0 issues (must fix)

### P0-1: Scope/title mismatch (“table lifecycle” vs deferred lifecycle RPCs)

The patch adds attribution columns and close governance, but explicitly defers pause/resume/rollover RPCs. Rename the spec to reflect reality (or make lifecycle in-scope).

**Fix:**
- Rename to something like **“Table Session Close Guardrails & Attribution (PRD-038A delta)”**
- State clearly: “Lifecycle transition RPCs remain deferred; schema support only.”

### P0-2: `rpc_open_table_session` sets `activated_by_staff_id` (wrong semantics)

Open ≠ activate. Setting `activated_by_staff_id` at open pollutes attribution and breaks lifecycle clarity.

**Fix (choose one):**
- Add `opened_by_staff_id` and set that on open; OR
- Keep `activated_by_staff_id` but do not set it until `rpc_activate_table_session` exists.

### P0-3: Backward compatibility contradicts “close_reason required”

Spec says API requires `close_reason`, but risk mitigation + tests indicate close without `close_reason` should still succeed.

**Fix:**
Add a clear deprecation window:
- **Phase A:** DB allows NULL close_reason; app starts sending it.
- **Phase B:** enforce at service layer after rollout.
- **Phase C:** tighten DB constraints (optional) and remove legacy callers.

### P0-4: Hardcoded role literals (`pit_boss`, `admin`) reintroduce drift

Role checks must align with canonical `public.staff_role` enum values.

**Fix:**
- Replace literals with enum-aligned values (or a capability gate).
- Add: “Role values MUST match `public.staff_role`.”

---

## P1 issues (should fix)

### P1-1: `has_unresolved_items` needs an ownership contract

It blocks close but lacks definition for who sets/clears it and via what mechanism.

**Fix:**
- Define write ownership (e.g., Finance/MTL RPCs or service_role only).
- TableContext reads it; cannot toggle it except force-close side effects (`requires_reconciliation`).

### P1-2: Check constraint for `close_reason='other'` should enforce non-empty note

Current constraint allows whitespace/empty strings.

**Fix:**
- `close_reason <> 'other' OR length(trim(close_note)) > 0`

### P1-3: SECURITY DEFINER `search_path = public` conflicts with stricter convention

Align with your hardened posture.

**Fix:**
- Use `SET search_path = ''` and schema-qualify all objects (`public.table_session`, etc.).

### P1-4: `closed_by_staff_id` appears in behavior but not in the schema additions list

Spec should either confirm it already exists or include it in migration.

---

## P2 nits (optional)

- SRM update path: confirm it matches your canonical SRM file location/versioning.
- Terminology drift: “unresolved_liabilities” vs `has_unresolved_items` — choose one vocabulary and stick with it.

---

## Minimal patch list to ship

1) Rename spec/scope to match content (close governance patch).  
2) Fix attribution: add `opened_by_staff_id` or delay setting `activated_by_staff_id`.  
3) Add explicit deprecation plan for `close_reason`.  
4) Replace role literals with enum-aligned values.  
5) Define ownership/write rules for `has_unresolved_items`.  
6) Tighten `other` note constraint (trimmed non-empty).  
7) Align SECURITY DEFINER `search_path` to hardened convention; schema-qualify objects.  
8) Clarify `closed_by_staff_id` existence/addition.

---

## Final note

The pattern is right: guardrails + forced override + audit trail. Tighten the few contradictions and this becomes ship-grade governance rather than “nice ideas in a patch.”

