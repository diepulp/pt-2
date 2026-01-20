MTL is part of how you detect when the CTR threshold is met, but it does not “turn into” a CTR, and it generally doesn’t stop when you file a CTR. Think of it like this:

MTL = internal log / control used to record and aggregate currency activity (often at ~$2.5k–$3k thresholds) so you can monitor for structuring and ensure you don’t miss a report.

CTR = external regulatory filing/report required when cash-in or cash-out totals exceed $10,000 in a gaming day (aggregated; cash-in/out aggregated separately, not netted).

What happens when CTR threshold is met?
Normal practice / best mapping

Both are tracked.

You keep logging transactions (MTL continues) because:

It’s your audit trail of the day’s currency movement

It supports AML monitoring (structuring, velocity, patterns)

A CTR is then prepared/triggered as a separate workflow artifact (“CTR case” or “CTR filing record”) that references the same underlying events.

There’s nothing in the rules that says “stop logging once you file CTR.” The obligation is to report qualifying aggregated transactions; MTL is an internal mechanism that helps you identify and document them.

Key compliance detail

A CTR is required for transactions “more than $10,000” in a gaming day (cash in or cash out).


And you cannot offset cash-out against cash-in when aggregating.
UI/implementation mapping that matches “paper reality” and stays MVP
Data layer

Keep MTL events as mtl_entry rows (append-only).

Add/maintain an aggregate view per patron+gaming_day (mtl_gaming_day_summary).

UX behavior

Before log threshold (~$2.5k–$3k): no MTL row (or it’s hidden), unless staff starts it manually.

After log threshold: show the MTL grouped row; each new buy-in logs as a new event line (timestamped).

When CTR threshold is exceeded (> $10k cash-in OR > $10k cash-out):

The summary row flips to CTR REQUIRED (badge)

UI presents “Start CTR Filing” (or “Generate CTR packet”)

CTR form is instantiated as a separate record linked to:

patron_id, casino_id, gaming_day

the list of contributing mtl_entry ids (or a query definition that re-derives them)

MTL continues for the rest of the gaming day (because more transactions can happen and may matter for SAR/structuring patterns).

Answering your direct question

Both forms are tracked, or MTL tracking stops and becomes a CTR?

Both are tracked. MTL does not “become” a CTR.
CTR is a filing event/workflow that is derived from the day’s currency transactions that your MTL (and other logs) help you aggregate.

MVP-safe rule of thumb (so you don’t overbuild)

MTL: always append events for the day once logging starts.

CTR: one “CTR required” state per patron per gaming_day, with a separate CTR artifact for the filing workflow.

No case management, no approvals, no document storage beyond what you absolutely need for pilot.