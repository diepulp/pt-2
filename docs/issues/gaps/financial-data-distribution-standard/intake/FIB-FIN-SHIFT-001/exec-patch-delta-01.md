# EXEC-073 PATCH DELTA — Safety Constraints & Drift Prevention

---

status: PATCH
target: EXEC-073
date: 2026-04-24
intent: Close remaining semantic drift + enforcement gaps
---------------------------------------------------------

# 1. Anti-Inference Rule (MANDATORY)

## Add

No downstream layer may derive financial authority from raw fields.

Forbidden sources of inference:

* metric_type
* numeric values
* nullability / presence
* table context

---

## Rule

Authority MUST originate exclusively from:

→ service-layer mapping

---

## Rationale

Prevents reintroduction of split-brain via implicit logic.

---

# 2. Mapper Invariants (MANDATORY)

## Add

All authority mappings MUST be exhaustively test-covered.

---

## Required coverage

* each MetricType → authority mapping
* invalid / unknown MetricType
* regression snapshot tests

---

## Rule

No financial classification may exist outside the mapper.

---

## Rationale

Centralization introduces systemic risk:

→ one bug = global corruption

Tests become the containment mechanism.

---

# 3. Envelope Drift Visibility (SOFT ENFORCEMENT)

## Add

Envelope parsing MUST log unknown keys.

---

## Implementation (non-breaking)

```ts
const parsed = financialValueSchema.parse(input)

const unknownKeys = Object.keys(input).filter(
  k => !(k in parsed)
)

if (unknownKeys.length > 0) {
  logger.warn('Envelope unknown keys detected', {
    unknownKeys
  })
}
```

---

## Constraint

* DO NOT reject
* DO NOT enforce `.strict()` yet

---

## Rationale

Zod default behavior strips unknown keys silently ([Zod][1])

`.strict()` would throw runtime errors on extra keys ([GitHub][2])

We want:

→ visibility without disruption

---

# 4. Mapper Exclusivity Guard

## Add

No alternative authority mapping logic may exist.

---

## Enforcement (CI / grep rule)

Search patterns to block:

```text
metric_type ===
type === 'actual'
type === 'estimated'
```

outside mapper scope.

---

## Rationale

Prevents shadow classification logic.

---

# 5. Cross-Surface Consistency Invariant

## Add

Same source data MUST produce identical envelope classification across all surfaces.

---

## Example invariant

```text
rating_slip.buyin

→ shift dashboard = estimated
→ report surface = estimated
→ alerts = estimated
```

---

## Rule

No surface may reinterpret classification.

---

## Rationale

Prevents presentation-layer split brain.

---

# 6. Mapper Failure Containment (NEW)

## Add

Mapper must fail closed on unknown MetricType.

---

## Implementation

```ts
switch(metric_type) {
  case '...':
    return ...
  default:
    throw new Error('Unknown MetricType')
}
```

---

## Constraint

* no fallback classification
* no silent defaults

---

## Rationale

Silent fallback = undetectable corruption

---

# 7. Phase Boundary Reinforcement

## Add

This execution spec MUST NOT:

* introduce event constructs
* introduce outbox logic
* emit propagation metadata

---

## Rule

Execution remains within:

→ semantic authority routing only

---

## Rationale

Maintains alignment with:

Phase 1 → truth
Phase 2 → movement

---

# 8. Final Constraint

## Add

If any layer:

* mutates envelope
* reclassifies authority
* derives semantics

→ it is a contract violation.

---

# 9. Outcome

After applying this patch:

* semantic authority is sealed
* drift becomes observable
* mapper becomes enforceable boundary
* rollout remains non-breaking

---

# 10. Closing

This patch does not change behavior.

It prevents:

→ silent regression back into ambiguity

---

[1]: https://odocs-zod.vercel.app/?utm_source=chatgpt.com "Zod | Documentation"
[2]: https://v3.zod.dev/?id=passthrough&utm_source=chatgpt.com ".passthrough"
