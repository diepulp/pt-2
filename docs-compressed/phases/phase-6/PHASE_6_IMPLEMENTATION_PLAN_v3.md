Phase 6 Plan RatingSlip MTL 2025-10-13 Deliver RatingSlip 6 Loyalty service mid-session rewards/LOYALTY_SERVICE_HANDOFF_SESSION_REWARD_SCHEMA_AUDIT

Preserve separation telemetry Loyalty reward Enable end mid-session adjustments Replace schema wave execution model quality gates ownership

Guiding Principles Canonical Docs Authoritative LoyaltyService changes point balances_ledger-Triggered Domains emit telemetry events_UPDATE Loyalty executes policy composite keys soft-success semantics rewards points reward captured_id_type_type RatingSlip closure loyalty accrual

Wave 0 Mandatory Schema Corrections Database Apply_6_wave_0_corrections Drop.points column_history table Rebuild_player_session without loyalty updates Create `loyalty_ledger CREATE TABLE loyalty_ledger player_id rating_slip_id visit_id transaction_type 'GAMEPLAY_BONUS event_type_SLIP_COMPLETED 'POINTS_UPDATE_REQUESTEDpoints_change NOT NULL reason source Add idempotency index docs UNIQUE INDEX_loyalty_ledger_session_type_source session_id NOT NULL Update `player_loyalty shape CREATE TABLE player_loyalty_id current_balance lifetime_points_progress CONSTRAINT_tier_progress_percent 0 100 Seed `loyalty_tier table referenced RPC Grant permissions LoyaltyService `loyalty_ledger_loyalty_tier migrate historical points tables new ledger deltas Legacy columns/tables removed New ledger schema indexes_player_session( references points Backfill verified spot checks

Track Overview Timeline (18–21h Focus Waves Loyalty horizontal Wave 0 1–2 RatingSlip integration API Waves 2–3 MTL vertical Wave 0 Waves 1–3

Wave Breakdown Wave 1 Loyalty Service Foundation 8h/loyalty/index.ts interface `calculateAndAssignPoints `manualReward query methods.ts PT-1 logic tier multiplier support.ts inserting ledger rows updating balances migration_loyalty_id delta_points_balance tier_loyalty row races `manualReward ledger row_type_BONUS CONFLICT index returns balance Calls RPC returns(newBalance Unit tests calculation parity manual reward >80% coverage/loyalty.ts `manualReward manual reward unchanged balance RPC update_balance_points Wave 2 Direct Service Integration (T0 T1) 7h COMPLETE Direct Service Invocation Pattern-001_2_COMPLETION_SIGNOFF servicesimplified pattern complexity 40% production reliability hardening Extension event bus 2nd consumer Schema hardening 6 columns 2 indexes RPC 11 columns Infrastructure libraries correlation idempotency rate-limiter-telemetry Server actions completeRatingSlip manualReward RatingSlip Loyalty recovery failures 41 unit tests quality gates Event listener registrations LoyaltyService_UPDATE

Schema RPC 11 columns snapshots infrastructure libraries 34 tests manualReward() rate limiting idempotency( recovery 0 errors 41 unit tests Integration tests deferred Wave 3 MTL 8-10h_3 Wave 2 APIs schema infrastructure complete Integration 8-test integration RatingSlip Loyalty workflows idempotency recovery Coverage >85% action code Permission Service permission placeholder staff_permissions table loyalty:award manualReward() tests authorization logic MTL UI Transaction entry form CTR threshold detection Compliance dashboard Loyalty widget 8/8 integration tests Permission service RBAC MTL UI WCAG 2.1 AA compliance Performance validated<500ms RatingSlip quality gates passed

Testing Monitoring Strategy Calculation logic ledger CRUD RPC Supabase Supabase server actions event direct calls Cypress flow manual reward session close logs loyalty mutation event player session delta transaction SQL queries_loyalty post-migration SQL script rebuild_loyalty rollback drills

Risk Mitigation Lock migrations before Wave 1 change scripts UPSERT timestamps events count RPC indices_loyalty monitor latency load testing Tool Rate-limit audit

LoyaltyService point mutations RatingSlip emits telemetry consumes loyalty_UPDATE pathway ledger metadata Idempotency mid-session rewards_loyalty accurate migrations real accruals MTL workflows loyalty APIs tests Observability dashboards loyalty-launch

Handoff Checklist Migration scripts approved Loyalty service package RatingSlip MTL teams trained APIs Rollback plan_loyalty Post-launch review zero drift ledger player balances
