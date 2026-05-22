# FAILURE SIMULATION HARNESS — Implementation (PT-2)

---

status: EXEC-READY
date: 2026-04-23
stack: Node.js / TypeScript / Supabase / Jest
purpose: Deterministic failure injection for financial pipeline
---------------------------------------------------------------

# 1. Philosophy

This harness does NOT test business logic.

It tests:

* transactional guarantees
* event propagation correctness
* recovery under failure

All failures are **intentional and controlled**.

---

# 2. Directory Structure

```text
/tests/failure/
  ├── harness/
  │   ├── failure-flags.ts
  │   ├── injectors.ts
  │   ├── test-utils.ts
  │
  ├── scenarios/
  │   ├── atomicity.test.ts
  │   ├── duplicate-delivery.test.ts
  │   ├── crash-recovery.test.ts
  │   ├── projection-rebuild.test.ts
  │
  └── fixtures/
      ├── sample-events.ts
```

---

# 3. Failure Flags (Core Control Plane)

```ts
// harness/failure-flags.ts

export const FailureFlags = {
  BEFORE_OUTBOX: false,
  AFTER_COMMIT: false,
  IN_CONSUMER: false,
  AFTER_PROCESS: false,
  PROJECTION_WRITE: false,
}

export function shouldFail(flag: keyof typeof FailureFlags) {
  return FailureFlags[flag]
}
```

---

# 4. Injection Hooks (Drop into real code)

## WRITE PATH (PFT / GRIND)

```ts
// services/financial/write.ts

import { shouldFail } from '@/tests/failure/harness/failure-flags'

async function writeFinancialEvent(tx, data) {
  if (shouldFail('BEFORE_OUTBOX')) {
    throw new Error('FAIL_BEFORE_OUTBOX')
  }

  await tx.insert('pft', data)

  await tx.insert('outbox', buildEvent(data))

  if (shouldFail('AFTER_COMMIT')) {
    process.exit(1) // simulate crash
  }
}
```

---

## CONSUMER PATH

```ts
// workers/outbox-consumer.ts

import { shouldFail } from '@/tests/failure/harness/failure-flags'

async function processEvent(event) {
  if (shouldFail('IN_CONSUMER')) {
    throw new Error('FAIL_IN_CONSUMER')
  }

  await applyProjection(event)

  if (shouldFail('AFTER_PROCESS')) {
    process.exit(1)
  }

  await markProcessed(event.id)
}
```

---

## PROJECTION LAYER

```ts
// projections/table-metrics.ts

import { shouldFail } from '@/tests/failure/harness/failure-flags'

export async function applyProjection(event) {
  if (shouldFail('PROJECTION_WRITE')) {
    throw new Error('FAIL_PROJECTION_WRITE')
  }

  await db.upsert('table_projection', compute(event))
}
```

---

# 5. Test Utilities

```ts
// harness/test-utils.ts

export async function resetSystem() {
  await db.truncate('outbox')
  await db.truncate('projections')
}

export async function runConsumer() {
  await consumer.processBatch()
}

export async function getState() {
  return {
    outbox: await db.select('outbox'),
    projections: await db.select('table_projection'),
  }
}
```

---

# 6. Scenario Tests

---

## TEST — Atomicity

```ts
// scenarios/atomicity.test.ts

import { FailureFlags } from '../harness/failure-flags'

test('PFT and outbox are atomic', async () => {
  FailureFlags.BEFORE_OUTBOX = true

  await expect(createBuyIn()).rejects.toThrow()

  const state = await getState()

  expect(state.outbox.length).toBe(0)
  expect(state.projections.length).toBe(0)
})
```

---

## TEST — Crash Recovery

```ts
test('event survives crash after commit', async () => {
  FailureFlags.AFTER_COMMIT = true

  try {
    await createBuyIn()
  } catch {}

  // simulate restart
  FailureFlags.AFTER_COMMIT = false

  await runConsumer()

  const state = await getState()

  expect(state.projections.length).toBe(1)
})
```

---

## TEST — Duplicate Delivery

```ts
test('duplicate processing is idempotent', async () => {
  await createBuyIn()

  await runConsumer()
  await runConsumer() // duplicate run

  const state = await getState()

  expect(state.projections[0].amount).toBe(100) // not 200
})
```

---

## TEST — Projection Failure Recovery

```ts
test('projection failure retries correctly', async () => {
  FailureFlags.PROJECTION_WRITE = true

  await createBuyIn()

  await expect(runConsumer()).rejects.toThrow()

  FailureFlags.PROJECTION_WRITE = false

  await runConsumer()

  const state = await getState()

  expect(state.projections.length).toBe(1)
})
```

---

## TEST — Replay Determinism

```ts
test('projections rebuild deterministically', async () => {
  await createBuyIn()
  await createBuyIn()

  await runConsumer()

  const snapshot = await getState()

  await db.truncate('projections')

  await replayAllEvents()

  const rebuilt = await getState()

  expect(rebuilt.projections).toEqual(snapshot.projections)
})
```

---

# 7. CI Integration

Add:

```bash
npm run test:failure
```

Run:

* before release
* after schema changes
* after consumer logic changes

---

# 8. Observability Hooks (REQUIRED)

Log:

```ts
{
  event_id,
  retry_count,
  processing_time,
  failure_reason
}
```

Track:

* outbox backlog size
* retry spikes
* projection lag

---

# 9. Anti-Patterns (DO NOT DO)

❌ mocking the DB completely
→ you lose transactional guarantees

❌ skipping crash tests
→ your system is unproven

❌ asserting only “success”
→ you miss failure behavior

---

# 10. Closing

This harness validates:

* your transactional outbox is real
* your consumers are idempotent
* your projections are rebuildable

If this suite passes:

> your architecture is not theoretical
> it is **failure-hardened**

---
 Recommended sequence

  1. Reconcile (small, hours not days) — update ADR-FINANCIAL-EVENT-PROPAGATION §4 and ADR-FINANCIAL-FACT-MODEL D1 to adopt the SRC's four-value taxonomy; update SRC §10 completeness shape; reframe SRC §K1
  coverage formula.
  2. Freeze all four documents together — three ADRs + SRC as a bound set. SRC becomes the detailed companion to ADR-FINANCIAL-EVENT-PROPAGATION §4.
  3. Ship SRC implementation as Wave 1 — API label envelope, UI split displays, ban unlabeled totals. No schema changes. This is the immediate-value wedge and it ships before the ADRs' structural work.
  4. Ship the dual-layer / outbox work as Wave 2 — schema changes, outbox producers, consumer refactor. The surfaces keep working throughout because the label envelope already exists.