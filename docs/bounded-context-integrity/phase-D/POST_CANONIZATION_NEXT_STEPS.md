# SRM Post-Canonization Next Steps

**Objective:** Execute the remaining work required to operationalize the canonical SRM baseline across services, schema consumers, and the type system.

---

## 1. Service Layer Audit & Refactor

1.1 **Inventory Consumers**  
- Enumerate all service modules that touch casino, rating slip, loyalty, finance, and MTL tables.  
- Capture where direct table inserts/updates exist (`player_financial_transaction`, `loyalty_ledger`, `mtl_entry`, etc.).

1.2 **Enforce Canonical RPC Usage**  
- Replace direct writes to `player_financial_transaction` with the new `createFinancialTransaction` helper (or direct Supabase RPC calls).  
- Validate mid-session reward workflows call `rpc_issue_mid_session_reward`.  
- Document and align any remaining RPC coverage (Table context, compliance) with SRM expectations.

1.3 **Align Query Shapes**  
- Update selectors to reflect new columns (e.g., `gaming_day_start_time`, casino ownership FKs on loyalty/MTL tables).  
- Ensure `select('*')` usage is replaced with explicit lists or typed selects driven by the regenerated types.

1.4 **Testing**  
- Add integration tests for each RPC and trigger (finance, loyalty, compliance).  
- Build contract tests that mirror SRM code samples (Supabase client usage).

Owners: Service Devs per domain, Architecture QA for oversight.  
Target Window: Sprint +1 after SRM merge.

---

## 2. Downstream Consumer Updates

2.1 **Analytics / BI**  
- Notify downstream teams of schema changes (`gaming_day_start_time`, new FKs).  
- Update materialized views or ETL pipelines relying on legacy column names.

2.2 **Compliance/Reporting Jobs**  
- Validate that MTL and audit exports include new ownership fields.  
- Confirm that gaming-day calculations honor the time-based boundary in reporting scripts.

2.3 **Docs & Monitoring**  
- Sync operational runbooks with the SRM’s RLS expectations and RPC workflows.  
- Update dashboards/alerts to reflect new table/column names (e.g., `gaming_day_start_time`).

Owners: Data/BI leads, Compliance, Ops.  
Target Window: Within two weeks of canonical baseline landing.

---

## 3. Type System & Tooling

3.1 **Regenerate Supabase Types**  
- Run `supabase gen types typescript --local > types/database.types.ts` once Docker/Supabase CLI access is available.  
- Commit updated types and ensure `gaming_day_start_time` surfaces as `string` and `TablesInsert<'player_financial_transaction'>` no longer requires `gaming_day`.

3.2 **Shared Client Types**  
- Export typed helpers (`finance.ts`, future `compliance.ts`) for all canonical RPCs.  
- Add lint rule or CI check to forbid direct table inserts for RPC-managed tables.

3.3 **CI Gates**  
- Integrate type regeneration check into CI (fail on stale types).  
- Hook SRM↔schema diff, identifier lint, and RLS lint per playbook.

Owners: DevEx / CI, Architecture QA.  
Target Window: Immediate after type regeneration is possible.

---

## 4. Governance & Communication

- Announce the canonical baseline in engineering channels with links to SRM, migration, helper libraries, and this next-steps doc.  
- Schedule brown-bag walkthrough or record a quick Loom covering the new contract-first workflow.  
- Capture sign-offs from Architecture Lead, DB Engineering Lead, and Product/Domain Lead once steps 1–3 are underway.

---

**Tracking:** Link each action to the SRM Canonicalization board or create follow-up tickets per domain. Update this document as milestones close.
