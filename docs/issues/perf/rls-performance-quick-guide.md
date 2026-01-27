# RLS Performance Fix Quick Reference

## Problem
RLS policies are re-evaluating auth functions (auth.uid(), auth.jwt(), current_setting()) for EVERY row, causing severe performance issues.

## Solution
Wrap all auth function calls in subqueries:
- `auth.uid()` → `(select auth.uid())`
- `auth.jwt() ->> 'claim'` → `(select auth.jwt()) ->> 'claim'`
- `current_setting('key', true)` → `(select current_setting('key', true))`

## High Priority Tables (6)
- player: 14 policies
- rating: 6 policies
- gaming: 6 policies
- mtl: 8 policies
- table: 10 policies
- floor: 18 policies

## Commands
1. Check current policies: \d visit
2. Test performance: EXPLAIN ANALYZE SELECT * FROM visit LIMIT 10;
3. Apply migration: supabase migration up

## Verification
After applying fixes, queries should show improved performance in:
- Query planning time
- Execution time
- Number of function evaluations
