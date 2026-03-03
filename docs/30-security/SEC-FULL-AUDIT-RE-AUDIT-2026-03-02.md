# SEC Full Audit Re-Audit (Delta Improvements Proposal)

**Date:** 2026-03-02  
**Target:** `SEC-FULL-AUDIT-2026-03-01-CONSOLIDATED-FINDINGS.md`  
**Purpose:** Re-audit the audit artifact itself; identify gaps/inconsistencies; propose concrete doc-level improvements.

---

## Consensus (Re-Audit)

The consolidated findings are **structurally strong** and **actionable**: clear grouping (RLS vs RPC/context vs GRANTs vs overloads), direct migration links, and a reasonable priority plan (P0/P1/P2; Sprint 1–3 sequencing).

However, the artifact still reads as **a narrative of issues** more than an **executable security contract**. The biggest missing pieces are:

- **Threat model / assumptions** (preconditions for exploitability) are implied but not explicit.
- **Acceptance criteria** per finding are not standardized, making “fixed” subjective.
- **Remediation decisions** remain ambiguous in a few key areas (audit_log write strategy; DEFINER governance).
- **Overload ambiguity checks** don’t fully encode the PostgREST + DEFAULT-arg hazard.
- **PUBLIC EXECUTE** risk is slightly under-framed (future-proofing against DEFINER/confused-deputy).

---

## Improvements & Gaps (What to Add / Tighten)

### 1) Add Threat Model / Assumptions (front matter section)

**Why:** Multiple P0s assert “anon” exploitability, but the audit does not state environment assumptions (public PostgREST, anon key availability, RLS enabled/forced). Severity reads “obvious” to you, but won’t read as rigorous to a reviewer.

**Add a short section like:**

- PostgREST endpoint is publicly reachable (typical Supabase model).
- Client includes anon key.
- RLS is enabled on all referenced tables (and not bypassed by table owners).
- Session context variables may be stale under pooling unless explicitly set.

If any assumption does *not* hold in a given environment, add a note: “Severity depends on X; adjust accordingly.”

---

### 2) Standardize Acceptance Tests per P0/P1 (make fixes provable)

**Why:** Current remediations describe *what to change* but not *how to verify behavior*.

**Add a sub-block for each P0/P1:**

- **Attack Preconditions**
- **Expected Behavior After Fix**
- **How to Test** (SQL snippets / PostgREST call examples)

**Examples:**
- **P0-1 staff read**:  
  - anon cannot `SELECT * FROM staff`  
  - staff in casino A cannot read casino B staff rows  
- **P0-2 audit_log insert**:  
  - anon cannot insert  
  - authenticated cannot insert with forged `casino_id`/`actor_id`  
  - if “RPC-only insert” is chosen: direct INSERT must fail; RPC insert must succeed  
- **P0-4 overload spoof**:  
  - `pg_proc` contains *only* safe signature(s)  
  - PostgREST call resolves uniquely; no ambiguity candidates  
- **P1 TOCTOU**:  
  - RPC sets context as first meaningful line  
  - regression harness simulates pooled connection with stale context and asserts correctness

---

### 3) Resolve a few remediation forks (pick a default path)

Some findings present multiple remediation strategies (good), but the audit should declare a **recommended default**, with the alternative labeled as “optional / future.”

**Key case: `audit_log` INSERT**
- Option A: strict RLS policy + role gate
- Option B: RPC-only writes (REVOKE direct INSERT)

**Proposed audit update:** explicitly recommend one (likely RPC-only for integrity), and note the other as acceptable if you truly need direct inserts.

---

### 4) Encode the DEFAULT-arg + PostgREST ambiguity hazard as a policy rule

You already call out why overloads + DEFAULT params are dangerous, but CI gates should match reality.

**Add to invariants/CI:**
- No exposed `rpc_*` may have overlapping signatures under named-arg resolution.
- Avoid DEFAULT args on exposed RPCs unless there is exactly one signature and it cannot overlap.

Also add a short “PostgREST-specific note” section explaining the named-arg matching + DEFAULT overlap problem in one paragraph.

---

### 5) Reframe “PUBLIC EXECUTE” as future risk, not just “schema info leak”

Current posture is “RLS blocks writes; mostly informational.” Tighten this:

- PUBLIC EXECUTE expands attack surface and error/timing side-channels.
- Becomes materially worse if any function is later made SECURITY DEFINER (confused deputy).
- Therefore treat as a **P1 hygiene gate** across all exposed functions.

---

### 6) Reduce self-referential dependency on downstream summaries

The cross-references include the “Consensus Improvements” doc. If the consolidated audit is meant to be standalone, this creates a loop: the audit referencing a derivative follow-up.

**Fix:**
- Either move the consensus improvements into an Appendix inside the consolidated audit, or
- clearly label it “derived follow-up artifact; not an upstream source.”

---

## Proposed Doc Additions (Minimal Sections)

1. **Threat Model / Assumptions** (½ page)
2. **Finding Template** for P0/P1:
   - Preconditions
   - Remediation
   - Acceptance Tests
   - Regression Guard (CI gate)
3. **Preferred Control Strategy**
   - Default: INVOKER + RLS, context from session/JWT
   - DEFINER usage policy (only when X; governance rules)
4. **PostgREST Signature Safety Notes**
   - No overlapping overloads
   - DEFAULT-arg overlap hazards

---

## Optional: CI Gate Enhancements (Align with Findings)

- Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented.
- Fail if any exposed `rpc_*` has more than one overload unless allowlisted.
- Fail if any exposed `rpc_*` contains identity params (`p_actor_id`, `p_casino_id`) unless allowlisted and justified.
- Fail if any exposed `rpc_*` is executable by PUBLIC.
- Fail if any exposed `rpc_*` has overlapping signatures under named-arg resolution (DEFAULT-arg ambiguity).
- Lint: “context set first meaningful line” for all security-relevant RPCs.

---

## Bottom Line

The consolidated audit is already a strong artifact. These changes would make it **review-proof** and **automation-ready**: explicit assumptions, measurable acceptance tests, clear default remediation choices, and CI gates that encode the PostgREST realities you’ve already tripped over.
