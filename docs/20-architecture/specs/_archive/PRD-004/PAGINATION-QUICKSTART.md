---
title: "Loyalty Ledger Pagination - Quick Reference"
prd: PRD-004
version: 1.0.0
status: REFERENCE
created: 2025-12-13
---

# Loyalty Ledger Pagination Quick Reference

**Full Specification**: `LEDGER-PAGINATION-CONTRACT.md`

---

## TL;DR

**Pattern**: Keyset (cursor-based) pagination
**Ordering**: `created_at DESC, id ASC`
**Cursor**: Base64-encoded JSON `{ created_at, id }`
**Endpoint**: `GET /api/v1/loyalty/ledger?player_id=xxx&casino_id=yyy&cursor=yyy&limit=20`

---

## SQL Snippet (RPC)

```sql
CREATE OR REPLACE FUNCTION rpc_get_player_ledger(
  p_casino_id uuid,
  p_player_id uuid,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (/* all columns */, has_more boolean)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ll.*,
    (row_number() OVER ()) > p_limit AS has_more
  FROM (
    SELECT *
    FROM loyalty_ledger
    WHERE casino_id = p_casino_id
      AND player_id = p_player_id
      AND (
        p_cursor_created_at IS NULL
        OR (created_at < p_cursor_created_at
            OR (created_at = p_cursor_created_at AND id > p_cursor_id))
      )
    ORDER BY created_at DESC, id ASC
    LIMIT p_limit + 1
  ) ll;
END;
$$;
```

---

## Index

```sql
CREATE INDEX idx_loyalty_ledger_pagination
  ON loyalty_ledger (casino_id, player_id, created_at DESC, id ASC);
```

---

## TypeScript Types

```typescript
interface LedgerPageResponse {
  entries: LedgerEntryDTO[];
  cursor: string | null;
  hasMore: boolean;
}

interface LedgerCursor {
  created_at: string;  // ISO 8601
  id: string;          // UUID
}

// Encoding
const cursor = Buffer.from(JSON.stringify({ created_at, id })).toString('base64url');

// Decoding (with validation)
const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
```

---

## Zod Schema

```typescript
export const ledgerListQuerySchema = z.object({
  casino_id: z.string().uuid(),
  player_id: z.string().uuid(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating_slip_id: z.string().uuid().optional(),
  reason: z.enum(['base_accrual', 'promotion', 'redeem', /* ... */]).optional(),
});
```

---

## Edge Cases

| Case | Behavior |
|------|----------|
| First page (no cursor) | Returns newest 20 entries, cursor for next page |
| Last page | `cursor = null`, `hasMore = false` |
| Empty results | `entries = []`, `cursor = null`, `hasMore = false` |
| Invalid cursor | `400 VALIDATION_ERROR` |
| New entry mid-pagination | Not returned (snapshot isolation at cursor) |
| Expired cursor | N/A (cursors never expire - append-only ledger) |

---

## Client Usage (React Query)

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

export function useLoyaltyLedger(playerId: string, casinoId: string) {
  return useInfiniteQuery({
    queryKey: ['loyalty', 'ledger', playerId, casinoId],
    queryFn: ({ pageParam }) =>
      fetch(`/api/v1/loyalty/ledger?player_id=${playerId}&casino_id=${casinoId}&cursor=${pageParam || ''}&limit=20`)
        .then(res => res.json())
        .then(res => res.data),
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined,
  });
}
```

---

## Performance

**Query Complexity**: O(log N + M)
- Index scan: ~1-5ms per page (with covering index)
- No degradation with pagination depth (keyset, not offset)

**Comparison**:
- Offset-based (`OFFSET 1000 LIMIT 20`): ~500ms for deep pages
- Keyset-based (this pattern): ~5ms for any page depth

---

## Implementation Checklist

**Database (WS2)**:
- [ ] Create `rpc_get_player_ledger`
- [ ] Create `idx_loyalty_ledger_pagination` index
- [ ] Test RPC with edge cases

**Service (WS3, WS4)**:
- [ ] Define `LedgerPageResponse`, `LedgerEntryDTO` in dtos.ts
- [ ] Implement `decodeLedgerCursor`, `encodeLedgerCursor` in cursor.ts
- [ ] Add `ledgerListQuerySchema` in schemas.ts
- [ ] Implement `getLedger(query)` in crud.ts

**Route Handler (WS5)**:
- [ ] Create `GET /api/v1/loyalty/ledger` route
- [ ] Validate query params with Zod
- [ ] Call service, wrap in `ServiceHttpResult`
- [ ] Handle cursor validation errors

**Tests (WS7)**:
- [ ] Cursor encoding/decoding roundtrip
- [ ] First/last/empty page scenarios
- [ ] Invalid cursor handling
- [ ] Race condition test
- [ ] EXPLAIN ANALYZE query plan

---

## References

- **Full Spec**: `LEDGER-PAGINATION-CONTRACT.md` (this directory)
- **Compliance Report**: `docs/issues/PRD-004-PAGINATION-CONTRACT-COMPLIANCE.md`
- **PRD-004**: `docs/10-prd/PRD-004-loyalty-service.md`
- **EXECUTION-SPEC**: `EXECUTION-SPEC-PRD-004.md` (this directory)
