-- Migration: Add cashier role to staff_role enum
-- Description: Extends staff_role enum with 'cashier' for financial transaction handling
-- Reference: ADR-015, SEC-001, ISSUE-003
-- Note: Must run before 20251211170030_adr015_finance_rls_hybrid.sql

-- Add 'cashier' role to staff_role enum (PostgreSQL 10+ supports ADD VALUE in transaction)
ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'cashier' AFTER 'pit_boss';

-- Document the role purpose
COMMENT ON TYPE staff_role IS 'Staff roles: dealer (table ops), pit_boss (floor supervision), cashier (financial transactions), admin (full access)';
