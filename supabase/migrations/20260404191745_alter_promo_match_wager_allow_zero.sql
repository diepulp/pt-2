-- Allow required_match_wager_amount = 0 for free_play promo programs.
-- Previously both tables enforced > 0, which blocked free play creation.
-- New constraint: >= 0 (nonnegative), with application-layer validation
-- ensuring match_play programs still require a positive value.

-- promo_program table
ALTER TABLE public.promo_program
  DROP CONSTRAINT promo_program_required_match_wager_amount_check;

ALTER TABLE public.promo_program
  ADD CONSTRAINT promo_program_required_match_wager_amount_check
  CHECK (required_match_wager_amount >= 0);

-- promo_coupon table (inherits value from program at issue time)
ALTER TABLE public.promo_coupon
  DROP CONSTRAINT promo_coupon_required_match_wager_amount_check;

ALTER TABLE public.promo_coupon
  ADD CONSTRAINT promo_coupon_required_match_wager_amount_check
  CHECK (required_match_wager_amount >= 0);
