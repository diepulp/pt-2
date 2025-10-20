-- Phase C Pre-Migration Validation Queries
-- Run these queries to validate data state before migration

-- Query 1: Current row counts
SELECT COUNT(*) AS total_rows,
       COUNT(patron_id) AS non_null_patron_id,
       COUNT(DISTINCT patron_id) AS unique_patrons
FROM mtl_entry;

-- Query 2: Check for orphaned patron_id references
-- MUST return 0 before adding FK constraint
SELECT COUNT(*) AS orphaned_count
FROM mtl_entry e
LEFT JOIN player p ON e.patron_id::uuid = p.id
WHERE e.patron_id IS NOT NULL
  AND p.id IS NULL;

-- Query 3: Validate UUID format of all patron_id values
-- MUST return 0 rows (all values must be valid UUIDs)
SELECT patron_id, COUNT(*) as occurrences
FROM mtl_entry
WHERE patron_id IS NOT NULL
  AND patron_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY patron_id;

-- Query 4: Sample of patron_id values to verify
SELECT patron_id, person_name, person_last_name, created_at
FROM mtl_entry
WHERE patron_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
