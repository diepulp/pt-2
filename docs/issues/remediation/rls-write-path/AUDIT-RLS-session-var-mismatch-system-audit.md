---
title: "Audit — RLS Session-Var Mismatch System Report"
doc_type: "audit_note"
version: "0.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "final"
audited_doc: "RLS-session-var-mismatch-system-audit.md"
related_docs:
  - "ISSUE-GAMING-TABLE-RLS-WRITE-POLICY-SESSION-VAR-ONLY.md"
  - "RLS-too-restrictive-session-vars-vs-jwt-fallback.md"
  - "ADR-030 (Category A session-var-only write posture)"
---

# Audit: RLS-session-var-mismatch-system-audit.md

This audit reviews the system report on the “session-var mismatch” failure mode (RPC sets `SET LOCAL` vars in one transaction; PostgREST DML runs in a new transaction and loses context). The report is largely correct and actionable, but it needs a few **sharpened constraints** and one crucial addition: **a machine-enforced guardrail** to prevent recurrence.

---

## What the report gets right

- **Root cause is correctly identified**: `SET LOCAL` is transaction-scoped; vars set in an RPC do not persist to subsequent PostgREST writes (new HTTP request → new transaction).
- **System-level blast radius is mapped** beyond `gaming_table` (e.g., `staff` active bug; `player_casino` latent fallback bug; the “player critical” spec gap).
- **The categorization lens is correct**:
  - **Category A**: session-var-only write posture (writes must occur in-RPC)
  - **Category B**: COALESCE session vars → JWT fallback (safe for PostgREST DML)

---

## Where the report is weak or risky

### 1) Service-role “fix” is a footgun (should be break-glass only)
The report presents “use service-role client” as an option for `staff` creation. It works, but it shifts security from RLS to app correctness. One bug and you can write cross-tenant data.

**Required tightening**
- Reframe service-role usage as **break-glass only**.
- Require compensating controls if ever used:
  - explicit server-side `casino_id` assertion
  - mandatory `audit_log` entry
  - dedicated abuse-case tests

### 2) Missing second failure mode: “silent no-op” writes
The mismatch class isn’t always a hard error; it can manifest as “0 rows affected” and be misinterpreted as success.

**Add invariant**
- “All write operations MUST assert affected rowcount ≥ 1, unless explicitly allowed.”

This catches RLS-deny-as-noop failures and prevents “silent success” bugs.

### 3) Category A definition is not enforceable yet (doc-only norm)
The report references Category A tables by migration context but does not define a contract that CI can check.

**Add enforceable contract**
- Category A tables MUST NOT be written via authenticated PostgREST DML in production code.
- Category A tables MUST have RPC entrypoints for all writes.
- CI must fail if violations are detected (see Guardrail section below).

### 4) “RPC layer BROKEN: 0” is too rosy without exception tests
The report notes “documented exceptions” (e.g., bootstrap / invite acceptance). Those are fine, but they are high-trust paths and need explicit abuse-case tests.

**Add requirement**
- Exceptions must have dedicated tests:
  - role misuse
  - cross-casino attempts
  - replay/idempotency where applicable

---

## Priority remediation (what to do next)

### P0 — Fix active production bug: `staff` write path
The report correctly flags `POST /api/v1/casino/staff` as authenticated PostgREST DML against a Category A table → guaranteed failure under transaction pooling.

**Recommended fix**
- Implement `rpc_create_staff` (SECURITY DEFINER) that:
  - validates caller role (admin)
  - derives `casino_id` from context/JWT
  - inserts staff row
  - writes `audit_log`
  - returns the created row

This preserves Category A posture and eliminates the mismatch.

### P1 — Remove/replace the `player_casino` fallback upsert
“Broken-but-rare” is still broken, and it will fail in the worst possible scenario (during operational load).

**Recommended fix**
- Remove the fallback PostgREST upsert path, or replace with `rpc_enroll_player` (atomic enrollment).

### P2 — Resolve ADR-030 “player is critical” spec gap
`player` currently works because it’s not tightened. If someone later “finishes ADR-030,” this incident repeats.

**You must choose**
- Either remove `player` from Category A list and standardize COALESCE/JWT fallback, OR
- Move all `player` writes into RPC and then tighten policies.

---

## The missing piece: a machine-enforced guardrail (must-have)

The report itself hints that there is no automated check that prevents the mismatch from being reintroduced. Without enforcement, this will recur.

### Minimum viable CI guardrail
- Maintain a list of Category A tables (from ADR-030 or a single canonical config file).
- Static scan (grep/AST) for patterns like:
  - `supabase.from('<category_a_table>').insert|update|upsert`
  - specifically when using the authenticated client (`mwCtx.supabase`, request-scoped supabase client, etc.)
- Fail CI with file/line and remediation:
  - “Category A table writes must occur inside RPC (session-var-only posture).”

### Companion invariant (also enforceable)
- Ensure all write operations check affected rowcount and treat 0 as error unless explicitly allowed.

---

## Bottom line

The system report is correct on the core mechanism and surfaced the right blast radius. To fully close the loop, it needs:
1) stricter guidance on service-role usage (break-glass only),
2) explicit prevention of silent no-op writes,
3) a CI-enforced Category A contract,
4) explicit tests for privileged RPC exceptions.

Without #3 (guardrail), this will remain a recurring failure class.

