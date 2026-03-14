# Slice One — Testing Posture Statement

## Casino Bounded Context
**Status**: Trusted local verification
- Integration canary: runs under node, validates RPC contract surface
  (schemas, types, enum sync, resume-step algorithm)
- Route handler boundary test: verifies GET /settings request-to-response
  contract with controlled dependencies
- Runtime: correctly split (node for server, jsdom for client)

## Everything Else
**Status**: Mixed/advisory until restored
- Existing tests may still run under wrong runtime
- test:ci still silently excludes integration tests
- No CI enforcement of the slice
- `npm test` prints advisory warning about legacy config

## Tenancy Verification Gap
Route handler boundary tests verify handler logic given a pre-set RLS
context. They are NOT tenant isolation tests. Cross-tenant abuse must be
verified via integration tests against a running Supabase instance
(see `rpc-*-abuse.int.test.ts` pattern).

## Theatre Freeze (per spec Step 5)
- No new shallow route-handler tests in Casino service
- No claiming shallow tests are meaningful API verification
- Existing low-value tests may remain temporarily
- New Casino route tests must follow the boundary test exemplar pattern
- **Test tier distinction**: Boundary tests (mock middleware) verify handler
  contracts. Integration tests (live DB) verify tenant isolation and
  business behavior. Do not conflate the two.

## Next Steps (when ready)
- Widen Casino slice (more canaries)
- Add lightweight CI execution for exemplar
- Create jest.jsdom.config.ts when first component/hook test is written
- Roll pattern to next bounded context
