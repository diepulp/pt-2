1) Treat the database catalog as the source of truth

The allowlist should be generated from the catalog (or at least validated against it), not hand-maintained.

2) Fix WS6 allowlist: 10 → 14, drop 2 phantoms

Add these 6 RPCs (they carry p_casino_id and are not in P2-1 scope):

rpc_accrue_on_close

rpc_apply_promotion

rpc_get_player_ledger

rpc_manual_credit

rpc_reconcile_loyalty_balance

rpc_redeem

Remove these 2 entries (do not exist in catalog):

rpc_compute_gaming_day

rpc_apply_mid_session_reward

That yields: 8 existing correct matches + 6 added = 14 true allowlist entries.

3) Make WS6 flip “hard-fail” only for new violations

WS6 should behave like:

If p_casino_id exists on an RPC and it’s not allowlisted → FAIL (new violation)

If allowlisted → NOTICE (legacy/deferred)

If allowlist contains names not in catalog → WARN (stale/misleading), but don’t fail

This prevents both “pipeline nukes” and “false confidence.”

4) Add a guardrail that prevents this from drifting again

Add a CI check that compares:

catalog_rpc_with_p_casino_id vs allowlist

…and fails if:

catalog has names not allowlisted (unless you explicitly choose to treat that as “hard fail”)

allowlist contains names not in catalog (at least warn, optionally fail if you want it strict)

The exact SQL you should use to compute the list (catalog truth)

Run this in your gate script (or pre-gate helper):
```sql
-- RPCs that currently have a p_casino_id arg (public/graphql_public)
select
  n.nspname as schema,
  p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','graphql_public')
  and p.proname like 'rpc_%'
  and 'p_casino_id' = any(p.proargnames)
order by 1,2;
```
If you want schema-qualified allowlisting, allowlist by (schema, proname).

WS6 implementation plan (tight)

Here’s the plan I’d ship:

Prep PR (no behavior change)

Update allowlist to match catalog: +6, -2.

Add a validation query that prints:

“in catalog not allowlisted”

“in allowlist not in catalog”

Still keep SEC-003 at NOTICE-only.

Flip PR

Change SEC-003 to hard-fail for non-allowlisted p_casino_id RPCs.

Keep allowlisted as NOTICE.

Make the validator fail if “catalog not allowlisted” is non-empty (because that would immediately break hard-fail intent).

This is the only sequence that avoids getting trapped again.

Answering the agent’s last question

“Want me to plan WS6 implementation with corrected allowlist?”

Yes — but do it with the two-step PR above. Don’t flip enforcement in the same PR as the allowlist correction unless you enjoy CI roulette.

Drop-in patch for EXEC-041 WS6 allowlist
```diff
--- docs/21-exec-spec/EXEC-041-adr024-p2-validate-to-derive.md
+++ docs/21-exec-spec/EXEC-041-adr024-p2-validate-to-derive.md
@@
-  v_casino_id_allowlist text[] := ARRAY[
-    'rpc_create_financial_txn',
-    'rpc_create_financial_adjustment',
-    'rpc_issue_mid_session_reward',
-    'rpc_start_rating_slip',
-    'rpc_get_player_recent_sessions',
-    'rpc_get_player_last_session_context',
-    'rpc_get_rating_slip_modal_data',
-    'rpc_compute_gaming_day',
-    'rpc_apply_mid_session_reward',
-    'rpc_get_dashboard_tables_with_counts'
-  ];
+  v_casino_id_allowlist text[] := ARRAY[
+    'rpc_create_financial_txn',
+    'rpc_create_financial_adjustment',
+    'rpc_issue_mid_session_reward',
+    'rpc_start_rating_slip',
+    'rpc_get_player_recent_sessions',
+    'rpc_get_player_last_session_context',
+    'rpc_get_rating_slip_modal_data',
+    'rpc_get_dashboard_tables_with_counts',
+
+    -- Loyalty (deferred; still carries p_casino_id)
+    'rpc_accrue_on_close',
+    'rpc_apply_promotion',
+    'rpc_get_player_ledger',
+    'rpc_manual_credit',
+    'rpc_reconcile_loyalty_balance',
+    'rpc_redeem'
+  ];
```
What this does:

Removes: rpc_compute_gaming_day, rpc_apply_mid_session_reward (non-existent in catalog)

Adds: the 6 loyalty RPCs that would otherwise hard-fail immediately

That makes the allowlist match catalog reality today.

Strong recommendation: add a “catalog vs allowlist drift” check (prevents this repeating)

Right now, WS6 is fragile because the allowlist is hand-maintained. Add a tiny check in the WS6 gate script that computes the catalog set and compares it to the allowlist. Behavior I’d use:

FAIL if there are RPCs in catalog with p_casino_id that are not allowlisted (because hard-fail would nuke CI)

WARN/NOTICE if allowlist contains RPCs not in catalog (harmless but misleading)

If you paste the SEC-003 SQL gate file (supabase/tests/security/03_identity_param_check.sql or whatever you named it), I’ll give you the exact diff that implements this comparison cleanly.

Practical WS6 rollout sequence (so you don’t get trapped again)

PR 1: update allowlist to corrected 14 + add drift check (still NOTICE-only)

PR 2: flip hard-fail for non-allowlisted p_casino_id

That avoids “flip + surprise catalog mismatch” nuking your pipeline.