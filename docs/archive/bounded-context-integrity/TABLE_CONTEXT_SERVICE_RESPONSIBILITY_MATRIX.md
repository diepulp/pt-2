# TableContext Service Responsibility Matrix
> **Source:** Supabase schema snapshot (Oct 2025)  
> **Version:** 2.0.0  
> **Domain Type:** Operational / Infrastructure  
> **Status:** Stable  
> **Owner:** TableContext Bounded Context

---

## Definition

The **TableContext Service** governs the **operational lifecycle, configuration, and telemetry of gaming tables**.  
It unifies table-level entities—configuration, dealer rotation, chip counts, fills, drops, inventory slips, and alerts—into a coherent operational context that other domains (RatingSlip, MTL, Performance) consume for real-time and historical insights.

> Unlike earlier drafts, no dedicated `table_context` table exists.  
> Instead, “table context” is derived from the state and event history of related tables sharing a `table_id`.

---

## Core Entities (Schema Snapshot – Oct 2025)

| Table | Purpose |
|--------|----------|
| **gamingtable** | Canonical registry of gaming tables; includes table number, pit, casino linkage, and status. |
| **gamingtablesettings** | Game configuration parameters (min/max bet, rotation interval, game type). |
| **DealerRotation** | Tracks dealer assignments, start/end times, and rotations. |
| **ChipCountEvent** | Records chip verifications and discrepancies per table. |
| **FillSlip** | Documents chip or cash fills issued to a table. |
| **DropEvent** | Records table drop (cash removal) events. |
| **TableInventorySlip** | Aggregates fills/drops and inventory adjustments. |
| **BreakAlert** | Operational alert when dealer break thresholds are approached. |
| **KeyControlLog** | Secure key custody and handover tracking for table drop boxes or cabinets. |

---

## Primary Responsibilities

| Area | Responsibility | Implementation | Downstream Consumers |
|------|----------------|----------------|----------------------|
| **1. Table Lifecycle** | Provision, activate, and deactivate gaming tables. | `gamingtable` | RatingSlip, MTL |
| **2. Configuration Management** | Manage and apply per-table or template game settings. | `gamingtablesettings` | RatingSlip |
| **3. Dealer Management** | Record dealer rotations and track duty cycles. | `DealerRotation` | Staff, Performance |
| **4. Inventory & Cashflow Logging** | Record fills, drops, and chip counts; provide structured logs for compliance. | `FillSlip`, `DropEvent`, `ChipCountEvent`, `TableInventorySlip` | MTL |
| **5. Alerting & Break Compliance** | Generate and acknowledge operational alerts. | `BreakAlert` | Staff, Performance |
| **6. Security & Custody Tracking** | Log secure key control operations. | `KeyControlLog` | AuditLog, Compliance |
| **7. Performance Metrics Export** | Emit table activity metrics (uptime, rotations, alert frequency). | Derived view via `PerformanceMetric`, `PerformanceAlert` | Performance |
| **8. Integration with RatingSlip** | Provide current table and settings snapshot for slip creation. | Aggregated query | RatingSlip |
| **9. Contextual Hooks for MTL** | Publish transactional table events (drops/fills/chip counts) for AML/CTR analytics. | Table event triggers | MTL |

---

## Integration Boundaries

| Partner Context | Relationship | Data Flow | Description |
|-----------------|---------------|------------|--------------|
| **Casino** | Referential | ←→ | Provides `casino_id` linkage for tables. |
| **Staff** | Referential | ←→ | Dealer identity and authorization for rotations. |
| **RatingSlip** | Upstream consumer | → | Consumes current table, dealer, and settings metadata. |
| **MTL** | Downstream consumer | → | Consumes fill/drop/chip-count events and related enums (`MtlDirection`, `MtlArea`, `TenderType`). |
| **Performance** | Downstream consumer | → | Receives table-level metrics, rotation durations, and alert frequencies. |
| **Audit / Compliance** | Observer | → | Receives `KeyControlLog` and operational events for audit trails. |

---

## Event & Data Flow Overview

```mermaid
graph TD
    subgraph Casino
        C1[casino]
    end

    subgraph TableContext
        T1[gamingtable]
        T2[gamingtablesettings]
        T3[DealerRotation]
        T4[FillSlip]
        T5[DropEvent]
        T6[ChipCountEvent]
        T7[TableInventorySlip]
        T8[BreakAlert]
        T9[KeyControlLog]
    end

    subgraph RatingSlip
        R1[ratingslip]
    end

    subgraph MTL
        M1[MtlEntry]
    end

    subgraph Performance
        P1[PerformanceMetric]
    end

    C1 --> T1
    T1 --> R1
    T4 --> M1
    T5 --> M1
    T6 --> M1
    T3 --> P1
    T8 --> P1
