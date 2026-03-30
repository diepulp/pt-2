## Date Handling Investigation — Findings

### The System Has No Canonical Date Strategy

There is **no centralized date validation utility**. Unlike `uuidSchema` (in `lib/validation/uuid.ts`), there is no `dateSchema` or `datetimeSchema`. Every service rolls its own.

### Two Competing Patterns on the Server

| Pattern | Used By | Accepts | Rejects |
|---------|---------|---------|---------|
| `z.iso.datetime()` | exclusion, visit, casino, mtl, loyalty/promo, rating-slip | `2026-03-22T00:00:00.000Z` | `2026-03-22` |
| Regex `YYYY-MM-DD` | player birth_date, visit from/to filters, gaming_day, loyalty date filters | `2026-03-22` | `2026-03-22T00:00:00.000Z` |

These two patterns are **mutually exclusive** — a value valid for one always fails the other.

### Two Competing Patterns on the Client

| Component | Input Type | Transformation |
|-----------|-----------|----------------|
| `create-exclusion-dialog.tsx` | `type="date"` | `new Date(\`${v}T00:00:00\`).toISOString()` (just added) |
| `create-program-dialog.tsx` | `type="datetime-local"` | `new Date(val).toISOString()` |
| `program-detail-client.tsx` | `type="datetime-local"` | `new Date(val).toISOString()` |
| `identity-form.tsx` | `type="date"` | **None — passes `YYYY-MM-DD` directly** |
| `form-section-start-time.tsx` | `type="datetime-local"` | **None — stored as-is** |

### The Exclusion Bug Was a Symptom, Not the Disease

The real issue: **the server schema chose `z.iso.datetime()` for fields that are semantically dates (effective_from, review_date), not timestamps**. An exclusion effective date is a calendar date — "this exclusion starts March 22nd" — not "this exclusion starts at 2026-03-22T07:00:00.000Z". The fix I applied (converting in the client) works, but it papers over a semantic mismatch.

### Where This Pattern Is Correct vs Incorrect

**`z.iso.datetime()` is right for:**
- `ended_at`, `started_at`, `created_at` — these are point-in-time timestamps
- `occurred_at` — MTL transaction time
- Promo `startAt`/`endAt` — campaigns start at a specific moment

**`z.iso.datetime()` is wrong for:**
- `effective_from` / `effective_until` — calendar dates (when does this exclusion apply?)
- `review_date` — calendar date (when should we review this?)
- `gaming_day` — already correctly uses YYYY-MM-DD regex
- `birth_date` — already correctly uses YYYY-MM-DD regex

### The Regression Risk

Right now nothing else is broken because:
- Birth dates and gaming days use the regex pattern (correct)
- The promo dialogs use `datetime-local` inputs with ISO conversion (works)
- The exclusion dialog was the **only place** pairing `type="date"` input with a `z.iso.datetime()` server schema

But if any future feature uses `type="date"` for a field validated with `z.iso.datetime()`, it will hit the same bug.

### Recommended Standardization

The clean fix is two things:

1. **Server**: Change exclusion date fields from `z.iso.datetime()` to the YYYY-MM-DD regex pattern used everywhere else for calendar dates. The CRUD layer already handles conversion to ISO for Postgres.

2. **Shared utility**: Create `lib/validation/date.ts` with canonical schemas:
   - `dateSchema()` → YYYY-MM-DD for calendar dates
   - `datetimeSchema()` → `z.iso.datetime()` for timestamps

