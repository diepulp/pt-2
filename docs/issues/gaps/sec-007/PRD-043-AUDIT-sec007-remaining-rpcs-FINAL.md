# PRD Final Audit — PRD-043: SEC-007 Remaining RPC `p_casino_id` Remediation (14 RPCs)

Date: 2026-03-04  
Artifact: `PRD-043-sec007-remaining-rpc-p-casino-id-remediation-v0.md` fileciteturn3file0

---

## Executive verdict

This is now a **ship-ready remediation PRD**: clear goal metrics, crisp D1–D4 slicing, hard requirements (FR-0), explicit delegation decision gates (FR-5/FR-6), catalog-truth scope rule (FR-7), and an operationally honest deploy story (NFR-1).

If you want one last tweak, it’s not structural—it’s **tightening the SQL pattern section so it can’t be misread as “SECURITY DEFINER everywhere.”** Everything else is appropriately mechanical.

---

## What’s locked in (strong)

### The PRD has a real “contract”
- Removes `p_casino_id` from signatures, derives tenant from session context, and fails closed without context. fileciteturn3file0L176-L185
- Eliminates PostgREST ambiguity by enforcing strict **DROP + CREATE** and explicitly forbidding `CREATE OR REPLACE`. fileciteturn3file0L186-L192
- Treats Postgres catalog as source of truth, not TypeScript grep (correct for compliance). fileciteturn3file0L228-L233

### Good sequencing and scope control
- D1/D2 unblocked (ship now), D3/D4 correctly blocked on business decisions. fileciteturn3file0L103-L129
- Clear, observable metrics for completion (G1–G5) that map to actual enforcement gates. fileciteturn3file0L52-L71

### Delegation is finally treated like a first-class risk
- You define acceptance criteria whether delegation is allowed or disallowed (audit attribution + authorization + tests). fileciteturn3file0L210-L227

### Operational honesty (rare, but correct)
- NFR-1 explicitly acknowledges the disagreement window and documents deploy order, failure mode, rollback, mitigation. fileciteturn3file0L237-L246

---

## Remaining issues (final nits worth fixing)

### 1) Appendix C implies SECURITY DEFINER as the default
Appendix C uses `SECURITY DEFINER` in the canonical example. fileciteturn3file0L542-L549  
But FR-2 correctly says “do not change existing SECURITY DEFINER/INVOKER posture unless explicitly called out.” fileciteturn3file0L186-L192

**Why it matters:** future implementers copy Appendix C and “upgrade” invoker functions to definer unintentionally.

**Patch suggestion (1 sentence):**
Add a line in Appendix C right above the example:

> “Use the existing SECURITY posture (DEFINER vs INVOKER) from the current function; the snippet shows DEFINER only as an example.”

And optionally show two mini-headers:
- “If SECURITY DEFINER → include `SET search_path = ...`”
- “If SECURITY INVOKER → omit SECURITY DEFINER; still `SET search_path` is optional per governance”

### 2) FR-0 “first executable statement” test needs a defined method
FR-0 requires a per-RPC assertion that context is set “before any data-reading statement.” fileciteturn3file0L176-L181  
That’s good, but a reviewer will ask “how exactly?”

**Patch suggestion:**
Add a small “Implementation note” under FR-0:

- either (a) a lightweight SQL check over `pg_get_functiondef(oid)` using a regex that ensures `set_rls_context_from_staff()` appears before the first `SELECT|INSERT|UPDATE|DELETE|PERFORM public\.`  
- or (b) a runtime integration test: call the RPC without setting context and assert it fails closed with “no casino context” before any reads.

Pick one and state it. Without it, “assertion” becomes vibes.

### 3) NFR-1 rollback instructions: clarify feasibility in Supabase Cloud
You say “revert the migration (re-CREATE old signature).” fileciteturn3file0L237-L246  
Supabase migrations are forward-only in practice; “rollback” here really means “hotfix forward migration that restores old signature.”

**Patch suggestion:**
Change wording from “revert” → “ship a forward hotfix migration that reintroduces the old signature.”

Same outcome, less confusion.

### 4) FR-3 callsite table: one entry looks like an HTTP wrapper
`services/player-financial/http.ts` listed for `rpc_create_financial_adjustment`. fileciteturn3file0L203-L208  
If that file calls an API endpoint and the server calls the RPC, grep on `.rpc(` might not find it.

**Patch suggestion:**
Under FR-3, add a single line:

> “Callsite audit must include server routes/edge functions that wrap RPC calls (not only direct `.rpc()` usage).”

You already imply this in FR-3, but making it explicit prevents false completion.

### 5) Appendix A entry for `rpc_issue_mid_session_reward`
It says “no production callsite found; verify catalog status.” fileciteturn3file0L429-L433  
This is fine because FR-7 makes catalog truth the rule. fileciteturn3file0L228-L233  
Just ensure PR D1 explicitly includes a “catalog query snapshot” in the PR description so reviewers don’t argue about whether it’s dead code.

---

## “Ship it” checklist (final)

If these are true, the PRD is complete and enforceable:

- [ ] FR-0 test method is specified (regex check or runtime test). fileciteturn3file0L176-L181  
- [ ] Appendix C clarifies SECURITY posture is illustrative, not prescriptive. fileciteturn3file0L186-L192 fileciteturn3file0L542-L549  
- [ ] NFR-1 wording reflects forward “hotfix migration” rollback reality. fileciteturn3file0L237-L246  
- [ ] D1 includes catalog snapshot proof for Tier-4 investigation items. fileciteturn3file0L103-L114 fileciteturn3file0L228-L233  

---

## Final conclusion

This PRD is basically done. Your last remaining risk isn’t technical—it’s **someone copying Appendix C and accidentally changing security posture**. Fix that sentence, specify how FR-0 is asserted, and you can stop thinking about this doc and go delete the allowlist like you meant to.
