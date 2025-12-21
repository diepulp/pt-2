# Security & RLS Anti-Patterns

**Target Agents**: `rls-security-specialist`, `backend-developer`, `backend-service-builder`
**Severity**: CRITICAL - Security violations are blocking

---

## RLS Policy Anti-Patterns

> **Reference**: `docs/30-security/SEC-001-rls-policy-matrix.md`, SRM § Security & Tenancy

### ❌ NEVER use complex OR trees in RLS policies

```sql
-- ❌ WRONG: 6-way OR with nested conditions (hard to audit)
CREATE POLICY "visit_access" ON visit FOR SELECT USING (
  (auth.jwt() ->> 'casino_id')::uuid = casino_id
  OR auth.jwt() ->> 'role' = 'admin'
  OR auth.jwt() ->> 'permissions' @> '["global.read"]'
);

-- ✅ CORRECT: Single deterministic path via current_setting()
CREATE POLICY "visit_read_same_casino" ON visit FOR SELECT USING (
  auth.uid() = (SELECT user_id FROM staff WHERE id = current_setting('app.actor_id')::uuid)
  AND casino_id = current_setting('app.casino_id')::uuid
);
```

### ❌ NEVER skip RLS context injection in server actions

```typescript
// ❌ WRONG
export async function getVisit(visitId: string) {
  const supabase = await createServerClient();
  return supabase.from("visit").select("*").eq("id", visitId).single();
  // Missing: app.casino_id not set, RLS may fail or leak data
}

// ✅ CORRECT
export async function getVisit(visitId: string) {
  return withServerAction("visit.get", async (supabase, context) => {
    // withServerAction injects: SET LOCAL app.casino_id, app.actor_id
    return supabase.from("visit").select(VISIT_SELECT).eq("id", visitId).single();
  });
}
```

### ❌ NEVER use service-role key in application runtime

```typescript
// ❌ WRONG
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
await supabase.from("visit").select("*"); // Reads ALL casinos!

// ✅ CORRECT
const supabase = await createServerClient(); // Anon key + user context
// RLS enforces casino scoping automatically
```

### ❌ NEVER bypass RLS with service-role keys in runtime code

```typescript
// ❌ WRONG
const supabase = createClient(process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ✅ CORRECT
// Use scoped SSR helpers; runtime always runs under RLS
const supabase = await createServerClient();
```

---

## Casino Context Violations

### ❌ NEVER trust client-provided context for casino_id

```typescript
// ❌ WRONG
const casinoId = request.headers.get('x-casino-id'); // Client can spoof!

// ✅ CORRECT
// Derive from authenticated user's staff record
const { casinoId } = mwCtx.rlsContext; // From withServerAction middleware
```

### ❌ NEVER accept casino_id from request body

```typescript
// ❌ WRONG
const { casino_id, player_id } = await request.json();
await service.createVisit(player_id, casino_id);

// ✅ CORRECT
const { player_id } = await request.json();
const casinoId = mwCtx.rlsContext.casinoId; // Derived from auth
await service.createVisit(player_id, casinoId);
```

---

## Visit Domain Anti-Patterns (ADR-014)

> **Reference**: `docs/80-adrs/ADR-014-Ghost-Gaming-Visits-and-Non-Loyalty-Play-Handling.md`

### ❌ NEVER represent ghost gaming with visit_id = NULL

```typescript
// ❌ WRONG
// Ghost gaming represented by missing visit
await supabase.from("rating_slip").insert({
  visit_id: null, // ❌ Floating slip with no visit anchor
  table_id: tableId,
});

// ✅ CORRECT
// Ghost gaming is a visit with player_id = NULL
const { data: ghostVisit } = await supabase.from("visit").insert({
  casino_id: casinoId,
  player_id: null, // Ghost = no player
  visit_kind: 'gaming_ghost_unrated',
}).select().single();

await supabase.from("rating_slip").insert({
  visit_id: ghostVisit.id, // ✅ All slips have visit anchor
  table_id: tableId,
});
```

### ❌ NEVER accrue loyalty for ghost visits

```typescript
// ❌ WRONG
export async function awardPoints(visit: VisitDTO, points: number) {
  // Blindly awards points regardless of visit_kind
  await loyaltyService.addPoints(visit.player_id, points);
}

// ✅ CORRECT
export async function awardPoints(visit: VisitDTO, points: number) {
  // Only gaming_identified_rated visits accrue loyalty
  if (visit.visit_kind !== 'gaming_identified_rated') {
    throw new DomainError("LOYALTY_POLICY_VIOLATION",
      "Loyalty accrual only for identified rated visits");
  }
  await loyaltyService.addPoints(visit.player_id!, points);
}
```

### Visit Kind Archetypes (must enforce)

| `visit_kind` | `player_id` | Gaming | Loyalty |
|--------------|-------------|--------|---------|
| `reward_identified` | NOT NULL | No | Redemptions only |
| `gaming_identified_rated` | NOT NULL | Yes | Accrual eligible |
| `gaming_ghost_unrated` | NULL | Yes | Compliance only |

---

## RPC-Managed Tables

### ❌ Direct inserts banned on these tables

```typescript
// ❌ WRONG
await supabase.from('player_financial_transaction').insert(data);
await supabase.from('loyalty_ledger').insert(data);
await supabase.from('mtl_entry').insert(data);

// ✅ CORRECT
// Use canonical RPCs for these tables
await supabase.rpc('rpc_record_financial_transaction', { ... });
await supabase.rpc('rpc_credit_loyalty_points', { ... });
await supabase.rpc('rpc_create_mtl_entry', { ... });
```

---

## Quick Checklist

- [ ] No complex OR trees in RLS policies (use `current_setting()`)
- [ ] Server actions use `withServerAction()` for RLS context injection
- [ ] No service-role key in application runtime
- [ ] All user-facing tables have casino-scoped RLS policies
- [ ] Casino context derived from auth, not headers/body
- [ ] Ghost visits have `player_id = NULL` (not `visit_id = NULL`)
- [ ] All rating slips have `visit_id NOT NULL`
- [ ] Loyalty accrual only for `gaming_identified_rated` visits
- [ ] `visit_kind` validated before gaming/loyalty operations
