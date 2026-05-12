-- Migration: PRD-083 Pilot Authentication Containment Gate
-- Description: Creates pilot_access_requests and approved_email_allowlist tables for
--   closed-pilot access governance. Email canonicalization enforced by CHECK constraints (DEC-7).
-- Reference: PRD-083, ADR-015, EXEC-083
-- VERIFIED_SAFE: RLS reviewed. pilot_access_requests has one INSERT-only anon policy
--   (public form submission; no SELECT for any role — server-side reads only per RULE-1).
--   anon_insert_pilot_access_requests intentionally omits auth.uid() IS NOT NULL because
--   this is a public unauthenticated INSERT (access request form requires no session).
--   approved_email_allowlist has no RLS policies at all — service_role only by design.
-- RLS_REVIEW_COMPLETE

-- ============================================================
-- Table: pilot_access_requests
-- Public prospective-operator access requests. Not auth users.
-- ============================================================

CREATE TABLE pilot_access_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text        NOT NULL,
  name                  text        NOT NULL,
  casino_name           text        NOT NULL,
  role                  text        NOT NULL,
  estimated_table_count int,
  message               text,
  status                text        NOT NULL DEFAULT 'pending',
  reviewed_by           text,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pilot_access_requests_email_canonical
    CHECK (email = lower(trim(email))),

  CONSTRAINT pilot_access_requests_status_values
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Prevent duplicate pending requests for the same canonical email.
-- Approved/rejected rows are preserved for provenance.
CREATE UNIQUE INDEX pilot_access_requests_pending_email_unique
  ON pilot_access_requests (email)
  WHERE status = 'pending';

-- Index for pending review queue reads in admin surface.
CREATE INDEX pilot_access_requests_pending_idx
  ON pilot_access_requests (status)
  WHERE status = 'pending';

ALTER TABLE pilot_access_requests ENABLE ROW LEVEL SECURITY;

-- Public visitors may submit requests without authentication.
CREATE POLICY "anon_insert_pilot_access_requests"
  ON pilot_access_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- No SELECT/UPDATE policy for anon or authenticated roles.
-- service_role bypasses RLS and handles all reads/updates server-side.

-- ============================================================
-- Table: approved_email_allowlist
-- Authoritative pilot authorization source. Service-role only.
-- ============================================================

CREATE TABLE approved_email_allowlist (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL UNIQUE,
  status      text        NOT NULL DEFAULT 'active',
  invited_by  text,
  -- company_id and casino_id are nullable: allowlist entry is created before onboarding.
  -- No FK constraint intentionally: company/casino do not exist at allowlist creation time.
  company_id  uuid,
  casino_id   uuid,
  -- expires_at stored but NOT enforced by application logic in this slice (DEC-3).
  expires_at  timestamptz,
  -- used_at set on first successful /start passage post-allowlist-check.
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT approved_email_allowlist_email_canonical
    CHECK (email = lower(trim(email))),

  CONSTRAINT approved_email_allowlist_status_values
    CHECK (status IN ('active', 'revoked'))
);

-- Composite index for allowlist gate reads (pre-OTP check and session-time check).
-- Both sendMagicLinkAction and /start query by email + status = 'active'.
CREATE INDEX approved_email_allowlist_gate_idx
  ON approved_email_allowlist (email, status);

ALTER TABLE approved_email_allowlist ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon or authenticated roles.
-- service_role bypasses RLS; all application-level allowlist access is server-only
-- via the service-role read helper. This is intentional: allowlist checks must
-- never be accessible to client-side or authenticated-user queries.
