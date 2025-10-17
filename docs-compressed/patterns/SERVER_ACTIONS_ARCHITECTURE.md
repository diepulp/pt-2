Server Actions APPROVED 2025-10-10 Infrastructure State Strategy

document clarifies separation prevent namespace confusion consistent patterns

Directory Structure app actions Server Action Implementations player create-action update delete-player-action visit start-visit-action end-visit-action rating-slip create-action close-rating-action server-actions Server Action Utilities-server-action-wrapper.ts Error mapping audit logging services player Service Layer index.ts crud.ts

Separation Concerns `app/actions/ Domain-Specific Implementations Next.js server actions client-side form submissions mutations Marked server Accept client inputs Call service layer methods Use wrapper utilities/server-actions Return typed results client-name-action-player-action app/actions/player-player-action import createClient/supabase withServerAction createPlayerService export async createPlayerAction supabase createClient metadata `lib/server-actions/` Reusable Utilities Shared utilities wrappers server actions domain-specific Error mapping Audit logging Standardized result handling Performance monitoring Request ID generation Descriptive utility names-server-action-wrapper-actions-wrapper export async function Promise<ServiceResult supabase SupabaseClient<Database ServerActionContext Promise<ServiceResult result await action Audit logging production writeAuditLog context return result unknown Error mapping mapDatabaseError return error

Integration Pattern Server Action Template actions/actions{domain pattern import createClient/supabase withServerAction-actions create{Domain/services{domain ServiceResult/shared export async function Promise<ServiceResult supabase createClient session supabase.getSession return withServerAction async service create{Domain}Service return service{method supabase action{domain_player userId session.id audit logging entity{domain entityId result creation metadata relevant data audit context

Benefits Pattern Clear Namespace Separation/actions implementations-actions utilities No confusion Consistent Error Handling server actions PostgreSQL error code mapping_KEY User error messages HTTP status codes 404 409 500 Automatic Audit Logging audit trail Additional context Type Safety TypeScript support `ServiceResult standardization Explicit interfaces

Error Mapping maps database errors PostgreSQL Error HTTP Status User Message 23503 FOREIGN_KEY_VIOLATION Invalid reference record 23505 UNIQUE_VIOLATION 409 record 23514 VALIDATION_ERROR Invalid data failed 23502 VALIDATION_ERROR field missing PGRST116 NOT_FOUND 404 Record INTERNAL_ERROR 500 Error

Architecture Flow Client Layer UI Component → Form Submission Server Action Call app/actions/{domain}/{action-name}.ts Get Supabase client 2. Get session audit userId) 3. Call withServerAction wrapper lib/server-actions/with-server-action-wrapper.ts │ Execute service layer action 2. Catch map database errors 3. Write audit log (production only 4. Return ServiceResult<T> services/{domain}/index.ts business logic 2. Call Supabase database operations 3. Return ServiceResult<T> Supabase / PostgreSQL RLS Policies → Database Operations → Real-time Updates

Do's Don'ts use wrapper mutations organize actions by domain/actions name actions include audit context metadata get session userId before wrapper return `ServiceResult status timestamp requestId keep utilities generic reusable/server-actions/ domain logic/server-actions bypass wrapper database mutations duplicate wrapper/actions/server-actions include sensitive data audit metadata call actions use actions queries React Query hooks

Migration Path server actions wrapper Before createPlayerAction supabase await createClient service result await service.create return data error success After Wrapper createPlayerAction supabase await createClient supabase.auth.getSession return service createPlayerService return service.create(input); supabase userId entity "player" Automatic error mapping Audit logging Request tracking Standardized responses

Server actions wrapper Verify service result Test PostgreSQL error codes user messages Verify production-only logging Test without authenticated sessions-actions-wrapper.test examples

Related Documentation State Management Strategy Phase 3 infrastructure APPROVED 2025-10-10 1.0
