---
title: "Audit Notes — EXECUTION-SPEC-SEC-REMEDIATION-2026-02-19"
doc_id: SEC-EXEC-AUDIT-2026-02-19-FOLDED
date: 2026-02-19
timezone: America/Los_Angeles
applies_to: EXECUTION-SPEC-SEC-REMEDIATION-2026-02-19.md
status: "audit-folded"
---

# Summary Verdict

**Almost shippable, but not yet.** There are **three correctness gaps** (one is a migration-breaking SQL syntax issue), plus a small set of hardening tweaks to reduce security regression and “local pass” theater.

This document folds the audit findings into concrete corrections and acceptance checks.

---

# P0 Fix List (Must Do Before Ship)

## 1) WS1 test snippet is internally inconsistent

### Problem
The snippet mixes two incompatible patterns:

```ts
expect(violations).toEqual([]);
if (violations.length > 0) throw new Error(...)
```

If `violations.length > 0`, the `expect` already fails and the `throw` may be unreachable / redundant.

### Correction
Choose **one**:

- **Throw-only** with a detailed message (recommended), **or**
- **Expect-only** with no custom detail, **or**
- Use an assertion helper that supports messages (Jest default does not).

### Acceptance
- WS1 uses exactly one deterministic assertion pattern.
- Failure output includes either a clear custom message (throw-only) or standard expect output (expect-only).

---

## 2) WS4 migration SQL has invalid FUNCTION REVOKE syntax

### Problem
The spec uses:

```sql
REVOKE ALL ON FUNCTION ... FROM authenticated;
```

That is **invalid** in Postgres function privilege syntax.

### Correction
Use the correct form everywhere WS4 manipulates function privileges:

```sql
REVOKE ALL ON FUNCTION function_name(arg_types...) FROM role_name;
GRANT EXECUTE ON FUNCTION function_name(arg_types...) TO role_name;
```

### Acceptance
- WS4 migration runs without syntax errors.
- Privileges are verified via `\dp+` / catalog query for each targeted function.

---

## 3) WS4 “Path B (Modified)” contradicts itself

### Problem
WS4 states Path B requires **renaming** `p_actor_id` → `p_internal_actor_id` and revoking authenticated on any RPC that accepts it, but the example gate code still references `p_actor_id` and retains the legacy bypass branch.

### Correction
Make WS4 explicitly choose one consistent implementation:

**Option 1 (Preferred: split public vs internal)**
- Public RPC(s): no actor param (authenticated)
- Internal RPC(s): `*_internal(p_internal_actor_id ...)` (service_role only)
- Wrapper(s) provided for authenticated callers

**Option 2 (Single function)**
- Keep the 3-param signature service_role-only
- Provide authenticated wrapper(s) without the actor param
- Ensure gates reference the correct param name consistently

### Acceptance
- WS4 contains **one** coherent approach.
- No authenticated-callable function accepts a spoofable actor param.
- Naming matches implementation (`p_internal_actor_id` if used).

---

# Security Hardening (High Priority)

## 4) “service_role impersonation” needs at least one extra invariant

### Problem
Allowing service_role to supply actor IDs is an operational convenience (tests / server calls), but it’s also an escape hatch that can enable accidental cross-tenant metrics if misused.

### Correction (minimum)
If `p_internal_actor_id` (or equivalent) exists, add at least one guardrail:
- Require and validate `p_casino_id` matches staff’s casino, **or**
- Assert the actor belongs to the resolved casino scope, **or**
- Require a server-only session var (`app.internal_call = 'true'`) in addition to `current_user = 'service_role'`.

### Acceptance
- service_role cannot compute metrics for an actor outside the resolved casino scope.
- Internal calls are clearly separated or strongly gated.

---

# Operational / Buildability Tweaks (Recommended)

## 5) “CI grep gate” needs definition

### Problem
Spec claims “no production TS changes required” verified by a grep gate, but doesn’t define scan scope or patterns robustly.

### Correction
Define:
- directories scanned (e.g., `app/`, `lib/`, `services/`, excluding `__tests__/`)
- RPC names targeted
- fail condition (presence of `p_actor_id` / removed fields in `.rpc()` arg objects)

Keep **typegen + type-check** as the definitive backstop.

### Acceptance
- grep gate catches obvious old-arg usage
- typegen + `npm run type-check` passes post-migration

---

## 6) WS3 testing plan should note the post-WS4 follow-up

### Problem
WS3 says shift-metrics tests use service_role until WS4, but doesn’t explicitly require updating tests after WS4 if wrappers/overloads change.

### Correction
Add a single line to WS3:
- “After WS4, update tests to use authenticated wrapper overloads unless metrics RPCs are explicitly internal-only.”

### Acceptance
- tests match the new API boundary and role grants after WS4

---

## 7) WS6 DO-block should explicitly require transaction semantics

### Problem
Spec implies transaction wrapping, but the shown approach is a DO-block. Depending on migration runner, you may or may not get transactional safety.

### Correction
Add a requirement:
- “Migration must run within a transaction; abort on first failure; no partial apply.”

### Acceptance
- failure yields rollback; no partial search_path changes

---

# Optional Polishing

- WS2: add a quick verification step that no server paths call P0 RPCs via service_role before removing that grant.
- TG-2: prescribe one approach for heredoc/grep/sed to avoid half-implemented scripts.

---

# Final Ship Gate

Before marking **READY**:
- [ ] WS1 assertion pattern fixed (single deterministic style)
- [ ] WS4 privilege SQL corrected and migration dry-run passes
- [ ] WS4 Path B made coherent (or replaced with split internal/public)
- [ ] service_role impersonation hardened (scope invariant added or internal split)
- [ ] grep gate scope defined + typegen/type-check passes
- [ ] post-WS4 tests updated or explicitly designated internal-only
- [ ] search_path migration transactional requirement documented
