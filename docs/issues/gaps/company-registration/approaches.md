Route chain confirmed: `/start → /register-company → /bootstrap → /start → /setup → /pit`

Now the key design question is **how to implement the pre-bootstrap onboarding state** — specifically, where the company row lives and how bootstrap discovers it. Three approaches:

---

### Approach 1: New RPC `rpc_register_company` + amend `rpc_bootstrap_casino`

**How it works:**
- New SECURITY DEFINER RPC: `rpc_register_company(p_company_name, p_company_legal_name)` — creates company row, stores `company_id` in a new `onboarding_registration` table keyed by `auth.uid()`
- Amend `rpc_bootstrap_casino` to look up `onboarding_registration` for the authenticated user, resolve `company_id` from there, skip synthetic company creation
- After bootstrap completes, the `onboarding_registration` row is consumed (soft-deleted or marked complete)

**Pros:** Clean separation of concerns. Company registration is its own atomic operation. Bootstrap doesn't need new parameters (ADR-024 INV-8 preserved — no client-supplied company_id). The onboarding state table is extensible if future steps are added.

**Cons:** New table + new RPC + migration. Slightly more moving parts. The `onboarding_registration` table is a transient coordination artifact that only matters during the gap between registration and bootstrap.

---

### Approach 2: New RPC `rpc_register_company` + `user_metadata` for state

**How it works:**
- Same new RPC creates company row, but stores `company_id` in `auth.users.raw_user_meta_data` (user_metadata, not app_metadata — writable by client)
- Amend `rpc_bootstrap_casino` to read `company_id` from `auth.jwt() -> 'user_metadata'`
- After bootstrap, the metadata key is cleared or ignored

**Pros:** No new table. Uses existing Supabase auth infrastructure. Lightweight.

**Cons:** `user_metadata` is client-writable in Supabase — a user could theoretically set `company_id` to any UUID. The RPC would need to validate ownership (that the company row exists and was created by this user), which partially defeats the "server-authoritative" principle. Mixing domain state into auth metadata is architecturally noisy.

---

### Approach 3: New RPC `rpc_register_company` + `app_metadata` via admin API

**How it works:**
- Same new RPC creates company row, then uses `auth.admin` service_role API to set `app_metadata.pending_company_id` on the user
- Amend `rpc_bootstrap_casino` to read `pending_company_id` from `auth.jwt() -> 'app_metadata'`
- After bootstrap completes, clear `pending_company_id` from app_metadata

**Pros:** `app_metadata` is server-only (not client-writable), so it's authoritative. Uses existing claims infrastructure.

**Cons:** Requires service_role to mutate app_metadata — the RPC already runs as SECURITY DEFINER so it can do this, but it couples company registration to auth system mutations. Requires JWT refresh between registration and bootstrap for the claim to be visible. This is the same refresh dance that already happens post-bootstrap, now duplicated at an earlier step.

---

### Recommendation: **Approach 1**

Approach 1 is cleanest because:
- The onboarding state is a **domain concern**, not an auth concern — it belongs in a domain table, not in JWT metadata
- Bootstrap resolves company_id server-side from DB state, no client-carried identifiers, no JWT refresh timing issues
- The `onboarding_registration` table is small and purpose-built — one row per user, consumed on bootstrap, dead simple
- It's consistent with the project's posture: server-authoritative derivation, no spoofable params, fail-closed
- The table is naturally extensible if onboarding grows more pre-bootstrap steps later (without that being a design goal now — it's just a free consequence of a clean shape)

Approach 2 is weakest (client-writable metadata). Approach 3 is acceptable but introduces a JWT refresh dependency at a stage where you don't want one.

Does Approach 1 match your thinking?