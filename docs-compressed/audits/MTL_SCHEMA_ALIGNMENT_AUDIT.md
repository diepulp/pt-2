MTL Schema Alignment Audit Align MTL PT-2 2025-10-14 Pre-Implementation

Executive Summary_DOMAIN_CLASSIFICATION document reference MTL service contains with PT-2 schema before implementation regressions maps names to schema names PT-2

Table Name Alignment Conceptual Schema Status Notes `mtl_entry Core transaction log `casino_settings Gaming day configuration `loyalty_ledger Loyalty transaction log `player_loyalty Player loyalty state `loyalty_tier Tier definitions`rating_slip`** Doc uses underscore schema `player`Player identity`visit`Visit sessions`Staff`**Case Sensitive** Quoted identifier schema`mtl_audit_note New Table created migration

Column Name Alignment mtl_entry Conceptual doc Actual Schema Status Notes `id` Match BIGSERIAL PRIMARY KEY `casino_id` Match TEXT NOT NULL `patron_id` Match TEXT (optional carded `person_name` Match uncarded `person_last_name` `person_description` `direction` Match MtlDirection ENUM `area` MtlArea ENUM `tender_type` `amount` Match DECIMAL(12,2) `table_number` Match `location_note` Match `event_time` TIMESTAMPTZ `gaming_day` Match DATE (auto-calculated `recorded_by_employee_id` Match NOT NULL `recorded_by_signature`recorded_by_signature Match TEXT NOT NULL `notes` Match (legacy field `created_at` Match TIMESTAMPTZ `updated_at``rating_slip_id`**` New Column REFERENCES`session_id`** `rating_slip_id`** uses terms interchangeably`visit_id`** New Column REFERENCES`correlation_id`**` New Column tracing`idempotency_key`** New Column TEXT UNIQUE

Column Name Alignment loyalty_ledger reference Wave 2 migration (20251013000001_wave_2_schema_hardening.sql): Conceptual doc Actual Schema Status Notes `player_id` Match UUID NOT NULL `rating_slip_id` ratingslip `session_id` **Not schema** Use `rating_slip_id` instead `transaction_type` Match `points_change` `staff_id` (Wave 2 added `correlation_id` 2 added `balance_before` `balance_after` `tier_before` Match 2 added `tier_after` Match TEXT (Wave 2 added

Critical Naming Corrections_slip vs MTL_DOMAIN_CLASSIFICATION.md uses_slip schema uses `ratingslip Foreign key references `ratingslip table View joins `ratingslip alias Column name `rating_slip_id correct underscores ALTER TABLE COLUMN rating_slip_id_slip_id_id MTL_DOMAIN_CLASSIFICATION.md uses_id schema uses_slip_id_slip_id column name_id conceptual alias column terms gaming session tracked RatingSlip SELECT loyalty_ledger rating_slip_id $1 WRONG session_id $1 table case PostgreSQL schema uses identifier"Staff FK references use"Staff Unquoted `staff fail CORRECT REFERENCES "Staff"(id WRONG REFERENCES staff(id

View Name Alignment Conceptual Schema Status Notes `mtl_patron_aggregates Daily patron aggregation `mtl_threshold_monitor Threshold status detection `mtl_daily_summary Daily compliance summary `mtl_compliance_context Contextual enrichment `mtl_entry_with_notes Entries audit notes

Data Type Alignment Conceptual Schema Status Notes `UUID` Match PostgreSQL native type `TEXT` String fields `TIMESTAMPTZ Precision Schema microsecond precision `DECIMAL`,2)` Monetary amounts `INTEGER` Point values `DATE` Gaming day `BIGSERIAL` mtl_entry.id

ENUM Type Alignment MtlDirection `cash_in_out ✅ Match MtlArea `pit `cage `slot `poker `kiosk `sportsbook'pit'cage'slot'poker'kiosk'sportsbook'other Match TenderType `cash` (default'cash' others'chip'check' Match

Cross-Domain Reference Corrections Loyalty Service Integration 57-64) loyalty_ledger player_id rating_slip_id session_id transaction_type `rating_slip_id column_id_ledger_entry_slip_id correlation SELECT m l mtl_entry JOIN loyalty_ledger.rating_slip_id_id JOIN loyalty_ledger.session_id_id RatingSlip Domain Integration rating_slip.id visit_id gaming_table_id Table name `ratingslip Column name `rating_slip_id underscore ALTER TABLE mtl_entry ADD COLUMN rating_slip_id JOIN ratingslip.rating_slip_id

Migration Validation Checklist applying_mtl_schema_enhancements verify reference `ratingslip"Staff no quotes Column name `rating_slip_id underscore No column_id_slip_id syntax `ratingslip table ENUM values match types TIMESTAMPTZ precision schema (6

Implementation Guidelines Use `ratingslip table name_slip_id column name"Staff" references Align data types schema conventions Follow index naming partial indexes clauses nullable FKs use_slip table create `session_id column_slip_id reference `staff without quotes" assume field names inconsistent naming patterns

Schema Changes Existing Tables Changes `mtl_entry 4 columns_slip visit_id correlation_id idempotency_key_settings `loyalty_ledger_loyalty New Tables_audit_note Append-only audit notes New Views_compliance_context Cross-domain enrichment_entry_with_notes notes New Indexes_entry_rating_slip_id_id_correlation_id_idempotency_unique_audit_note_entry_id_note_staff

References/MTL_DOMAIN_CLASSIFICATION.md/migrations/20250828011313_init_corrected.sql 2/20251013233420_hardening/20251014134942_schema.sql/SERVICE_RESPONSIBILITY_MATRIX.md v2.1.0 Ready Implementation Apply migration validate schema Gates Verification migration file
