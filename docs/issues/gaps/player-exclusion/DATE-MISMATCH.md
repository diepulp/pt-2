Now I have the full picture. Here's the finding:

---

## The Two-Commit Sequence

### Commit 1: `b90061a` (Mar 22) — The Correct Fix

This commit **correctly diagnosed** the root cause documented in `ISSUE-SYSTEM-DATE-CONVERSION-STANDARDIZATION.md`:

- `effective_from`, `effective_until`, and `review_date` are **calendar dates**, not timestamps
- The server schema was using `z.iso.datetime()` (requires `2026-03-22T00:00:00.000Z`)
- HTML `<input type="date">` produces `YYYY-MM-DD`
- **Fix**: Changed the server schema from `z.iso.datetime()` to `dateSchema('...')` (YYYY-MM-DD regex), created the canonical `lib/validation/date.ts` utility, and migrated 16 files system-wide

After this commit, the client sends `YYYY-MM-DD` and the server expects `YYYY-MM-DD`. **No client-side conversion needed.** This is aligned with the system standard.

### Commit 2: `14e02c5` (Mar 29) — The Regression

This commit was **unaware** of commit `b90061a`. Its comment says:

> *"HTML `<input type="date">` produces YYYY-MM-DD; server schema requires ISO 8601 datetime."*

But the server schema **no longer requires ISO 8601 datetime** — it was changed to `dateSchema()` (YYYY-MM-DD) a week earlier. This commit adds `toISO` converters in the client:

```typescript
const toISO = (v: string | undefined): string | undefined =>
  v ? new Date(`${v}T00:00:00`).toISOString() : undefined;
```

This converts `2026-03-22` → `2026-03-22T07:00:00.000Z`, which **now fails** the server's `dateSchema()` regex (`/^\d{4}-\d{2}-\d{2}$/`). That's exactly the error message the user sees:

> `effective_from must be YYYY-MM-DD format; effective_until must be YYYY-MM-DD format; review_date must be YYYY-MM-DD format`

### Root Cause

Commit `14e02c5` **re-introduced the bug it was trying to fix** because:

1. It was written against the **pre-`b90061a` state** of the server schema (when `z.iso.datetime()` was still in use)
2. It was unaware that `lib/validation/date.ts` and the `dateSchema()` migration existed
3. The client-side `toISO()` conversion now **actively conflicts** with the corrected server schema

### The Fix

Remove the `toISO`/`toISOOrNull` converters from `create-exclusion-dialog.tsx` and pass the `YYYY-MM-DD` strings through directly — which is exactly what `b90061a` intended.

Lines 101–105 should be deleted, and lines 115–117 reverted to pass the raw values:

```typescript
effective_from: values.effective_from || undefined,
effective_until: values.effective_until || null,
review_date: values.review_date || null,
```

### Was it due to unawareness of system standards?

**Yes, but indirectly.** The system's date standardization issue doc (`ISSUE-SYSTEM-DATE-CONVERSION-STANDARDIZATION.md`) existed and the canonical fix (`b90061a`) had already been applied. Commit `14e02c5` operated on the **stale mental model** that the server still used `z.iso.datetime()` for these fields, without checking the current schema. The `lib/validation/date.ts` utility and the `dateSchema()` migration were the system's response to exactly this class of bug — and the commit bypassed both.