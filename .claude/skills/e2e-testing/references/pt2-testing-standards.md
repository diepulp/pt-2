# PT-2 Testing Standards Reference

This reference contains the complete PT-2 quality standards from QA-001 and QA-003.
Load this file when needing detailed coverage targets, service testing patterns, or PRD traceability.

---

## Coverage Targets (QA-001)

| Layer / Module | Minimum Coverage | Notes |
| --- | --- | --- |
| Migrations & schema checks | 100% | Every constraint, trigger, policy exercised in CI |
| Service CRUD modules | 90% | Include happy path + domain errors (`NOT_FOUND`, duplicates) |
| Service business workflows | 85% | State machines, temporal checks, concurrency |
| Service transforms/DTO mappers | 100% | Deterministic - snapshot or golden tests |
| Action layer | 80% | Ensure cache invalidation, header contracts, RBAC mapping |
| UI components | 70% | Focus on accessibility (labels, keyboard) |
| End-to-end suites | 100% of critical flows | Player CRUD, Visit closeout, Rating Slip reward |

**CI fails if module coverage drops below the target for its layer.**

---

## Layer Playbook

| Layer | Mandatory Test Types | Scope | Mock Boundary | Tooling |
| --- | --- | --- | --- | --- |
| Data (Supabase) | Schema verification, migration smoke | Constraints, RLS, triggers | None (real DB) | Supabase CLI, SQL scripts |
| Service | Unit (default), targeted integration | CRUD, domain rules, error mapping | Unit: typed Supabase double / Integration: real test DB | Jest |
| Action | Integration | Service orchestration, cache/authorization | Mock downstream services | Jest + MSW |
| UI (React) | Unit + E2E | Component rendering, user journeys | Mock server actions & React Query | RTL, Playwright |

---

## PRD-001 Traceability (MVP)

| PRD Story | Test Expectations | Layer |
| --- | --- | --- |
| **US-003 Pause/Resume Slip** | Unit test state machine for pause/resume timestamps; integration test verifies duration calculation; E2E asserts UI reflects derived seconds within 2s | Service, Integration, E2E |
| **US-004 Close Slip** | Integration test ensures `end_time` set, `status=closed`, telemetry emitted; E2E confirms dashboard removes slip within SLA | Integration, E2E |
| **US-005 Mid-Session Reward** | Contract test for RPC arguments, ledger commit, idempotency; E2E confirms UI displays ledger-sourced reward | Integration, Contract, E2E |
| **PRD §3.4 Telemetry Snapshot** | Unit test ensures factories persist snapshot; schema test blocks deletions; UI regression shows metadata | Unit, Schema, UI |
| **PRD §3.6 Finance Trigger** | RPC contract test ensures `gaming_day` populated by trigger | Integration |
| **PRD §3.7 MTL Read-only** | Authorization test for `mtl_entry` without loyalty leakage; E2E smoke for compliance persona | Security, E2E |

---

## Complete Test Fixture Factory Pattern

> **QA-006 §3 compliance:** Uses UUID-based isolation (not timestamp-only), creates company
> for dual-boundary tenancy (ADR-043), stamps `app_metadata`, and scopes cleanup by
> specific IDs (not broad casino sweeps).

```typescript
/**
 * E2E Test Data Fixtures
 *
 * Provides utilities for creating and cleaning up test data in Supabase.
 * Uses service role client to bypass RLS for test setup/teardown.
 *
 * QA-006 §3: Collision-resistant identifiers (randomUUID), company creation,
 * app_metadata stamping, scoped cleanup by specific IDs.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
}

/**
 * Creates a service role client for test data setup/teardown
 * WARNING: Bypasses RLS - use only in tests
 */
export function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Test data structure for a complete test scenario
 */
export interface TestScenario {
  companyId: string;
  casinoId: string;
  staffId: string;
  staffUserId: string;
  playerId: string;
  tableId: string;
  visitId: string;
  authToken: string;
  email: string;
  password: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a complete test scenario with company, casino, staff, player, table, and visit.
 *
 * Uses randomUUID() for collision-resistant isolation (QA-006 §3/§4).
 * Timestamp-only prefixes (e2e_${Date.now()}) are insufficient for parallel workers.
 */
export async function createTestScenario(): Promise<TestScenario> {
  const supabase = createServiceClient();
  const uniqueId = randomUUID().slice(0, 8);
  const testPrefix = `e2e_${uniqueId}`;

  // Create test company (required by ADR-043 dual-boundary tenancy)
  const { data: company, error: companyError } = await supabase
    .from("company")
    .insert({
      name: `${testPrefix}_company`,
    })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to create test company: ${companyError?.message}`);
  }

  // Create test casino under company
  const { data: casino, error: casinoError } = await supabase
    .from("casino")
    .insert({
      company_id: company.id,
      name: `${testPrefix}_casino`,
      status: "active",
    })
    .select()
    .single();

  if (casinoError || !casino) {
    throw new Error(`Failed to create test casino: ${casinoError?.message}`);
  }

  // Create test auth user with app_metadata for RLS context
  const testEmail = `${testPrefix}_staff@test.com`;
  const testPassword = "TestPassword123!";

  const { data: authData, error: authCreateError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      app_metadata: {
        casino_id: casino.id,
        staff_role: "admin",
      },
    });

  if (authCreateError || !authData.user) {
    throw new Error(
      `Failed to create test auth user: ${authCreateError?.message}`
    );
  }

  // Create test staff user (linked to auth user)
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .insert({
      casino_id: casino.id,
      user_id: authData.user.id,
      first_name: `${testPrefix}`,
      last_name: "Staff",
      email: testEmail,
      role: "admin",
      status: "active",
    })
    .select()
    .single();

  if (staffError || !staff) {
    throw new Error(`Failed to create test staff: ${staffError?.message}`);
  }

  // Update app_metadata with staff_id (needed by set_rls_context_from_staff)
  await supabase.auth.admin.updateUserById(authData.user.id, {
    app_metadata: {
      casino_id: casino.id,
      staff_role: "admin",
      staff_id: staff.id,
    },
  });

  // Sign in to get auth token
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInError?.message}`);
  }

  // Create test player
  const { data: player, error: playerError } = await supabase
    .from("player")
    .insert({
      casino_id: casino.id,
      first_name: `${testPrefix}_player_first`,
      last_name: `${testPrefix}_player_last`,
      external_id: `${testPrefix}_player_ext`,
    })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error(`Failed to create test player: ${playerError?.message}`);
  }

  // Create test table
  const { data: table, error: tableError } = await supabase
    .from("gaming_table")
    .insert({
      casino_id: casino.id,
      label: `${testPrefix}_table`,
      type: "blackjack",
      status: "inactive",
    })
    .select()
    .single();

  if (tableError || !table) {
    throw new Error(`Failed to create test table: ${tableError?.message}`);
  }

  // Create test visit
  const { data: visit, error: visitError } = await supabase
    .from("visit")
    .insert({
      casino_id: casino.id,
      player_id: player.id,
      visit_start_utc: new Date().toISOString(),
      status: "active",
    })
    .select()
    .single();

  if (visitError || !visit) {
    throw new Error(`Failed to create test visit: ${visitError?.message}`);
  }

  // Cleanup function — scoped by specific IDs (QA-006 §4: no broad casino sweeps)
  const cleanup = async () => {
    // Delete in reverse dependency order by specific IDs
    await supabase.from("rating_slip").delete().eq("visit_id", visit.id);
    await supabase.from("visit").delete().eq("id", visit.id);
    await supabase.from("gaming_table").delete().eq("id", table.id);
    await supabase.from("player").delete().eq("id", player.id);
    await supabase.from("staff").delete().eq("id", staff.id);
    await supabase.from("casino").delete().eq("id", casino.id);
    await supabase.from("company").delete().eq("id", company.id);
    // Delete auth user
    await supabase.auth.admin.deleteUser(authData.user.id);
  };

  return {
    companyId: company.id,
    casinoId: casino.id,
    staffId: staff.id,
    staffUserId: authData.user.id,
    playerId: player.id,
    tableId: table.id,
    visitId: visit.id,
    authToken: signInData.session.access_token,
    email: testEmail,
    password: testPassword,
    cleanup,
  };
}
```

---

## Service Testing Patterns (QA-003)

### Unit Test Pattern

```typescript
// services/player/__tests__/player.service.unit.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createPlayerService, PlayerService } from "@/services/player";

function makeClientDouble(
  overrides: Partial<SupabaseClient<Database>> = {}
): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      if (table !== "player") throw new Error("unexpected table");
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: "p1", first_name: "A", last_name: "B" },
              error: null,
            }),
          }),
        }),
      };
    },
    // @ts-expect-error - partial double is intentional for tests
    ...overrides,
  } as SupabaseClient<Database>;
}

describe("player service (unit)", () => {
  it("creates a player", async () => {
    const svc: PlayerService = createPlayerService(makeClientDouble());
    const result = await svc.create({ first_name: "Ada", last_name: "Lovelace" });
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("p1");
  });
});
```

### Integration Test Pattern

```typescript
// services/player/__tests__/player.service.int.test.ts
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createPlayerService } from "@/services/player";

const supabase = createClient(
  process.env.SUPABASE_TEST_URL!,
  process.env.SUPABASE_TEST_KEY!
);
const playerService = createPlayerService(supabase);

describe("player service (integration)", () => {
  beforeAll(async () => {
    // seed casino + staff fixtures
  });

  afterAll(async () => {
    // truncate seeded tables
  });

  it("enforces duplicate guard", async () => {
    await playerService.create({ first_name: "Ada", last_name: "Lovelace" });
    const duplicate = await playerService.create({
      first_name: "Ada",
      last_name: "Lovelace",
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.code).toBe("PLAYER_DUPLICATE");
  });
});
```

---

## Test File Organization (ADR-002)

### Directory Structure

```
services/casino/
├── __tests__/
│   ├── casino.test.ts              # Unit tests
│   ├── casino.integration.test.ts  # Integration tests
│   ├── gaming-day.test.ts
│   ├── schemas.test.ts
│   ├── crud.unit.test.ts
│   ├── keys.test.ts
│   ├── service.test.ts
│   └── mappers.test.ts
├── crud.ts                         # Production code
├── dtos.ts
├── gaming-day.ts
├── http.ts
├── index.ts
├── keys.ts
├── mappers.ts
├── schemas.ts
└── selects.ts
```

### Naming Conventions

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit tests | `*.test.ts` | `casino.test.ts` |
| Unit tests (explicit) | `*.unit.test.ts` | `crud.unit.test.ts` |
| Integration tests | `*.integration.test.ts` | `casino.integration.test.ts` |
| E2E tests | `*.e2e.test.ts` | `player-lifecycle.e2e.test.ts` |

---

## Execution Guardrails

- **Typed doubles only** - Unit tests must use typed `SupabaseClient<Database>` doubles. No `any` or `ReturnType` inference.
- **RLS awareness** - Integration tests run against seeded Supabase with RLS enabled.
- **Seed helpers per domain** - Store fixtures next to domain (`services/{domain}/__tests__/helpers.ts`).
- **Schema verification** - `__tests__/schema-verification.test.ts` blocks drift between DTOs and database types.
- **Regenerate types after migrations** - `npm run db:types-local` before code review.

---

## Review Checklist

- [ ] Tests follow the unit -> integration -> E2E ratio
- [ ] Coverage reports meet or exceed layer targets
- [ ] New migrations include schema verification assertions
- [ ] Supabase client doubles remain typed; no `any` escapes
- [ ] Critical flows updated in Playwright after feature changes
