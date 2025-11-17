# SRM Modularization – Practical First Steps (for cross-session reference)

1) **Build the mapping table**  
   - Map each SRM concern/section to a target doc in the taxonomy (existing or to-be-created).  
   - Capture: SRM section, target path, exists/missing, priority, owner.

2) **Create minimal missing anchors**  
   - `docs/25-api-data/DTO_CATALOG.md`  
   - `docs/65-migrations/MIG-001-migration-tracking-matrix.md`  
   - `docs/35-integration/INT-002-event-catalog.md`  
   - `docs/30-security/SEC-005-role-taxonomy.md`

3) **Replace SRM sections with summaries + links**  
   - For concerns with real target docs, compress the SRM content (LLMLingua or manual précis) to a short summary and link out to the canonical doc.

4) **Enable reference checking in CI**  
   - Add a check that every SRM link resolves to an existing doc; fail CI on broken references to prevent drift.
