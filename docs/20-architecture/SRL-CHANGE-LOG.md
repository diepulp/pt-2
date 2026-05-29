---
id: ARCH-SRL-CHANGELOG
title: SRL Change Log
parent: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
status: CANONICAL
---

# SRL Change Log

Full version history for [SEMANTIC_RESPONSIBILITY_LAYER.md](SEMANTIC_RESPONSIBILITY_LAYER.md).

---

- **1.0.0 (2026-05-29)** – **SRL Created; TIA Exemplar Admitted**: Created Semantic Responsibility Layer companion authority. Accepted SRM/SRL separation principle: SRM owns service/table boundaries; SRL owns meaning. Admitted SRL-TIA-001 as first semantic extension (TableContextService.TableInventoryAccounting). Registered six semantic responsibility records for TIA canon terms: `projected_table_win_loss_cents` (derived_surface_value), `partial_table_result_cents` (derived_surface_value), `final_table_win_loss_cents` (reserved_future_term), `drop_estimate_state` (lifecycle_state), `calculation_kind` (lifecycle_state), `telemetry_derived_drop_estimate_cents` (telemetry_fact). Registered TIA legacy alias disposition ledger (8 entries). Registered TIA-CANON-EXEMPLAR-THESAURUS.md as SRL-admitted, SRM-bound accepted-language index. Confirmed Zachman interrogative completeness via TIA-CANON-THESAURUS-ZACHMAN.yaml. Flagged `table_buyin_telemetry` ownership gap (not blocking SRL admission; blocks TIA PRD execution unless explicitly resolved). See SRM v4.27.0, ADR-059/060/061, FIB-H-TIA-CANON-001.
