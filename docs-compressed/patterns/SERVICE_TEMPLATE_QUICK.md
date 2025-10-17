Service Implementation Reference card day-day [SERVICE_TEMPLATE.md

Pre-Flight Checklist service code Never Always `ReturnType createXService `interface XService `supabase SupabaseClient/types/database-rebuilt/x/types/domains/x@deprecated Delete `console.\* Structured logging-Violation PT-1 code breaks don't patch

File Structure **tests** Root-level tests services {domain shared types.ts ServiceResult ServiceError utils.ts generateRequestId operation-wrapper executeOperation {domain index.ts Factory interface crud.ts operations/services/{domain{domain add `business.ts `queries.ts 3rd occurrence

Implementation Pattern (5 Steps Write Test/services-service.test describe xService Use exported interface type supabase createClient<Database xService create X valid result await xService.create "value expect(result.data handle duplicate xService.create "unique dup await xService.create(dup.error"DUPLICATE_X Define DTOs Database crud export interface XCreateDTO string XDTO Database Implement CRUD Module crud import executeOperation/operation-wrapper"; export createXCrudService(supabase SupabaseClient<Database async XCreateDTO):<ServiceResult executeOperation<XDTO> data entity error await supabaseselect Map DB constraint business error.code "DUPLICATE message exists error return entity Create Factory Explicit Interface index STEP export interface XService create Promise<ServiceResult STEP 2: factory export function createXService crudService return ...crudService STEP 3: Export type XServiceType XService XCreateDTO XDTO Run Tests Audit npm test services

Error Mappings PostgreSQL Code Business Error HTTP Status `23505 `DUPLICATE_X 400 `PGRST116 `NOT_FOUND 404 `23503_KEY_VIOLATION 400 `42P01_NOT_FOUND 500 message error

End-Slice Audit (2 min check No exports parameters-rebuilt imports/x/types.ts file@deprecated code tests passing tsc --noEmit clean fix before PR

Quick Commands Create service structure services Run tests Type check --noEmit audit test --noEmit

Time Estimates 2h operation update getById mining +2h 8-12h-Box PT-1 mining >4h rebuild

Reference Implementation [services/player/ Copy patterns [services/player/index.ts Factory structure/player/crud.ts CRUD operations/services/player-service.test.ts Test location-level

infrastructure Server action UI PT-1 mining strategy Architecture rationale Error code

Emergency Contacts Player service SERVICE_TEMPLATE.md Hybrid Refactor Architecture team Update_TEMPLATE.md synced SERVICE_TEMPLATE.md v1.0.0
