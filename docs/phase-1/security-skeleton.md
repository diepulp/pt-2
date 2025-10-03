🛡 Phase 1 – Security Skeleton Week
🎯 Objective

Lay down the minimal security scaffolding (RLS, JWT, audit, compliance tables) so that core services can be built safely in Phase 2.
No gold-plating, no full compliance engine — just enough guardrails so nothing dangerous slips through.

Scope
✅ Must-Have (skeleton only)

Enable RLS

Turn RLS ON for all core tables (player, visit, ratingslip, casino).

Add deny-all baseline (no default access).

One simple policy: user_id = auth.uid() on player.

JWT Helpers (stub)

Create Postgres function jwt_get_role() returning "SUPERVISOR" by default.

Add enum StaffRole { SUPERVISOR, DEALER, PIT_BOSS, AUDITOR }.

Leave all but SUPERVISOR unused until Phase 2.

Audit Log (scaffold)

Create audit_log table with columns: id, action, actor_id, timestamp, metadata jsonb.

Add empty trigger function (to be wired later per domain).

Compliance Tables (stubs)

Create empty shells:

mtl_entry (id, casino_id, staff_id, created_at)

casino_settings (casino_id, gaming_day_start)

🚫 Out of Scope (defer until later phases)

Complex RLS role matrices (staff role enforcement).

JWT claims expansion (multi-role, tiered permissions).

Rich audit triggers per operation.

MTL thresholds, reporting, AML/CTR exports.

Acceptance Criteria

RLS ON by default.

One working “only owner can read/write” policy for player.

JWT helper exists, returns a hardcoded role.

audit_log, mtl_entry, casino_settings tables exist but not wired.

CI passes migrations + regenerated types.

Duration

2–3 days for 1–2 engineers.

Why This Works

Satisfies “Security First” PRD principle.

Avoids over-engineering → skeleton, not fortress.

Leaves Phase 2 free to focus on Player → Visit → Rating Slip vertical slices.

Ensures no service layer code is written with unsafe assumptions (e.g., wide-open tables).

⚡ This way, Phase 1 = Security Skeleton Week gives you a baseline safety net without draining weeks of effort. Full security/compliance hardening can wait until there’s something to protect.
