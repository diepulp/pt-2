# PlayerImportService

CSV player import pipeline for casino onboarding.

## Bounded Context

- **Service**: PlayerImportService
- **Domain**: Onboarding
- **Owned Tables**: `import_batch`, `import_row`
- **Cross-Context Writes**: `player` (PlayerService), `player_casino` (CasinoService) — via SECURITY DEFINER RPCs only
- **Pattern**: C (Hybrid) — Pattern A canonical contracts + Pattern B CRUD DTOs

## RPCs

| RPC | Purpose |
|-----|---------|
| `rpc_import_create_batch` | Create batch (idempotent via idempotency_key) |
| `rpc_import_stage_rows` | Stage rows with 10k cap enforcement |
| `rpc_import_execute` | Execute merge with 3-outcome routing |

## Dependencies

- ADR-024: Authoritative context derivation
- ADR-030: Write-path session-var enforcement
- ADR-036: CSV Player Import Strategy

## Files

| File | Purpose |
|------|---------|
| `dtos.ts` | DTOs: ImportPlayerV1 (A), ImportBatchDTO/ImportRowDTO (B), report, filters |
| `schemas.ts` | Zod schemas: importPlayerV1Schema, batch/row/query schemas |
| `keys.ts` | React Query key factory |
| `mappers.ts` | Row → DTO transformations (100% coverage target) |
| `crud.ts` | CRUD operations via RPCs + RLS-protected reads |
| `http.ts` | Client-side HTTP fetchers with idempotency support |
| `index.ts` | Service factory with explicit interface |
