Schema 2025-10-06 System Analysis-migration discrepancy

Executive Summary Schema drift local remote database types missing_public schema metadata older Supabase CLI

Comparison Missing Local Types Internal Supabase Metadata MISSING PostgrestVersion.0.4 system enforce PostgREST compatibility GraphQL Schema Definition MISSING graphql Tables Views Functions extensions operationName query variables Returns Enums CompositeTypes GraphQL endpoint typing unavailable type-safe GraphQL queries Schema Consistency SCHEMA Identical (40 tables player visit ratingslip casino gamingtable table definitions match Identical (15 StaffRole VisitStatus RatingSlipStatus MtlArea Identical (4_summary_aggregates_metrics_monitor Identical (50 functions start close_role

Migration History Analysis Files supabase/migrations_enable_rls_jwt_helpers_audit_log_scaffold_compliance_table_stubs Confirm migrations remote local files

Type Generation Discrepancy Remote Types Generation generated supabase-id Includes metadata GraphQL schema Local Types supabase older CLI version Missing metadata GraphQL schema

Risk Assessment Severity Impact Resolution Required Missing Type compatibility checks unavailable Missing_public GraphQL typing unavailable MVP Table schema mismatch tables identical Enum mismatch identical Function mismatch functions identical No production blockers

Decision Option Maintain Dual Type-001 Dual Database Type Strategy Generated Supabase Fast iteration no remote dependency database safe experimentation production Supabase project validation GraphQL schema PostgREST metadata Validates deployment Fast development iteration Safe migration testing separation Team independence blocking Manual sync Dual type file maintenance Team workflow training Type Workflow Guide

Implementation Long-term Solutions Type Add package.json:types types.types.ts.github/workflows.yml Validate Schema Sync npm db:types git diff types/database.types.ts-commit Warn types out sync diff types echo Database types out of sync remote

Migration Validation Checklist Verify Phase migrations remote Confirm RLS core tables Validate JWT helper functions Check audit infrastructure Test compliance policies

Schema Comparison Matrix Component Local Remote Status **Tables** 40 Match **Views** 4 **Functions** ~50 **Enums** 15 **GraphQL Schema** Missing Present Drift **Internal Metadata** Missing Present Drift

Testing Recommendations Service Layer Compatibility Test Verify local types import Database SupabaseClient-js testClient SupabaseClient createClient compile errors Remote Connection Test remote types live connection Migration Sync Test Verify local migrations remote no differences

Affected Systems No Impact Player Visit RatingSlip CRUD operations business logic database queries Potential Impact GraphQL endpoint PostgREST compatibility checks

Action Choose A B migration checklist Create ADR separate files Next Week Lock type generation CI/CD pre-commit sync validation drift deployment pipeline

Appendix Type File Locations types database.types.ts LOCAL GraphQL metadata remote database.types.ts REMOTE GraphQL metadata services/index.ts Import/types/database.types Import import Database LOCAL Sync import type Complete Phase 2 (2025-10-27)
