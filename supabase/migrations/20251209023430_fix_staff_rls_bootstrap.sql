-- Fix staff RLS policy to allow bootstrap (self-lookup)
--
-- Problem: The original staff_read policy required app.casino_id to be set,
-- but to get casino_id we need to query staff first (chicken-and-egg).
--
-- Solution: Allow users to read their own staff record via auth.uid()

DROP POLICY IF EXISTS staff_read ON staff;

CREATE POLICY staff_read ON staff
  FOR SELECT
  USING (
    user_id = auth.uid()  -- Allow reading own record (bootstrap)
    OR casino_id = (current_setting('app.casino_id', true))::uuid  -- Normal casino-scoped access
  );
