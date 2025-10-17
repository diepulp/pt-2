Integrity Framework Automated guardrails prevent violations workflow framework

Quick Commands After migration run db:types schema-verification commit Verify changes type-check pre-commit fails Regenerate types Verify alignment

Traffic Light System TypeScript compiles Schema test passes Pre-commit hooks CI/CD pipeline passes Proceed confidence Linting TypeScript Test coverage below threshold Fix before merge Stop Fix Schema fails TypeScript errors Pre-commit hook blocks CI/CD pipeline fails fix

Common Workflows 1: Adding New Service Create service files services Write service code database types Import Database/types Run verification type-check schema-verification Commit add services/my-service-service 2: Database Migration Create migration add_my_table Edit migration file_table Apply migration locally Regenerate types db:types Verify schema alignment Update service DTOs Commit migration types supabase/migrations types/database.types commit add my_table schema 3: Schema Verification Fails verification failed Check changed types/database.types Run test verbose output schema-verification Fix service DTOs Replace old field names Verify fix schema-verification Commit add services types commit align DTOs schema

Defense Layers Catches Auto-Fix Typing errors schema mismatches-commit** commit Schema drift Formatting **CI/CD\*\* PR push violations Production Missed issues Graceful handling

Anti-Patterns Skip Type Generation Commit migration without regenerating types add supabase/migrations schema Types stale Service layer with obsolete types runtime failures db:types run after migration add types Bypass Pre-commit Hooks Force commit without fixing issues --no-verify Skips guardrails broken code to repository fails CI/CD Address issue db:types test schema-verification hooks validate Manual Type Definitions define database types field types drift from schema no verification Use generated types import export sync Compile-time verified Copy-Paste Old Code Copy service from old docs reference obsolete schema supabase PascalCase existselect Fields renamed Old code new Check current schema npm test schema-verification Shows correct fields ledger supabase snake_case_change transaction Current fields

Troubleshooting Issue 'my_table Types regenerated table run db:types verification test failing Service DTOs reference non-existent fields See fields wrong schema-verification Check schema types Fix DTOs Replace old field names correct Verify schema-verification-commit hook long full test commit Schema verification runs Migrations Database types Service files No schema changes seconds changes ~3-5 seconds

Further Reading Integrity Framework_FRAMEWORK documentation-005-integrity-enforcement Architectural decision Fix Example/SCHEMA_FIX_SUMMARY incident resolution Quick reference

Need Help error tells wrong/integrity_FRAMEWORK.md diagnostics** `npm run type-check test schema-verification --verbose **Ask seen before framework not block fighting something misconfigured Ask help
