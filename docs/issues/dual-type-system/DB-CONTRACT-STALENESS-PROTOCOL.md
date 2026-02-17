# DB Contract Staleness Protocol
**ID:** DB-CONTRACT-STALENESS-PROTOCOL  
**Status:** Draft  
**Applies to:** PT-2 (Supabase/Postgres, migrations-first), all bounded contexts and any code touching RPCs, views, triggers, enums, or schema-derived types.

---

## 0) Prime Directive
We are **migrations-first**.

- **Schema authority:** repo migrations
- **Canonical runtime types:** `types/database.types.ts` (only import target in runtime code)
- **Remote DB:** deployment target (must match migrations)
- **Local DB instances (docker/worktrees):** disposable mirrors (valid only after applying migrations)

**Types do not choose environment. Env/config chooses environment.**  
Types represent the contract produced by migrations.

---

## 1) The Problem This Prevents
Temporary staleness is normal during development (mid-flight schema changes).  
If staleness is handled ad-hoc (casts, multiple Database types, remote-type imports), the repo drifts into:

- missing RPCs in types
- “extra client” casts like `as unknown as SupabaseClient<RemoteDatabase>`
- inconsistent behavior across worktrees/envs
- regressions where UI queries the wrong canonical business key (e.g., gaming day)

This protocol makes staleness remediation **mechanical and enforceable**.

---

## 2) Staleness Categories (S1–S4)

### S1 — Local DB stale (most common)
**Symptom**
- Local docker DB missing a new table/function/RPC that exists in migrations (or exists remotely).
- Generated local types don’t include new RPCs/functions.

**Fix**
1. `supabase db reset` in the active worktree
2. regenerate canonical types
3. remove any temporary casts/shims

---

### S2 — Types stale (also common)
**Symptom**
- DB has the RPC/table/enum, but `types/database.types.ts` does not.
- TS errors like “RPC does not exist on type Database['public']['Functions']”.

**Fix**
1. run canonical `db:types`
2. commit `types/database.types.ts`
3. delete any shims/casts introduced purely for typing

---

### S3 — Remote DB stale (deployment lag)
**Symptom**
- Migrations exist and local DB reflects them, but remote DB does not yet.
- Remote-only operations fail at runtime (e.g., missing function), while local tests pass.

**Fix**
1. apply migrations to remote (normal deploy pipeline)
2. do **not** “fix” by importing remote types into runtime code
3. optionally run remote diff check to confirm convergence

---

### S4 — Illegal drift (manual dashboard edits)
**Symptom**
- Remote DB has a function/table not present in migrations and not explainable by a known release.
- Type diffs show unexpected remote changes.

**Fix**
1. backfill a migration immediately to make repo match remote
2. record incident cause (who/what changed it)
3. consider restricting manual dashboard schema edits

---

## 3) Standard Remediation Procedure (the playbook)

When you see “RPC missing / type mismatch / weird null data”:

### Step 1 — Reconcile local DB to migrations
Run in the active worktree:
- `supabase status`
- `supabase db reset`

> Local DB instances are disposable. Reset is faster than “debugging mystery drift”.

### Step 2 — Regenerate canonical types
Run:
- `npm run db:types`

Expected result:
- `types/database.types.ts` updated to include new schema/RPCs.

Commit the changes:
- types are part of the repo contract.

### Step 3 — Confirm remote DB convergence (deployment)
- apply migrations to remote (your normal pipeline)

Optional verification:
- generate remote snapshot types and diff against canonical.

### Step 4 — Remove temporary typing bypasses
- delete `as any` / `as unknown as` casts around `.rpc(...)`
- delete or decommission any temporary shim if its purpose was “RPC absent from types”
- update call sites to the canonical typed API

---

## 4) Tooling Standards (scripts)

### Canonical generation (migrations-first)
**Preferred** (local schema derived from migrations):
```bash
npx supabase gen types typescript --local --schema public > types/database.types.ts
```

### Fallback generation (only if local tooling is down)
```bash
npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.types.ts
```

### Remote snapshot (CI validation artifact only)
```bash
npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/remote/database.types.ts
```

**Runtime code MUST NOT import from `types/remote/**`.**

---

## 5) Guardrails (must-have)

### G1 — Single canonical import
Runtime code imports Database types only from:
- `@/types/database.types`

### G2 — No type-system mixing
Forbidden in runtime code:
- imports from `types/remote/**` or `types/local/**`
- defining local `Database` interfaces
- re-exporting multiple Database types

### G3 — No casts around `.rpc(...)` or Supabase client
Forbidden in runtime code (no exceptions):
- `(supabase.rpc as any)` — RPC call bypass
- `(supabase as any)` — client bypass
- `@ts-ignore` or `@ts-expect-error` to suppress RPC typing errors

**Post-audit status (2026-02-04):** 37 such casts were removed. Canonical types are current. If types appear stale, follow Steps 1–4 of the remediation procedure. Do NOT re-add casts.

### G4 — RPC parameter normalization (null vs undefined)
Supabase optional RPC parameters are typed as `param?: type` (= `type | undefined`).

Required pattern:
```typescript
// ✅ CORRECT: undefined omits the key, RPC uses SQL DEFAULT
p_gaming_day: query.gamingDay ?? undefined,

// ❌ WRONG: null is not assignable to undefined
p_gaming_day: query.gamingDay ?? null,
```

Exception: Use `?? null` only for direct table inserts/updates where the column is explicitly nullable.

### G5 — JSONB boundary narrowing
JSONB columns and RPC returns are typed as `Json` (wide union). Narrowing MUST use centralized helpers.

Required pattern:
```typescript
// ✅ CORRECT: Centralized narrowing in lib/json/narrows.ts
import { narrowJsonRecord, narrowRpcJson } from '@/lib/json/narrows';
const metadata = narrowJsonRecord(data.preferences);
const typed = narrowRpcJson<MyRpcResponse>(data);

// ❌ WRONG: Inline cast in crud.ts (blocked by pre-commit Check 11)
const metadata = data.preferences as Record<string, unknown>;
```

**Enforcement:** `.husky/pre-commit-service-check.sh` Check 11 bans `as [A-Z]` in crud.ts files.

### G6 — Test mock typing
Test doubles for Supabase client must be typed, not `any`.

Required pattern:
```typescript
// ✅ CORRECT
const mockSupabase = {} as unknown as SupabaseClient<Database>;

// ❌ WRONG
const mockSupabase = {} as any;
```

---

## 6) Definition of Done (DoD) for schema/RPC changes

When adding/updating RPCs, tables, enums, triggers, or views:

- [ ] Migration exists and is applied locally (`supabase db reset`)
- [ ] Canonical types regenerated and committed (`types/database.types.ts`)
- [ ] Remote deploy applied (or queued) and verified for required environments
- [ ] No runtime imports from `types/remote/**`
- [ ] No `.rpc(...)` typing bypasses outside the temporary shim allowlist (ideally none)
- [ ] Any temporary shim has a removal issue/task and is scoped to one file

---

## 7) Quick Diagnosis Checklist (symptom → likely category)

- “RPC missing in TS types” → **S2** (types stale) or **S1** (local stale)
- “Works locally, fails remotely” → **S3** (remote stale)
- “Remote has schema changes nobody can explain” → **S4** (illegal drift)
- “Agent introduced RemoteDatabase casts” → protocol was skipped; do Steps 1–4

---

## 8) Notes for worktrees
Worktrees are supported and expected.

- Each worktree may run its own local Supabase instance.
- Local DB must be treated as disposable and resettable.
- The repo’s canonical types file remains the single runtime contract across worktrees.

---

## Appendix A — Policy Statement (one-liner)
**Many DB instances are allowed. Only one schema contract exists: migrations → canonical types.**
