Before handing off work:
1. Run `npm run lint:check` and `npm run type-check` to ensure style and typing stay clean.
2. Execute the relevant Jest or Cypress suites (`npm run test` or `npm run e2e:headless`) for any affected areas; include coverage runs when touching shared services.
3. Regenerate Supabase types (`npm run db:types` or `db:types-local`) if the database schema changed, and re-run the docs validation script (`npm run validate:matrix-schema`) when updating architecture specs.
4. Summarize changes referencing key files/lines per repo guidelines and call out any follow-up actions (e.g., pending migrations, data backfills).