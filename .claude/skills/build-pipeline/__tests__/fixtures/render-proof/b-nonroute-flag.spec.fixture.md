---
prd: PRD-XXX
title: In-component derived surface WITH primary flag
renders_derived_value_surface: true
---

# B-nonroute-flag

A derived value computed in a server component/hook with NO `*Projection` GET
route. There is no mechanical route signal here, so detection depends SOLELY on
the human-set primary flag (which is set). MUST be detected via the primary flag:
classification=derived_value, signal=primary_flag.

```tsx
export function WinLossPanel({ wins, losses }: { wins: number; losses: number }) {
  const net = wins - losses; // derived in-component, no projection route
  return net;
}
```
