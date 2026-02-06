# Param Normalization Standard
**ID:** PARAM-NORMALIZATION-001  
**Status:** Draft  
**Scope:** All Supabase RPC calls and query construction across PT-2 bounded contexts.  
**Goal:** Eliminate systemic `null` vs `undefined` mismatches that bypass defaults, widen/empty filters, and cause silent “successful null” results.

---

## 0) Prime Directive
**Optional inputs in TypeScript are represented as `undefined` (omitted), not `null`.**

- `undefined` / missing key → “caller did not provide a value”
- `null` → “caller explicitly provided NULL”

These are **not equivalent** in Postgres default args, `COALESCE`, and query semantics.

---

## 1) Allowed / Forbidden

### Allowed
- Passing **no args** to RPC: `supabase.rpc('rpc_name')`
- Passing args with omitted optionals: `supabase.rpc('rpc_name', { required, optional: undefined })` *(after normalization, `optional` is removed)*
- Using `null` **only** when the DB column/contract explicitly stores or requires NULL.

### Forbidden (contract violations)
- Sending `{ some_optional: null }` for any optional arg that should be omitted to use defaults
- Treating `null` and `undefined` as interchangeable in RPC args or query builders
- Using `as any` / `as unknown as` to bypass typing and push nulls through

---

## 2) Standard Helper: `omitUndefined`
All RPC args **must** be normalized at the boundary.

```ts
export function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
```

### Standard RPC usage
```ts
const args = omitUndefined({
  required_id,
  start_gaming_day,      // string | undefined
  end_gaming_day,        // string | undefined
  include_archived,      // boolean | undefined
});

const { data, error } = await supabase.rpc('rpc_name', args);
```

**Rule:** If an RPC arg is optional, it must be `T | undefined` in TS and must be removed from the payload when undefined.

---

## 3) Query Builder Standard (filters)
Filters are only applied when the filter value is **defined**.

```ts
let q = supabase.from('table').select('*');

if (gaming_day_start !== undefined) q = q.gte('gaming_day', gaming_day_start);
if (gaming_day_end !== undefined) q = q.lte('gaming_day', gaming_day_end);
if (status !== undefined) q = q.eq('status', status);
```

### Forbidden
```ts
q.eq('status', status ?? null); // DO NOT: introduces NULL comparisons / empty results
```

---

## 4) DB-side normalization (optional but recommended)
For RPCs that accept optional filters, choose one of these strategies and apply consistently:

### Strategy A — Fail fast (preferred for contract params)
If a param must be omitted (undefined) rather than NULL:
- explicitly reject NULL and raise an exception

### Strategy B — Normalize (preferred for filter params)
Treat explicit NULL the same as “not provided”:
- `p := COALESCE(p, <default>)` **only** if NULL is semantically “unset”
- or use explicit checks like:
  - `IF p IS NULL THEN ... END IF;`

**Policy:** Defaults should be driven by **omission** when possible; normalization is only for resilience.

---

## 5) Guardrails
### G1 — No `null` for optional RPC args
Add a lint/grep check to flag obvious violations:

- `rpc\(.*\{[^\}]*:\s*null` (heuristic)
- `\.(eq|gte|lte|gt|lt)\([^\)]*,\s*null\)` (heuristic)

### G2 — No `.rpc as any`
Any `.rpc` bypass is forbidden outside a single explicitly allowed migration shim file (and should be deleted once types are current).

---

## 6) DoD
A bounded-context refactor that touches RPCs/queries is “done” when:

- [ ] All RPC arg objects pass through `omitUndefined`
- [ ] No RPC optional args are sent as `null`
- [ ] Query filters are only applied when values are defined
- [ ] No `as any` / `as unknown as` used to bypass `.rpc` typing
- [ ] Unit tests include at least one “optional omitted” case and one “explicit null rejected/normalized” case (depending on chosen strategy)

---

## Appendix A — Quick Diagnosis
- “RPC default not applied” → you probably sent `null` instead of omitting the arg
- “Empty results despite data” → you probably built a filter with `= NULL` semantics
- “Works in one context, fails in another” → inconsistent null/undefined handling across services
