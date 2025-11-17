# RUN-003 Schema Migration Runbook (Lean)

Status: Draft — command-first checklist.

Purpose: pre-flight, apply, verify, rollback database migrations safely.

Pre-flight:
- Check tracking: `cat docs/65-migrations/MIG-001-migration-tracking-matrix.md`
- Backup schema: `npx supabase db dump --schema public > /tmp/schema_backup.sql`
- Verify RLS exists for affected tables (SEC-001).

Create/Apply:
- Order: enums → tables → policies.
- Create: `npx supabase migration new {description}`
- Apply: `npx supabase migration up` (or `db reset` for full reapply)
- Types: `npm run db:types`

Verify:
- Schema diff vs backup (`diff`); ensure RLS enabled on new tables.
- Smoke test affected services.

Reload schema (if psql used):
- `npx supabase db execute --file - <<'SQL'\nNOTIFY pgrst, 'reload schema';\nSQL`

Rollback:
- Preferred: compensating migration (`{timestamp}_rollback.sql`).
- Option: `npx supabase migration down` (only if safe).
- Last resort: restore backup + `npm run db:types`.

Update docs:
- Edit `MIG-001` with status.
- Note RLS state and any rollback performed.
