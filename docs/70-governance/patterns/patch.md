Surgical patch recommendations

Add these three lines to the PRD and you’re solid:

(1) Precondition gate
If any FinancialValue.value feeding start-from-previous.tsx is not integer cents,
this PRD is invalid and execution must halt.
(2) Stronger Q-4 condition
Q-4 audit must confirm no formatter (direct or indirect) consumes FinancialValue.value
using dollar-based assumptions.
(3) Hard boundary on scope assumption
Discovery of additional call sites invalidates the slice and requires re-scoping,
not incremental amendment.