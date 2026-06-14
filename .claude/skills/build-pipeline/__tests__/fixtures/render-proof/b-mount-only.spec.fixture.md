---
prd: PRD-XXX
title: Mounted component reference only
---

# B-mount — mount is NOT a Stage-3 classification signal (FIB §F.3)

This spec references a component mounted on an operator surface, but declares no
primary flag and exposes no `*Projection` GET route. "Mounted on an operator
surface" is a Phase-4 verification concern, not a Stage-3 signal.
classify-render-path.py MUST return classification=none.

The WinLossTrendChart component is mounted on the shift dashboard surface and
rendered for the pit boss. It is wired into the dashboard mount tree.
