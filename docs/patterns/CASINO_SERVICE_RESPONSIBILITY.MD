# Casino Service Responsibility Matrix
> **Source:** Supabase schema snapshot (Oct 2025)  
> **Version:** 2.0.0  
> **Domain Type:** Foundational / Administrative  
> **Status:** Stable  
> **Owner:** Casino Bounded Context

---

## Definition

Updated Definition (Canonical)

Casino Service: Governs the identity, configuration, and policy environment of each casino property — defining timezone, gaming-day start, staff access, and compliance thresholds — serving as the root authority for all operational domains including TableContext, RatingSlip, MTL, Loyalty, and Performance.

The **Casino Service** represents the **foundational organizational domain** of the Player Tracker ecosystem.  
It defines **physical casinos**, their **operational parameters**, **timezone / gaming-day logic**, and **policy thresholds** that govern subordinate contexts such as TableContext, RatingSlip, Visit, Loyalty, and MTL.

> The Casino bounded context acts as the *root of operational authority*: every table, player session, and compliance event inherits its jurisdiction and configuration from this domain.

---

## Core Entities (Schema Snapshot – Oct 2025)

| Table | Purpose |
|--------|----------|
| **casino** | Master record for each licensed gaming establishment. Includes identifiers, name, address, and operational status. |
| **company** | Parent corporate entity for one or more casinos. Provides legal and ownership grouping. |
| **CasinoSettings** | Per-casino configuration table defining timezone, gaming-day start, and threshold parameters for compliance and performance. |
| **gamesettings** | Optional template library of game configuration defaults applied to tables within the casino. |
| **playercasino** | Associative table linking players to casinos (membership, enrollment, permissions). |
| **Staff** | Staff registry scoped to casino ID; includes role, shift, and access controls. |
| **Report** | Administrative reports generated at the casino level; can reference multiple domains. |
| **AuditLog** | Cross-domain event log capturing CRUD and operational activity under casino scope. |

---

## Primary Responsibilities

| Area | Responsibility | Implementation | Downstream Consumers |
|------|----------------|----------------|----------------------|
| **1. Casino Registry** | Maintain canonical records for each casino. | `casino` | TableContext, Player, Visit, RatingSlip |
| **2. Corporate Grouping** | Manage ownership hierarchies and brand grouping. | `company` | Compliance, Reporting |
| **3. Global Configuration** | Persist timezone, gaming-day start, and operational thresholds. | `CasinoSettings` | MTL, Performance, Visit |
| **4. Game Configuration Templates** | Provide base settings applied to tables. | `gamesettings` | TableContext |
| **5. Staff & Access Control** | Manage staff identities, roles, and permissions. | `Staff` | TableContext, MTL, Auth |
| **6. Player Enrollment** | Record player-to-casino associations for loyalty and session tracking. | `playercasino` | Player, Loyalty |
| **7. Compliance & Audit Oversight** | Log all regulated operations under casino scope. | `AuditLog` | Compliance, MTL |
| **8. Reporting & Analytics** | Generate operational reports (financial, regulatory, performance). | `Report` | Admin, Performance |

---

## Integration Boundaries

| Partner Context | Relationship | Data Flow | Description |
|-----------------|---------------|------------|--------------|
| **TableContext** | Referential | ←→ | Uses `casino_id` for table ownership and configuration inheritance. |
| **Player / Visit** | Referential | ←→ | Player sessions and visits scoped to casino. |
| **RatingSlip** | Referential | ←→ | Inherits casino and timezone settings for session timestamps. |
| **Loyalty** | Referential | ←→ | Points and tier logic operate under casino policy thresholds. |
| **MTL** | Referential / Policy source | → | Consumes `CasinoSettings` for gaming-day and CTR threshold logic. |
| **Performance** | Referential | → | Uses threshold and timezone for metric normalization. |
| **Auth / Staff** | Referential | ←→ | Role-based access within casino jurisdiction. |
| **Audit / Report** | Downstream | → | Aggregates events from all bounded contexts under casino scope. |

---

## Event & Data Flow Overview

```mermaid
graph TD
    subgraph Company Context
        CO[company]
    end

    subgraph Casino Context
        CA[casino]
        CS[CasinoSettings]
        GS[gamesettings]
        ST[Staff]
        PC[playercasino]
        RP[Report]
        AL[AuditLog]
    end

    subgraph TableContext
        T1[gamingtable]
    end

    subgraph PlayerContext
        P1[player]
        V1[visit]
    end

    subgraph MTL
        M1[MtlEntry]
    end

    CO --> CA
    CA --> CS
    CA --> GS
    CA --> ST
    CA --> PC
    CA --> RP
    CA --> AL
    CA --> T1
    CA --> P1
    CA --> V1
    CS --> M1

