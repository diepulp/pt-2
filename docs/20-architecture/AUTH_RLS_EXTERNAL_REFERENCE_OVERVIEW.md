# AUTH & RLS External Reference Overview

**Context:** PT-2 (Casino Player Tracker) currently uses a hybrid RLS strategy:
- Supabase Auth JWT with `casino_id` and `staff_role` claims.
- Supabase + Postgres RLS as primary isolation.
- Supavisor/pgBouncer-style **transaction pooling**.
- `set_rls_context` RPC that sets `app.casino_id` and friends via `set_config()`.
- RLS policies that scope by `casino_id` using:

  ```sql
  casino_id = COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  )
  ```

This document summarizes **external, battle-tested patterns** from the wider ecosystem that align with (or inform) this design, so future work doesn’t reinvent the wheel.

---

## 1. Canonical Multi‑Tenant RLS Patterns in Postgres

Modern Postgres multi‑tenant SaaS generally converges on the same core idea:

1. A **tenant column** on every shared table (e.g., `tenant_id`, here `casino_id`).
2. **RLS policies** that restrict visibility to rows whose tenant column matches the current tenant.
3. **Database-enforced isolation**, so forgetting a `WHERE` clause in app code does not leak data.

Representative references:

- **AWS – Multi‑tenant data isolation with PostgreSQL RLS**  
  AWS shows a classic approach: each row has a `tenant_id` column; RLS policies enforce that `tenant_id` must match a value exposed via `current_setting('app.current_tenant')`, which is set at connection time. This centralizes isolation in the database and removes the need for app‑side filtering. citeturn0search3turn0search20

- **Crunchy Data – Row Level Security for Tenants in Postgres**  
  Crunchy Data describes RLS as ideal for tenant isolation, emphasizing that every query is filtered by policies such as “row visible only if `tenant_id = current tenant`”. This mirrors the PT‑2 pattern of a `casino_id` column and db‑enforced scoping. citeturn0search25turn0search6

- **Generic RLS guides (Bytebase, Medium, etc.)**  
  Many guides demonstrate: add `tenant_id`, enable RLS, define policies using that column. They reinforce that RLS is the “safety net” for multi‑tenancy, not an optional layer. citeturn0search12turn0search7

**Mapping to PT‑2:**  
Your `casino_id` is a textbook `tenant_id`, and your requirement that every exposed table has RLS enabled with a `casino_id` predicate is exactly aligned with these established patterns.

---

## 2. Supabase: JWT‑Backed RLS & Custom Claims

Supabase formalizes the “JWT + RLS” story:

- **JWTs as the foundation for RLS**  
  Supabase’s JWT docs explicitly say JWTs are the basis of RLS; each Supabase product decodes the JWT and uses Postgres policies to authorize access, with `auth.uid()` and `auth.jwt()` as helpers. citeturn0search10

- **Row Level Security docs**  
  Supabase’s RLS guide shows policies that read `auth.jwt()` and look into `app_metadata` to enforce team/tenant membership (e.g., checking a `team_id` from the token). It warns that JWTs are not always “fresh” and that changes to metadata only take effect after token refresh. citeturn0search0

- **Token Security & extracting OAuth claims in RLS**  
  The “Token Security and RLS” docs demonstrate accessing custom claims (e.g., `client_id`) via `auth.jwt()` directly in policies and outline common RLS patterns with OAuth tokens. citeturn0search1

- **Custom claims & RBAC**  
  Supabase’s custom claims / RBAC guide shows adding a `user_role` claim to JWTs and using it in RLS for role‑based access. They recommend using **app metadata** for security‑relevant claims and show how to inject those via an access token hook. citeturn0search19turn0search23turn0search14

- **JWT Claims Reference**  
  Supabase documents the full JWT structure (standard claims plus `app_metadata` and `user_metadata`) to support server‑side validation and policy design. citeturn0search5

**Mapping to PT‑2:**  
Your JWT contract (`sub = staff.id`, `app_metadata.casino_id`, `app_metadata.staff_role`) and RLS expressions like:

```sql
(auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
(auth.jwt() -> 'app_metadata' ->> 'staff_role')
```

are directly in line with these docs. You’re not inventing a new pattern; you’re implementing the exact model Supabase designs for multi‑tenant + RBAC use cases.

---

## 3. Runtime Parameters: `set_config` / `current_setting` as Tenant Context

Outside Supabase, many teams use **runtime parameters** (custom GUCs) to hold the current tenant id, then read them in RLS:

- **AWS RDS example**  
  The AWS post uses `current_setting('app.current_tenant')` inside RLS policies and sets that parameter at connection time. This avoids relying on the Postgres role name alone and supports shared DB users for pooled SaaS setups. citeturn0search3

- **Talentica – Row Level Security in action**  
  Their “Approach 2: Use a database runtime parameter” describes setting a tenant context via `set_config()` or `SET` and reading it via `current_setting()` in policies—precisely the pattern behind PT‑2’s `set_rls_context` + `current_setting('app.casino_id')`. citeturn0search17

- **RLS with runtime params in community articles and threads**  
  Multiple blog posts and threads (e.g., Golang API with RLS, Yugabyte/Yugabyte‑style articles) show policies like:

  ```sql
  CREATE POLICY account_isolation ON items
  FOR ALL USING (current_setting('current_account_id') = account_id);
  ```

  with the app responsible for setting `current_account_id` before queries. citeturn0search26turn0search31

**Mapping to PT‑2:**  
Your `set_rls_context` RPC that calls `set_config('app.casino_id', ...)` and the hybrid policy:

```sql
COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)
```

are a Supabase‑flavored instance of this runtime parameter pattern, with JWT fallback for extra robustness.

---

## 4. Connection Pooling, Session State, and RLS

The friction you hit with Supavisor/pgBouncer is a known class of problems: **transaction pooling breaks naïve assumptions about session state.**

Key references:

- **Heroku PgBouncer best practices**  
  Heroku explains the three pooling modes (session, transaction, statement) and notes that in transaction pooling, a server connection is only tied to a client for the duration of a single transaction. Anything relying on “session state” must be rethought or wrapped in explicit transactions. citeturn0search8

- **Citus – PgBouncer & session variables**  
  Citus calls out that PgBouncer in transaction pooling mode doesn’t fully support arbitrary session variables; there are restrictions on what survives across pooled transactions. This matches your concern that simple `SET LOCAL` plus separate queries may not run on the same backend connection. citeturn0search18

- **General PgBouncer / pooling caveats**  
  Articles like “PgBouncer is useful, important, and fraught with peril” walk through all the Postgres features (including some forms of session state) that behave differently or break under transaction pooling. citeturn0search27

**Mapping to PT‑2:**  

- Your move from “multiple `SET LOCAL` calls scattered across queries” → “single `set_rls_context` RPC that sets all context for the transaction” is exactly how you make runtime parameters work reliably in a pooled environment.
- The hybrid pattern (session var + JWT) means RLS **still works** even if the session parameter is missing or not set (e.g., a bug or odd pooling edge case), because it can fall back to JWT.

This aligns with external guidance: either rely on JWT/claims alone, or be very deliberate with transaction boundaries and parameter setting. You chose the second option plus JWT safety net.

---

## 5. JWT‑First / JWT‑Only RLS as a Target End‑State

Several sources implicitly or explicitly endorse a **JWT‑only** RLS model for simplicity and performance:

- Supabase’s JWT & RLS docs position JWT as the primary context provider for policies, with custom claims (e.g., roles, team/tenant ids) used directly in RLS. citeturn0search10turn0search11turn0search19
- Supabase custom claims blog notes that custom claims can be read via `current_setting('request.jwt.claims', true)` in Postgres, meaning no extra disk I/O is needed to enforce RLS based on token content. citeturn0search23
- Multi‑tenant RLS articles from SaaS‑oriented blogs (e.g., Leapcell, Permit.io) emphasize using trusted identity context (like claims) plus tenant columns, and avoiding ad‑hoc per‑request state as much as possible. citeturn0search2turn0search30

**Mapping to PT‑2:**  

Your planned Phase 3 (ADR‑015.1) to move some contexts from hybrid:

```sql
COALESCE(current_setting('app.casino_id', true), jwt.casino_id)
```

to pure JWT:

```sql
casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
```

is entirely aligned with these references. It’s not mandatory for MVP, but it is the “clean” long‑term direction once:

- JWT claim sync is proven solid in production.
- You’re satisfied with token freshness / revocation behavior.
- You don’t need per‑request casino overrides in those contexts.

---

## 6. How to Use These References in Your Own ADRs

You can leverage these external artifacts in your docs roughly as follows:

1. **ADR‑015 (Hybrid RLS & Pooling)**  
   - Cite AWS / Crunchy / Talentica for tenant_id + RLS + runtime parameter patterns. citeturn0search3turn0search25turn0search17  
   - Cite Supabase JWT docs for the `auth.jwt()` claim‑based side. citeturn0search10turn0search11  
   - Mention Heroku/Citus PgBouncer docs as justification for the “single RPC per transaction” pattern with Supavisor. citeturn0search8turn0search18  

2. **ADR‑015.1 / ADR‑020 (Track A vs Track B)**  
   - Use Supabase Token Security + custom claims docs to justify JWT‑only as the eventual simplification (Track B). citeturn0search1turn0search19turn0search23  
   - Use SaaS multi‑tenant RLS posts (AWS, Leapcell, Permit.io) to back the “tenant column + RLS is the canonical approach” statement. citeturn0search3turn0search30turn0search2  

3. **Security & Governance Docs (SEC‑006, SEC‑001, etc.)**  
   - Reference community warnings about misusing user metadata vs app metadata in JWT (Supabase discussion) to justify strict use of `app_metadata` for security decisions. citeturn0search14  
   - Reference the general stance that RLS is required for multi‑tenant isolation in pooled setups (AWS prescriptive guidance). citeturn0search20  

---

## 7. TL;DR

You are **not** out on some bespoke casino island. The PT‑2 auth/RLS pattern sits squarely inside the mainstream of:

- **Postgres multi‑tenant RLS** with a tenant column (`casino_id`),  
- **Supabase JWT claims + RLS** for role/tenant context,  
- **Runtime parameters** (`set_config` / `current_setting`) used carefully with pooling,  
- And a **long‑term simplification path** toward JWT‑only RLS once the system is stable.

These references are your “external backing choir” so future ADRs don’t sound like pure homebrew invention—even though, to be fair, you basically rediscovered the right patterns on your own.

---

## References

### Supabase: JWT, RLS, Custom Claims

- [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts) - Foundation for RLS
- [Row Level Security Guide](https://supabase.com/docs/guides/database/postgres/row-level-security) - Policy patterns
- [Auth Overview](https://supabase.com/docs/guides/auth) - JWT fields reference
- [Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - Role-based access
- [Token Security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security) - OAuth tokens + RLS
- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) - Injecting casino_id/staff_role

### Postgres RLS & Multi-Tenancy

- [AWS: Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - Canonical tenant_id + RLS pattern
- [AWS Prescriptive Guidance: Multi-tenant PostgreSQL](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/welcome.html) - SaaS best practices ([PDF](https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/saas-multitenant-managed-postgresql.pdf))
- [AWS: Best Practices (RLS required for pool model)](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/best-practices.html)
- [Crunchy Data: Row Level Security for Tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - Tenant isolation patterns
- [Crunchy Data: RLS Playground](https://www.crunchydata.com/developers/playground/row-level-security) - Interactive tutorial
- [Talentica: RLS with runtime parameters](https://www.talentica.com/blogs/row-level-security-in-postgresql/) - set_config/current_setting pattern
- [Medium: Multi-tenant isolation & sharding](https://medium.com/@justhamade/data-isolation-and-sharding-architectures-for-multi-tenant-systems-20584ae2bc31) - AWS pattern summary

### Connection Pooling & Session State

- [Heroku: PgBouncer configuration](https://devcenter.heroku.com/articles/best-practices-pgbouncer-configuration) - Pooling modes
- [Heroku: Server-side connection pooling](https://devcenter.heroku.com/articles/postgres-connection-pooling) - Postgres pooling
- [PgBouncer config docs](https://www.pgbouncer.org/config.html) - Official reference
- [PgBouncer: useful, important, and fraught with peril](https://jpcamara.com/2023/04/12/pgbouncer-is-useful.html) - Modes & pitfalls
- [Better Programming: PgBouncer setup](https://betterprogramming.pub/how-to-set-up-a-pgbouncer-connection-pool-in-postgres-225d5f742471) - Connection pool setup

### Community Discussions

- [Reddit: Custom Access Token Hook & RLS](https://www.reddit.com/r/Supabase/comments/1i5n8zd/custom_access_token_hook_rls_help_me_make_sense/) - metadata vs app_metadata gotchas
- [Reddit: PostgreSQL RLS beginner guide](https://www.reddit.com/r/SQL/comments/1merufb/postgresql_rowlevel_security_a_beginnerfriendly/) - Basics sanity check