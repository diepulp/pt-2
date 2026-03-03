# SEC Full Audit (Updated) — Re-Audit Notes (Fold-In)

**Date:** 2026-03-02  
**Target:** `SEC-007-tenant-isolation-enforcement-contract.md` (formerly `SEC-FULL-AUDIT-2026-03-01-CONSOLIDATED-FINDINGS.md`)  
**Purpose:** Re-audit the updated consolidated audit and record remaining gaps + concrete improvements.

---

## Consensus (Updated Audit)

The updated consolidated audit is **materially stronger**: it reads like an **operational security contract** rather than a narrative.

### What’s now solid
- **Threat model / assumptions are explicit** and correctly tied to severity framing (PostgREST reachability, anon key exposure, FORCE RLS assumptions, pooling staleness, DEFINER implications).
- **P0 acceptance tests are concrete** (SQL-level behavior + PostgREST expectations).
- **Remediation defaults are clear** (notably for `audit_log` insert strategy, with an explicit alternative).
- **PostgREST signature safety** is explicitly captured (DEFAULT + named-arg ambiguity translated into a policy rule).
- **CI gate list** now aligns with real failure modes (deprecated context usage, overload ambiguity, PUBLIC execute hygiene, permissive true policies).

**Net:** this version is review-proof for P0 severity and direction.

---

## Remaining Gaps (Still Worth Fixing)

### 1) Acceptance tests don’t define “casino A context” setup
Many tests reference “casino A context” without specifying the canonical mechanism to establish it:
- JWT fixtures (`app_metadata.casino_id`, `staff_role`)
- calling `set_rls_context_from_staff()` / internal setter
- session variables for psql testing

**Why it matters:** different readers will interpret setup differently, and the tests become arguable.

**Add:** a single **Test Harness Setup** section (one-time) describing:
- how to run as anon vs authenticated in psql
- how to set context deterministically (recommended path)
- example JWT fixtures (if used) or the canonical context setter call sequence

---

### 2) `audit_log` “RPC-only writes” recommendation needs the RPC contract pinned
The audit recommends constraining `audit_log` inserts to RPC lanes (ideally DEFINER), but does not specify:
- which RPC(s) are authoritative entrypoints
- required parameters (minimal)
- invariants (actor_id/casino_id derived; caller cannot forge)
- allowed/blocked columns

**Add:** a short **Audit Log Write Lane** subsection:
- entrypoint(s)
- server-only columns and derived values
- explicit anti-forgery invariant

---

### 3) P1/P2 items remain narrative; add acceptance tests where risk is real
P0 now has great acceptance criteria; P1/P2 are still backlog bullets.

**Add at minimum:** acceptance blocks for P1 items that involve:
- cross-tenant read paths (audit/report)
- TOCTOU / pooling hazards
- promo tables WITH CHECK scoping

**Goal:** make “fixed” objective, not “looks good.”

---

### 4) CI gates are listed, but implementation locus is undefined
You enumerate good gates, but the doc doesn’t specify:
- where they run (GitHub Actions? local pre-merge?)
- what they inspect (ephemeral migrated DB? pg_proc/pg_policies snapshots?)
- how “context set first line” is enforced (SQL parser vs grep heuristic vs AST tooling)

**Add:** a **CI Implementation Notes (v1)** section:
- minimal viable approach: `supabase db reset` in CI + SQL assertions querying `pg_policies`/`pg_proc`
- a migration grep gate for deprecated context function usage
- optional snapshot/diff approach for `pg_proc` and `pg_policies`

---

### 5) Cross-reference self-dependency mostly fixed; keep it strict
The audit correctly labels “consensus improvements” as downstream/derived, but ensure it’s unambiguous that:
- findings are sourced to migrations/catalog evidence
- cross-refs are implementation aids, not upstream inputs

**Add:** a short note in Cross-References: “Downstream artifacts; not evidence sources.”

---

## Recommended Additions (Minimal, High ROI)

1. **Test Harness Setup** (context + auth fixtures)
2. **Audit Log Write Lane Contract**
3. **Acceptance Test blocks for highest-risk P1**
4. **CI Implementation Notes (v1)**

---

## Verdict

**Pass** for structure, rigor, and P0 operationalization.  
Remaining work is about making P1/P2 as testable as P0, and preventing bike-shedding by defining exactly how “casino context” is established in tests and CI.
