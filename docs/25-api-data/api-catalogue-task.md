What “end-to-end” includes

Canonical route list per domain (Player, Visit, RatingSlip, Table Context, Loyalty, Finance, MTL, Casino).

For each route: Method + Path, Zod DTOs (req/resp), error codes (from the error map), auth/RBAC note, idempotency policy, pagination/cursor rules, rate-limit note, and observability fields (requestId, durationMs).

Versioning stance (/v1 now, migration notes for future /v2).

cURL examples (1–2 per domain) for sanity.

Traceability to SRM (who owns it / invariants it relies on).

What’s already in place

A pre-seeded working doc: API_SURFACE_MVP_from_SRM.md (downloadable above).

Error map, idempotency, observability, and state-management conventions defined in `@docs/patterns`.

Fill these blanks (fast pass)

Lock the route list per domain (add/remove any endpoints): edit API_SURFACE_MVP_from_SRM.md.

Paste or link Zod schemas for each request/response DTO.

Add auth/RBAC notes per route (link to RLS/RBAC Matrix).

Specify idempotency per write route (header used? dedupe strategy?).

Declare pagination (offset vs cursor) on list/search routes.

Add 2 cURL examples per domain.

Where to store

Keep the catalog as the working source of truth:
25-api-data/API_SURFACE_MVP.md (promote the generated file to this path).

## OpenAPI/Swagger Setup

The API specification is now available in OpenAPI 3.1 format:
- **Spec**: `25-api-data/api-surface.openapi.yaml`
- **Interactive Docs**: `/api-docs` (Swagger UI)
- **Usage Guide**: `25-api-data/OPENAPI_USAGE.md`

Available npm scripts:
- `npm run openapi:validate` - Validate the OpenAPI spec
- `npm run openapi:types` - Generate TypeScript types
- `npm run openapi:client` - Generate TypeScript fetch client
- `npm run openapi:sync` - Sync spec to public folder
- `npm run openapi:all` - Run all OpenAPI operations

See `OPENAPI_USAGE.md` for detailed instructions on using the OpenAPI tooling.

Definition of Done (catalog)

✅ Every MVP route has: Method/Path, DTOs, Errors, Auth/RBAC, Idempotency, Pagination, Observability note.

✅ All entries link back to SRM ownership/invariants.

✅ One quick Mermaid call map added in the doc header.

✅ cURL sanity examples present.

✅ Marked /v1 (with any /v2 candidates noted).