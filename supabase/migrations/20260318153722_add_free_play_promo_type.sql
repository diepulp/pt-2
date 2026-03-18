-- Bug #4 fix: Add free_play to promo_type_enum for pilot completeness.
-- Terminology: "free_play" per REWARD_FULFILLMENT_POLICY.md authority
-- (supersedes v0.1 spec's "free_bet").
-- Safe: ALTER TYPE ADD VALUE is forward-compatible, no existing data affected.

ALTER TYPE public.promo_type_enum ADD VALUE IF NOT EXISTS 'free_play';
