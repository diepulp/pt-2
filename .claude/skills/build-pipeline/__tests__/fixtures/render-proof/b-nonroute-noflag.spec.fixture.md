---
prd: PRD-XXX
title: In-component derived surface WITHOUT primary flag (intended escape)
---

# B-nonroute-noflag — INTENDED NEGATIVE (FIB §F.3 / §K.5 honor-system limit)

A derived value computed in a server component/hook with NO `*Projection` GET
route AND NO primary flag. This trips NEITHER mechanical signal. Per §F.3 the
`*Projection` backstop covers route-based surfaces ONLY; the non-route hole is
DECLARED-OPEN. classify-render-path.py MUST return classification=none — this is
the intended honor-system limit, NOT a bug.

```tsx
export function WinLossPanel({ wins, losses }: { wins: number; losses: number }) {
  const net = wins - losses; // derived in-component, escapes detection by design
  return net;
}
```
