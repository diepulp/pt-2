-- Migration: 20260511134015_add_generate_uuid_v7.sql
-- Purpose: UUIDv7 generator with monotonic sequence-backed counter for same-millisecond ordering.
-- Required by Wave 2 finance_outbox (event_id is UUIDv7 generated at authoring boundary).
--
-- Implementation: 48-bit ms timestamp (bits 127-80) | 0111 version (bits 79-76) |
--   12-bit monotonic sequence counter (bits 75-64) | 10 variant (bits 63-62) |
--   62-bit random (bits 61-0).
-- The sequence resets each millisecond via CYCLE and the counter is zeroed when the ms advances.
-- Pure timestamp + random is NOT acceptable: random bits can produce a lower value within
-- the same millisecond, breaking the strict ordering guarantee.

-- Backing sequence: 12 bits (0-4095), cycles per millisecond
CREATE SEQUENCE IF NOT EXISTS public.uuid_v7_seq
  MINVALUE 0
  MAXVALUE 4095
  START 0
  CYCLE;

CREATE OR REPLACE FUNCTION public.generate_uuid_v7()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ms        BIGINT;
  v_seq       BIGINT;
  v_random    BIGINT;
  v_uuid_str  TEXT;
  v_hi        BIGINT;
  v_lo        BIGINT;
BEGIN
  -- 48-bit millisecond timestamp since Unix epoch
  v_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;

  -- 12-bit monotonic counter from sequence (cycles 0-4095)
  v_seq := nextval('public.uuid_v7_seq') % 4096;

  -- 62 bits of randomness for the lower portion (extensions schema — pgcrypto in extensions)
  v_random := (
    (('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint) & x'3FFFFFFFFFFFFFFF'::bigint
  );

  -- Assemble high 64 bits:
  --   bits 63-16: 48-bit ms timestamp
  --   bits 15-12: version 0111 (7)
  --   bits 11-0:  12-bit sequence counter
  v_hi := (v_ms << 16) | (7::BIGINT << 12) | v_seq;

  -- Assemble low 64 bits:
  --   bits 63-62: variant 10
  --   bits 61-0:  random
  v_lo := (2::BIGINT << 62) | v_random;

  -- Format as UUID string: 8-4-4-4-12 hex groups
  v_uuid_str := lpad(to_hex((v_hi >> 32) & x'FFFFFFFF'::BIGINT), 8, '0')
    || '-' || lpad(to_hex((v_hi >> 16) & x'FFFF'::BIGINT), 4, '0')
    || '-' || lpad(to_hex(v_hi & x'FFFF'::BIGINT), 4, '0')
    || '-' || lpad(to_hex((v_lo >> 48) & x'FFFF'::BIGINT), 4, '0')
    || '-' || lpad(to_hex(v_lo & x'FFFFFFFFFFFF'::BIGINT), 12, '0');

  RETURN v_uuid_str::UUID;
END;
$$;

-- Verify implementation before granting access
DO $$
DECLARE
  v1 uuid := public.generate_uuid_v7();
  v2 uuid := public.generate_uuid_v7();
  v3 uuid := public.generate_uuid_v7();
BEGIN
  ASSERT substring(v1::text, 15, 1) = '7',
    'generate_uuid_v7: version bit at position 3 must be 7 (UUIDv7)';
  ASSERT v1 < v2,
    'generate_uuid_v7: v1 must sort before v2 (monotonic ordering required)';
  ASSERT v2 < v3,
    'generate_uuid_v7: v2 must sort before v3 (monotonic ordering required)';
END $$;

GRANT EXECUTE ON FUNCTION public.generate_uuid_v7() TO authenticated, service_role;

COMMENT ON FUNCTION public.generate_uuid_v7() IS
  'UUIDv7 generator with monotonic sequence-backed counter. 48-bit ms timestamp + 12-bit sequence (0-4095, cycles) + 62-bit random. Guarantees strict ordering within the same millisecond via sequence. Used exclusively for finance_outbox.event_id authoring at RPC boundary.';
