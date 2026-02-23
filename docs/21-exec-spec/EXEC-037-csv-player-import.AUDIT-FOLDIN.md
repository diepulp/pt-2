---
title: Fold-In Audit — EXEC-037 CSV Player Import (Execution Spec Review)
target_doc: EXEC-037-csv-player-import.md
doc_type: audit_foldin
version: 1.0.0
date: 2026-02-23
status: ready_to_splice
---

# Fold-In Audit: `EXEC-037-csv-player-import.md`

This addendum folds the execution-spec audit findings into a splice-ready `.md` section.

## Executive verdict

**Implementable and close to green-light**, but tighten a few spec mismatches and one correctness footgun before coding.

**Primary must-fixes before implementation:**
1) Endpoint count mismatch (“6 endpoints” vs “4 route files”)  
2) Stage rows idempotency semantics (retry-safe behavior must be explicit)  
3) Execute failure handling contradiction (single-transaction rollback vs “mark batch failed”)

## What’s solid (keep)

- **Papa Parse worker backpressure reality** is correctly captured: pause/resume is not available with `worker: true`; abort is always available. This prevents a doomed “pause parsing while uploading” implementation. citeturn0search0turn0search4
- **CSV injection mitigation** is correctly specified using OWASP’s “Excel-resistant” tab-prefix approach for cells starting with `= + - @`. citeturn0search1
- **SECURITY DEFINER hardening**: require `security definer set search_path = ''` + schema-qualified references. Supabase explicitly recommends setting `search_path` for security definer functions, and Cybertec explains why (object shadowing/search_path abuse). citeturn0search2turn0search3

---

# Blockers / inconsistencies to fix

## 1) Endpoint count mismatch

**Problem:** WS4 states “6 API endpoints,” but only **4 route files** are listed (`/batches`, `/batches/[id]`, `/batches/[id]/rows`, `/batches/[id]/execute`).

**Fix (choose one):**
- Update language to **“4 endpoints (multiple methods)”**, OR
- Add the two missing endpoints and list their route files (e.g., `/batches/[id]/report`, `/batches/[id]/download`).

## 2) “6-step wizard” vs missing preview/report endpoints

**Problem:** The UI has 6 steps (File → Mapping → Preview → Upload → Execute → Report). The backend endpoint list does not explicitly include preview/report endpoints.

**Fix (add one sentence):**
> Preview and Report are derived client-side using `GET batch` + `GET rows` (and/or `batch.report_summary`) and do not require dedicated endpoints.

(Or add explicit `/report` and `/download` endpoints if you want server-rendered report/download behavior.)

## 3) Stage rows idempotency semantics are underspecified

**Problem:** You require `Idempotency-Key` on POSTs and mention a `(batch_id, row_number)` uniqueness pattern, but you do not state what happens if a chunk is retried.

**Fix (state explicitly in WS1 Stage RPC):**
- Either: `INSERT ... ON CONFLICT (batch_id, row_number) DO NOTHING` (retry-safe, immutable rows), OR
- `DO UPDATE` only while batch status is `staging` and row status is still mutable.

Also specify whether re-staging can overwrite `normalized_payload` or not (MVP recommendation: immutable once staged unless explicitly “reset batch”).

## 4) Execute failure handling contradiction (transaction semantics)

**Problem:** You state “single transaction rollback all writes” and also “set batch status to failed with error detail.” If done inside one transaction, the “failed” update rolls back too.

**Fix (document the pattern):**
- **Two-phase:** main work in transaction; on exception, catch and update `import_batch.status='failed'` in a separate transaction, OR
- Caller marks failed after RPC returns error (less ideal; error handling moves outward).

---

# Security + correctness clarifications (high leverage)

## 5) SECURITY DEFINER + RLS wording: make enforcement explicit

Add one clarifying line wherever SECURITY DEFINER RPC posture is described:

> RLS remains enabled as defense-in-depth; tenant scope and role authorization are enforced inside RPC bodies using derived session vars, with `security definer set search_path = ''` and schema-qualified references. citeturn0search2turn0search3

## 6) CSV injection sanitization: broaden triggers conservatively

OWASP states tab-prefix for `= + - @` and warns behavior differs across spreadsheet applications. citeturn0search1

**Recommended improvement for `csv-sanitize.ts`:**
- sanitize values starting with `= + - @`
- additionally sanitize values starting with `\t` or `\r` (carriage return/tab) for conservative compatibility (some ecosystems adopt this) citeturn0search1turn0search9turn0search12

---

# Operational nits (not blockers, but fix now)

## 7) Index plan needs explicit listing for “enrollment-first” scope

If execute resolves identity via joins through `player_casino` (enrollment-first scope), call out required indexes explicitly in the Exec Spec:
- `player_casino (casino_id, player_id)`
- identifier lookup index aligned to chosen table design (e.g., `(player_id, identifier_type, identifier_value_norm)`)

## 8) Dependency drift: pin required function signatures

If you depend on `set_rls_context_from_staff()` (or similar), document the expected signature and where it is introduced (migration/function name), so implementers don’t discover drift during integration.

---

# Minimal “before coding” checklist

- [ ] Fix endpoint count mismatch (“6 endpoints” vs listed routes)
- [ ] Define retry-safe staging semantics (`ON CONFLICT DO NOTHING` vs controlled update)
- [ ] Specify execute failure-handling pattern (two-phase or caller marks failed)
- [ ] Add explicit SECURITY DEFINER enforcement line (`search_path=''` + tenant checks)
- [ ] Expand CSV sanitization triggers to include `\t`/`\r` (recommended)

---

# Sources

- Papa Parse worker limitation: pause/resume only without worker; abort always available. citeturn0search0turn0search4  
- OWASP CSV injection tab-prefix mitigation for `= + - @` and warning of app variance. citeturn0search1  
- Supabase security definer guidance: must set `search_path`, empty path requires schema-qualified references. citeturn0search2  
- SECURITY DEFINER `search_path` abuse explanation: object shadowing risk; set `search_path` safely. citeturn0search3  
- Conservative CSV injection hardening (include `\t`/`\r`): ecosystem examples. citeturn0search9turn0search12  
