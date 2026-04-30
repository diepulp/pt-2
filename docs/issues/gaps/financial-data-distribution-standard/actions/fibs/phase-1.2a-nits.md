⚠️ 1. Over-validating pass-through

You’re dangerously close to turning this into:

“prove every route is pass-through”

You don’t need that.

Because:

absence of transformation logic ≠ something to test exhaustively
What to do instead

Treat pass-through as:

assumed invariant + spot verification

Not:

full audit target
⚠️ 2. Misclassifying Phase 1.1 gaps as 1.2 work

You said:

“route calls a service which hasn’t been wrapped yet”

Correct classification:

Phase 1.1 defect

Wrong move would be:

“fix it in the route”

If that happens, you recreate split-brain immediately.

⚠️ 3. Casino ID problem is bigger than you framed

You called it:

transport concern

Yes — but more precisely:

RLS boundary violation

That’s not just “clean it up”.

That’s:

must fix before anything else touches the route layer

This is actually the only real Phase 1.2A work.

🧭 Correct Phase 1.2A reframed (based on your insight)

Your phase is now:

Phase 1.2A = confirm transport honesty, not rebuild transport

Which reduces to:

DO:
ensure routes don’t mutate financial data
remove casino_id leakage
ensure DTO is passed through unchanged
DO NOT:
refactor routes
introduce new abstractions
wrap/unwrap anything
“improve” DTO handling
🪓 Minimal execution plan (aligned with guardrail)

You only need 3 actions:

1. grep for `/100` in routes → confirm none
2. grep for `casino_id` usage → remove / isolate
3. spot-check 1–2 routes per family

That’s it.

Not:

34 routes
full audit
new tests
structural rewrite