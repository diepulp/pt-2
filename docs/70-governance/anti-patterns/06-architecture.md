# Architecture & Scope Anti-Patterns

**Target Agents**: `lead-architect`, `system-architect`, `backend-developer`
**Severity**: HIGH - Affects long-term maintainability

---

## Premature Abstraction

### ❌ NEVER introduce infrastructure without a second consumer

```typescript
// ❌ WRONG - Generic event bus for one use case
// lib/events/domain-event-bus.ts
export class DomainEventBus {
  private handlers = new Map<string, ((payload: any) => void)[]>();
  publish(event: string, payload: any) {/* ... */}
}

// ✅ CORRECT - Direct orchestration until abstraction is justified
export async function completeRatingSlip(input: CompleteRatingSlipDTO) {
  const ratingSlip = await ratingSlipService.close(input);
  await loyaltyService.awardPoints(ratingSlip);
  return ratingSlip;
}
```

### The "Second Consumer" Rule

Before creating any abstraction, you must have:
1. Two or more **concrete** consumers in the codebase
2. A **documented trigger** (ADR or PRD) justifying the abstraction
3. Clear evidence the abstraction reduces complexity rather than adding it

---

## Non-Idempotent Writes

### ❌ NEVER ship writes without idempotency when natural keys exist

```typescript
// ❌ WRONG - Duplicate submits throw hard 23505 errors
await supabase.from("player").insert(data);

// ✅ CORRECT - Handle constraint violations gracefully
try {
  await supabase.from("player").insert(data);
} catch (error) {
  if ((error as PostgrestError).code === "23505") {
    return await supabase
      .from("player")
      .select(PLAYER_SELECT_MIN)
      .eq("casino_id", data.casino_id)
      .eq("player_id", data.player_id)
      .single();
  }
  throw error;
}
```

### Idempotency Strategies

| Strategy | Use When |
|----------|----------|
| Natural key upsert | Entity has business identifier |
| Idempotency key | Client-generated request ID |
| RPC-based state machine | Complex state transitions |
| Optimistic locking | Concurrent updates expected |

---

## Dual Database Clients

### ❌ NEVER maintain multiple database clients in runtime

```typescript
// ❌ WRONG - Two clients, one bypasses RLS
import { createServerClient } from "@/lib/supabase/server";
import { Pool } from "pg";

const supabase = await createServerClient();
const pg = new Pool({ connectionString: process.env.POSTGRES_URL }); // Unrestricted!

// ✅ CORRECT - Single canonical client under RLS
const supabase = await createServerClient();
```

---

## Over-Engineering Signals

### Warning Signs

1. **Abstract base classes** for services
2. **Generic repositories** wrapping Supabase
3. **Event sourcing** for simple CRUD
4. **Microservices** for single-tenant casino app
5. **GraphQL layer** on top of Supabase

### Resolution

- Reference: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- Ask: "Does this abstraction earn its complexity cost?"
- Default to the simpler solution

---

## Quick Checklist

- [ ] No generic infrastructure without two consumers
- [ ] Idempotency handled for all write operations
- [ ] Single canonical database client (Supabase)
- [ ] No abstract base classes for services
- [ ] Abstractions justified by ADR or PRD
