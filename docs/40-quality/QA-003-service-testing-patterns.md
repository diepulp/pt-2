---
id: QA-003
title: Service Testing Patterns & Examples
owner: QA
status: Draft
affects: [QA-001, GOV-SERVICE-TEMPLATE]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Extract the canonical testing patterns from `70-governance/SERVICE_TEMPLATE.md` and provide concrete examples teams can copy when building or extending services.

## Unit Test Pattern

**Principles**
- Use the exported service interface (e.g., `PlayerService`) instead of `ReturnType`.
- Provide a minimal, typed double of `SupabaseClient<Database>` with only the methods required for the scenario.
- Validate happy paths and domain error mapping (`PGRST116 → NOT_FOUND`, `23505 → *_DUPLICATE`).

```ts
// services/player/__tests__/player.service.unit.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createPlayerService, PlayerService } from "@/services/player";

function makeClientDouble(overrides: Partial<SupabaseClient<Database>> = {}): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      if (table !== "player") throw new Error("unexpected table");
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: "p1", first_name: "A", last_name: "B", phone: null }, error: null }) }),
        }),
      };
    },
    // @ts-expect-error — partial double is intentional for tests
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

## Integration Test Pattern

**Principles**
- Run against a local Supabase instance with RLS enabled.
- Seed casino-scoped data before tests; clean up afterward.
- Assert domain error translation with real Postgres error codes.

```ts
// services/player/__tests__/player.service.int.test.ts
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createPlayerService } from "@/services/player";

const supabase = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_KEY!);
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
    const duplicate = await playerService.create({ first_name: "Ada", last_name: "Lovelace" });
    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.code).toBe("PLAYER_DUPLICATE");
  });
});
```

## Testing Rules of Thumb

- **Keep doubles local** — Each domain’s tests own their helpers (`makePlayer`, `makeVisit`). Do not promote to a shared utilities folder until used by ≥2 contexts.
- **Verify envelopes** — All responses must return the `ServiceResult` envelope. Unit tests should assert `success`/`error` structure.
- **Log-free tests** — Route all operations through `executeOperation` so tests can assert labels without reading logs.
- **Seed via RPCs** — Prefer calling service factories or domain RPCs to seed data; avoid raw `postgrest` inserts that bypass RLS.
- **Tag integration suites** — Name files `*.int.test.ts` so `npm run test:int` can target them during CI quality gates.

## Checklist

- [ ] Tests import explicit service interfaces.
- [ ] Supabase doubles remain typed and minimal.
- [ ] Integration tests run with RLS enabled and seed data responsibly.
- [ ] Domain errors asserted for each critical constraint.
- [ ] New helpers live next to their domain; cross-domain utilities are justified.

