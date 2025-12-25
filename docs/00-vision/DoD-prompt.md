The ADR-022 has drifted into endless entropy of "almost done". The Vague Defininition of Done has led to endless cycle of discovering edge-cases. The feature boundary statement needs to be formulated, which
 becomes the header for PRD + Exec Spec. Everything else is subordinate. Define boundary + gates → implement → prove gates → ship → iterate. Right now the “almost there” loop happens because ADR-022 is 
carrying three jobs at once:

Durable decisions (“we store doc id as hash+last4”, “actor binding is DB-enforced”)

Implementation detail (specific policies, triggers, indexes)

Definition of Done (security + integrity + operability proof). FInbd out if ADR-022 contains durable, still-correct decisions: tenant isolation is enforced with Postgres RLS, RBAC uses JWT claims (Supabase’s 
documented baseline), acknowledge RLS bypass risks (owner/BYPASSRLS) and mitigate appropriately. If so the endless loop of fixes is stopped by containing the ADR and moving the endless fixes into validation 
gates + tests. 1. Freeze ADR-022 as “Decision Record Only”

Keep: goals, non-goals, invariants, security stance, cross-context contract notes.

Remove/relocate: exact RLS policies, trigger bodies, index lists, migration steps. 2. Create an Execution Spec (implementation detail)

Put the evolving stuff here. It’s allowed to change. 3. Create a DoD Gate Checklist (the finish line)

Security gates: role matrix proves “dealer cannot read identity”, etc.

RLS gates: tests must run under non-owner/non-bypass roles (because table owners and BYPASSRLS bypass RLS; Postgres is explicit about this). 
PostgreSQL
+1

Pooling gates: prove it works under your production pooling mode (session vars vs transaction scoping) 4. Automate the gates

If it’s not executable in CI, it’s not a gate; it’s a wish.

This is the only reliable way to end the “almost there” drift. Refer to @docs/00-vision/PT-2_FEATURE_PIPELINE_LINEAR_DoD.md aid to create definitive feature pipeline, and end the endleess 'almost there' 
fallacy, prevent scope creep.