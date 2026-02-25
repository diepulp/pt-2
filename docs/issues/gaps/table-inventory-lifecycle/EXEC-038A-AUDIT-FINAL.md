---
doc: "EXEC-SPEC Audit (Final Pass + Folded Suggestions)"
target: "EXEC-038A-table-lifecycle-audit-patch"
date: "2026-02-25"
status: "Review"
sources:
  - "EXEC-038A-table-lifecycle-audit-patch.md"
---

# Audit (Final Pass): EXEC-038A — Table Lifecycle Audit Patch (Folded Suggestions)

Source: **EXEC-038A-table-lifecycle-audit-patch.md** fileciteturn7file0

This audit incorporates your pushbacks and folds only **scope-appropriate** corrections. Items that are truly **project-wide convention changes** are reduced to explicit **assumptions** (not patch demands).

---

## Verdict

**Ship-grade with minor clarifications.**  
The spec is internally coherent and already includes several of the previously requested fixes:
- open ≠ activate (activated_by remains NULL on open)
- `close_reason` back-compat plan is explicitly phased
- `close_note` constraint uses trimmed non-empty text
- ownership contract for `has_unresolved_items` is stated

Remaining work is mostly about preventing review confusion and making assumptions explicit.

---

## Accepted pushbacks (and how they’re handled)

### A) “Rename EXEC-SPEC” (previous P0-1)
Agreed: renaming is low value and doesn’t change implementation.

**Folded suggestion (minimal, high signal):**
- Add a **single scope line** near the top (Overview or Scope) to prevent misread:
  - “This is a **close governance + attribution delta**; pause/resume/rollover RPCs remain deferred.”

(Your doc already says these are out of scope, but a single headline sentence prevents reviewers from skimming into the wrong conclusion.)

### B) Role literals (previous P0-4)
Accepted as-is *for this patch* since you assert they match the existing `staff_role` enum and existing RPCs use the same pattern.

**Folded suggestion (no ADR required):**
- Add an **Assumption** bullet under Security Posture:
  - “Assumption: `current_setting('app.staff_role')` values match `public.staff_role` enum values; this patch follows established RPC gating pattern.”

This keeps the dependency explicit without forcing a convention change.

### C) `search_path = ''` (previous P1-3)
Accepted: this is a project-wide convention change and out of scope.

**Folded suggestion (scope-safe):**
- Keep `SET search_path = public`, but add one defensive note:
  - “SECURITY DEFINER RPCs MUST set a fixed `search_path` (public) and MUST NOT rely on caller search_path.”

### D) `closed_by_staff_id` existence (previous P1-4)
Accepted: remove as a finding (non-issue).

---

## Remaining issues (still worth adjusting)

These are not “project hygiene”; they directly affect correctness or review clarity.

### 1) Force-close role gate vs close role gate consistency
The spec says role gating applies to force-close (pit_boss/admin). For regular close, you currently describe guardrails but do **not** explicitly state whether close itself is role-gated or just governed by RLS (it *might* already be implicitly gated by who can call the RPC / by RLS context).

**Folded suggestion:**
- Add one sentence under `rpc_close_table_session` description:
  - “Close is available to the same roles as existing close workflows (unchanged). Force-close is additionally restricted to `pit_boss|admin`.”

(Keep behavior unchanged; clarify policy.)

### 2) Unresolved liabilities placeholder: tighten the contract wording
You correctly state write ownership: “Future Finance/MTL RPCs or service_role only.” Keep that, but make it unambiguous that TableContext cannot “clear” it via force-close.

**Folded suggestion (wording only):**
- “Force-close does **not** clear `has_unresolved_items`; it sets `requires_reconciliation=true` and records audit trail.”

### 3) Back-compat: ensure caller behavior is observable
You define Phase A/B/C plan, which is good. Add a tiny operational check to prevent Phase A from becoming permanent.

**Folded suggestion:**
- Add a WS4 test (or a monitoring note) asserting Phase A reality:
  - “New API route requires close_reason; legacy direct RPC callers may omit. Track NULL close_reason rate; Phase B triggers when it reaches ~0.”

No new code required; just a governance hook.

---

## What’s already correctly “folded” in the spec (confirmations)

These are items from the earlier audit that your current exec-spec already addresses well:

- ✅ **Open ≠ activate**: `rpc_open_table_session` is explicitly NOT modified; `activated_by_staff_id` stays NULL until an activate RPC exists. fileciteturn7file0
- ✅ **close_reason deprecation plan**: Phase A/B/C spelled out; DB nullable now, service layer requires for new calls. fileciteturn7file0
- ✅ **Trimmed note constraint**: check constraint uses `length(trim(close_note)) > 0`. fileciteturn7file0
- ✅ **Ownership contract**: `has_unresolved_items` is explicitly “Finance/MTL or service_role only”; TableContext reads only. fileciteturn7file0
- ✅ **Shared rundown persistence helper**: mitigation explicitly calls out shared helper to prevent drift. fileciteturn7file0

---

## Final patch list (minimal and scope-aligned)

1) Add a headline scope sentence: “close governance + attribution delta; pause/resume/rollover RPCs deferred.”  
2) Add Security Posture assumption: staff_role literals match enum values and established RPC pattern.  
3) Add SECURITY DEFINER note: fixed `search_path` set explicitly (public).  
4) Clarify close vs force-close role policy (force-close restricted; close unchanged).  
5) Clarify force-close does not clear unresolved items; it sets requires_reconciliation + audit trail.  
6) Add an operational governance hook for Phase B: track NULL close_reason rate / add test note.

---

## Final verdict

**Accept and implement.**  
No ADR-level convention changes are required to ship this patch safely; the remaining edits are clarity and governance guardrails, not architectural rewrites.
