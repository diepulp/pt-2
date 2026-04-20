-- ADR-050 §4 E3 — Publication membership activation for FACT-RATED-BUYIN / shift-dashboard
-- Purpose: Add public.table_buyin_telemetry to the supabase_realtime publication so that
--          the canonical shift-dashboard realtime hook (hooks/shift-dashboard/
--          use-shift-dashboard-realtime.ts) can receive postgres_changes events.
--
-- ADR:         docs/80-adrs/ADR-050-financial-surface-freshness-contract.md §4 E3
-- PRD:         docs/10-prd/PRD-068-adr050-phase1-shift-dashboard-freshness-pilot-v0.md
-- EXEC-SPEC:   docs/21-exec-spec/EXEC-068-adr050-phase1-shift-dashboard-freshness-pilot.md (W0)
-- Audit ref:   f52d34ca (P0.2 Publication-Membership Audit — confirmed NO financial
--              table was a member of supabase_realtime prior to this migration; this
--              is the one-time backfill per ADR-050 §Risks point 2)
--
-- Affected:    public.table_buyin_telemetry (publication membership only — NO schema change,
--              NO trigger change, NO RLS change, NO index change). Pattern C RLS on TBT
--              already verified casino-scope isolation (P0.1b sweep).
--
-- Reversibility:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.table_buyin_telemetry;
--
-- NFR3 note: Rolling this migration back demotes the REGISTRY_FINANCIAL_SURFACES row
--            for FACT-RATED-BUYIN / shift-dashboard from ACTIVE back to PROPOSED, and
--            re-opens Phase 1 exit criterion #1. Keep in mind that existing running
--            environments may already have TBT in the publication (added out-of-band
--            by tooling); the idempotent guard below handles both states.
--
-- Idempotency: This migration is safe to re-run. The DO-block checks
--              pg_publication_tables before issuing ALTER PUBLICATION, so repeat
--              execution on an environment where TBT is already a publication member
--              is a no-op (emits a NOTICE and exits cleanly).

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'table_buyin_telemetry'
  ) then
    raise notice 'ADR-050 E3: public.table_buyin_telemetry is already a member of supabase_realtime — skipping (idempotent no-op).';
  else
    execute 'alter publication supabase_realtime add table public.table_buyin_telemetry';
    raise notice 'ADR-050 E3: added public.table_buyin_telemetry to supabase_realtime publication.';
  end if;
end
$$;
