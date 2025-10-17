Migration Standard MANDATORY Supabase migration files Pre-commit code review

Standard Pattern 4-digit year 2-digit month 2-digit day-31) 2-digit hour 2-digit minute-59) 2-digit second-59) underscore separator Snake File extension

Generating Timestamps Command Generate timestamp%Y%m%d%H%M%S Create migration file timestamp%M_description.sql Example date%Y%m%d%H%M%S 20251014134942_domain_correlation.sql

CORRECT 20251014134942_mtl_schema_enhancements_wave_2_loyalty_testing INCORRECT 20251014_mtl_schema Missing time_wave_2 Invalid time Wrong separator 20251014-mtl-schema Missing time separator Wrong order_mtl_columns No timestamp

Full Timestamps Migrations filename order Prevents timestamp collisions Exact creation time debugging rollback CLI conventions Clear chronological progression version control Simplified Patterns`YYYYMMDD000001 Ambiguous time reflect creation time ordering issues_description No chronological ordering Breaks Supabase migration tracking

Migration Workflow Create Migration Generate timestamp Create file supabase/migrations_descriptive_name.sql Open editor Write Migration Migration Descriptive Name Created-MM-DD HH:MM:SS description changes migration COMMIT Verify Naming Check filename follows pattern/migrations.sql grep -E.sql Apply Migration local database apply new migrations Generate TypeScript types db:types

Temporal Integrity Rules 1: Chronological Order Migrations Filename sorting match creation time supabase/migrations.sql 2: No Backdating correcting historical data 3: No Future Dating current timestamp not 4: No Duplicate Timestamps unique timestamp Wait 1 second multiple Create migrations unique timestamps_migration Ensure unique timestamp_migration

Descriptive Name Guidelines underscores under 50 characters specific descriptive verb prefixes Examples add_mtl drop alter migrate wave phase_corrections Bad Examples generic update No context add-columns Wrong separator PascalCase_mtl_correlation_tracking long mtl Not descriptive

Validation Script Automated/validate-migration-names.sh validation success migration filenames valid Standard YYYYMMDDHHMMSS_description.sql migrations 19 failure Invalid 20251014_bad_name.sql Expected_description.sql_add_mtl_columns.sql Pre-Commit Hook-migration-names exit

Corrections 2025-10-14 10 migration files standard Phase 0 6) 4 UUID 3 Phase 6 13-14) 19 migrations compliant

Migration order Filename timestamp creation Check -c supabase/migrations.sql Rename Verify order supabase/migrations Duplicate timestamp Multiple migrations Wait 1 second increment Migration applied not git not committed add supabase/migrations commit -m "migration descriptive message Reference migration filename commit

References CLI/guides/managing-migrations `docs/patterns/MTL_MIGRATION_TIMESTAMP_FIX.md.claude.md Workflow `supabase/migrations/

Checklist migration Generate timestamp format{timestamp_descriptive_name Descriptive name snake_case under 50 chars Verify no duplicate timestamps Filename[0-9.sql sorts Applied locally supabase db reset types db:types Schema verification passes Migration filename commit CANONICAL Enforce migrations 2025-10-14 Supabase updates migration conventions
