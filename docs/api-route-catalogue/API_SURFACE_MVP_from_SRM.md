# API Surface — MVP (Pre-seeded from SRM)
> **Superseded**: see `docs/api-route-catalogue/API_SURFACE_MVP.md` for the canonical, fully detailed catalogue. Keep this file for historical reference only.
**Date**: 2025-10-24
**Contract**: `ServiceHttpResult<T>` (ok, code, status, requestId, durationMs, timestamp)
**Transport**: Route Handlers for React Query; Server Actions for forms

> All write routes accept `Idempotency-Key` header; server dedupes via ledger/constraint.

## Player
### POST /api/player/create
- Request: PlayerCreateDTO
- Response: PlayerDTO
- Notes: Creates player profile

### PATCH /api/player/{id}
- Request: PlayerUpdateDTO
- Response: PlayerDTO

### GET /api/player/{id}
- Response: PlayerDTO

### GET /api/player/search?q=…&casinoId=…&page=…
- Response: { items: PlayerDTO[], nextCursor?: string }

## Visit
### POST /api/visit/start
- Request: VisitCreateDTO (player_id, casino_id, started_at?)
- Response: VisitDTO

### POST /api/visit/end
- Request: VisitEndDTO (visit_id, ended_at?)
- Response: VisitDTO

### GET /api/visit/{id}
- Response: VisitDTO

## Rating Slip (telemetry only)
### POST /api/rating-slip/create
- Request: RatingSlipCreateDTO (player_id, casino_id, table_id?, start_time?, game_settings?)
- Response: RatingSlipDTO

### PATCH /api/rating-slip/{id}  (update telemetry)
- Request: RatingSlipUpdateDTO (average_bet?, end_time?, status?, policy_snapshot?)
- Response: RatingSlipDTO

### POST /api/rating-slip/close
- Request: RatingSlipCloseDTO (rating_slip_id, end_time?)
- Response: RatingSlipDTO

### GET /api/rating-slip/by-visit?visitId=…
- Response: { items: RatingSlipDTO[] }

## Loyalty (SoT for rewards)
### POST /api/loyalty/mid-session-reward
- Request: MidSessionRewardDTO (casino_id, player_id, rating_slip_id, staff_id, points, idempotency_key?)
- Response: { ledger_id: string, balance_after: number }
- Notes: Wraps `rpc_issue_mid_session_reward` atomically

## Finance (SoT for financial transactions)
### POST /api/finance/txn
- Request: CreateFinancialTxnDTO (casino_id, player_id, amount, tender_type?, visit_id?, rating_slip_id?, created_at?)
- Response: { id: string }
- Notes: Wraps `rpc_create_financial_txn`; `gaming_day` derived in DB trigger

## Table Context
### GET /api/table/available?casinoId=…
- Response: { items: GamingTableDTO[] }

### GET /api/table/{id}
- Response: GamingTableDTO

## MTL (Compliance)
### POST /api/mtl/entry
- Request: MtlEntryCreateDTO (casino_id, player_id, amount, direction, area?, staff_id?, rating_slip_id?, visit_id?, idempotency_key?)
- Response: MtlEntryDTO
- Notes: Immutable write-once; idempotent via `idempotency_key`

### POST /api/mtl/audit-note
- Request: MtlAuditNoteDTO (mtl_entry_id, staff_id, note)
- Response: MtlAuditNoteDTO

## Error Map
| code | http |
|------|------|
| OK | 200 |
| VALIDATION_ERROR | 400 |
| NOT_FOUND | 404 |
| UNIQUE_VIOLATION | 409 |
| FOREIGN_KEY_VIOLATION | 400 |
| UNAUTHORIZED | 401 |
| FORBIDDEN | 403 |
| INTERNAL_ERROR | 500 |

## Versioning
- Future breaking changes → `/v2/**`
