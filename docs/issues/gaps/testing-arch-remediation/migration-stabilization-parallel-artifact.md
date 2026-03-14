# Parallel Artifact — Migration Stabilization During Integration Test Remediation

## Purpose

This note clarifies how the migration-volume problem should be handled **in parallel** with integration test remediation.

It exists to prevent a common failure mode:

> trying to solve the entire migration-history mess before restoring a trustworthy test signal.

That would be backward.

---

## Plain conclusion

**Do not pause integration test remediation until the full migration history is cleaned up.**

You do **not** need to mentally replay 300+ migrations to establish a sound testing surface.

What you need is narrower and more practical:

- a **fresh database** that can apply the current migration chain successfully
- a **known-good schema state**
- a **verified baseline snapshot**
- a **small trusted integration test signal** running against that reality

So the right framing is:

- **full migration archaeology is not a prerequisite**
- **minimal migration stabilization is**

---

## Why not fix migrations first?

Because “fix migrations first” easily turns into a bottomless archaeology expedition:

- hundreds of files amending each other
- historical pivots that no longer matter
- contract drift across SRM / SEC / schema cleanups
- endless temptation to cosmetically purify history before proving present reality works

That path burns time without restoring runtime confidence.

The real objective is not “beautiful history.”

The objective is:

**prove the current database state is coherent enough to serve as the test baseline.**

---

## What the migration plan already establishes

The migration triage direction already makes the key point:

- the raw count of migrations is **not** the true limiter
- the real problem is **human and operational churn**
- the answer is **baseline checkpointing**, not endless historical rumination

In other words:

you do not need to understand every old migration in sequence in order to move forward sanely.

You need a **green current baseline**.

---

## Relationship to the integration test problem

The integration test issue and the migration issue are related, but they are **not the same problem**.

### Integration remediation needs:
- correct test environment (`node`, not `jsdom`)
- honest test taxonomy
- working local Supabase/Postgres
- a small trusted canary suite
- CI enforcement after a green baseline exists

### Migration stabilization needs:
- fresh application of the current migration chain
- validation that the resulting schema is coherent
- a schema-only baseline snapshot
- forward governance to reduce future churn

These tracks should run **in parallel**, with a narrow handshake between them.

---

## The handshake between the two tracks

Integration remediation should not depend on a grand migration cleanup.

It should depend on only this:

### Required migration-side output
A **verified schema baseline** that says:

- the current migration chain applies cleanly on a fresh DB
- required security / schema checks pass
- the resulting schema is stable enough to test against
- a snapshot of that state is committed

That becomes the testing surface.

Once that exists, integration remediation can proceed against a real, named baseline instead of vague historical fog.

---

## Recommended order of operations

## Track A — Restore integration test honesty
1. Split test environments properly
2. Move DB-backed integration tests to `node`
3. Prove the harness on one representative file
4. Audit shared integration helpers
5. Restore one bounded-context slice
6. Define a small trusted canary suite

## Track B — Stabilize migrations just enough
1. Spin up a fresh DB
2. Apply the existing migration chain once
3. Run essential schema / security / acceptance checks
4. Dump a schema-only baseline snapshot
5. Treat that snapshot as the current truth
6. Backlog broader migration archaeology unless immediately required

These tracks can overlap.

They should **not** block each other except at the baseline handoff point.

---

## What “enough migration work” means

You need enough migration work to answer:

- Can a fresh database be built from the current chain?
- Does the resulting schema match the current contract closely enough?
- Can integration tests target that state without ambiguity?

If yes, that is enough to proceed.

You do **not** need, right now:

- historical elegance
- migration squashing theater
- full cleanup of all past churn
- perfect explanatory clarity for every old file

That is future governance work, not the admission ticket to test remediation.

---

## What should be deferred

Unless directly required to get a green baseline, defer:

- bulk historical cleanup
- aesthetic migration consolidation
- broad rename campaigns
- aggressive schema reshaping
- non-critical churn cleanup

Those belong in controlled follow-up work after the testing surface is restored.

---

## Practical policy

Use this policy during remediation:

### Do now
- baseline creation
- fresh-DB apply verification
- contract-critical fixes
- small forward migrations if needed to repair obvious blockers
- schema snapshotting
- CI drift controls after the baseline exists

### Do later
- migration archaeology
- cleanup for readability alone
- consolidation for beauty
- old-history rationalization

---

## Operational rule of thumb

Ask one ugly but useful question:

> “Does this migration work help establish a green present-day baseline for tests?”

If the answer is **yes**, it belongs in the current remediation stream.

If the answer is **no**, and it mainly serves neatness, it is probably backlog material.

---

## Recommended stance for PT-2

For this project, the sane posture is:

- **fix test architecture now**
- **stabilize migration baseline in parallel**
- **avoid grand historical purification**
- **use the verified baseline as the shared truth**
- **resume forward work with smaller, deliberate migrations**

That keeps the effort tethered to present runtime confidence instead of disappearing into the append-only disaster museum.

---

## Final verdict

You are correct that digging through 300+ migrations to “establish a sound testing surface” is mental.

So don’t do that.

Do the minimum migration stabilization required to create a **green, named, verified baseline**, and let the integration remediation proceed against that.

That is the sane split:

**not full cleanup first, not migration denial either — baseline stabilization in parallel with test restoration.**
