-- Add rating_slip_status enum to enforce lifecycle states at database level
-- Ref: SRM v3.0.2 lines 610-643 (RatingSlip Service - Telemetry Context)
-- Lifecycle: created → open → (paused/resumed optional) → closed → archived
--
-- Migration Naming: YYYYMMDDHHMMSS_description.sql
-- Created: 2025-11-04T00:23:14Z

-- Step 1: Create the enum type
create type rating_slip_status as enum (
  'open',
  'paused',
  'closed',
  'archived'
);

-- Step 2: Alter rating_slip table to use the enum
-- USING clause handles the cast from text to enum
alter table rating_slip
  alter column status type rating_slip_status
  using status::rating_slip_status;

-- Step 3: Ensure default is preserved
alter table rating_slip
  alter column status set default 'open'::rating_slip_status;

-- Step 4: Add comment for documentation
comment on type rating_slip_status is 'Rating slip lifecycle states: open (active play), paused (temporarily suspended), closed (session ended), archived (historical)';

comment on column rating_slip.status is 'Current lifecycle state - drives eligibility for mid-session rewards (open/paused only)';
