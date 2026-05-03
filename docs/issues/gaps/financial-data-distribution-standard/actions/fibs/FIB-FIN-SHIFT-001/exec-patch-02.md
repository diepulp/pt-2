# EXEC-073 PATCH DELTA — Mapper Enforcement Fix

---

status: PATCH
target: EXEC-073 (WS1)
date: 2026-04-24
intent: Enforce mapper usage + eliminate dead-read ambiguity
------------------------------------------------------------

# 1. Replace Dead-Read with Explicit Assertion

## Problem

Current pattern:

```
resolveShiftMetricAuthority(metric_type)
```

Result is unused → removable → not enforceable.

---

## Change

Replace dead-read with explicit assertion:

```ts
const authority = resolveShiftMetricAuthority(row.metric_type as MetricType);

// Phase 1.1 invariant: authority must resolve without error
if (row.metric_type !== 'hold_percent' && authority === null) {
  throw new Error('Unexpected null authority for non-hold metric');
}
```

---

## Constraint

* DO NOT assign to DTO
* DO NOT expose authority
* DO NOT mutate envelope

---

## Outcome

* ensures function is not removable
* ensures mapping stays valid
* preserves Phase 1.1 contract

---

# 2. Guard Against Invalid MetricType at Boundary

## Add (WS2 — normalization layer)

```ts
if (!VALID_METRIC_TYPES.includes(r.metric_type)) {
  throw new Error(`Invalid metric_type from DB: ${r.metric_type}`);
}
```

---

## Constraint

* VALID_METRIC_TYPES must match MetricType union
* no silent coercion

---

## Outcome

* prevents unsafe `as MetricType` cast
* shifts failure earlier (boundary, not mapper)

---

# 3. Mapper Usage Invariant Test

## Add (WS3)

```ts
it('mapper must call resolveShiftMetricAuthority', () => {
  const spy = jest.spyOn(module, 'resolveShiftMetricAuthority');

  mapShiftAlertRow(mockRow);

  expect(spy).toHaveBeenCalled();
});
```

---

## Outcome

* prevents accidental removal
* enforces contract at test level

---

# 4. Cross-Surface Consistency Guard (Lightweight)

## Add (WS3 or integration)

```ts
expect(resolveShiftMetricAuthority('drop_total')).toEqual(
  resolveShiftMetricAuthority('drop_total')
);
```

---

## Purpose

Placeholder invariant — extend later across surfaces.

---

# 5. Final Constraint

## Add

Mapper must be:

* the ONLY authority derivation point
* ALWAYS invoked
* NEVER bypassed

---

# 6. Outcome

After patch:

* mapper becomes enforceable (not advisory)
* invalid data fails early
* dead-read ambiguity removed
* Phase 1.2 cannot bypass routing logic

---
