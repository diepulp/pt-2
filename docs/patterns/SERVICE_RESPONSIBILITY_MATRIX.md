# Service Responsibility Matrix - Bounded Context Integrity

> **Date**: 2025-10-06
> **Status**: Post-RatingSlip Simplification - Domain Separation Established
> **Purpose**: Maintain bounded context integrity across Player ↔ RatingSlip ↔ Casino domains

---

## Executive Summary

**Core Principle**: Each service owns its domain data, references foreign contexts by ID only.

**Key Insight from RatingSlip Simplification**:
- **RatingSlip** = Performance ledger (how well player performed)
- **PlayerFinancial** = Financial ledger (money/chips in/out)
- Separation prevents domain coupling and maintains single responsibility

---

## Bounded Context Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CASINO TRACKER SYSTEM                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐  │
│  │   IDENTITY   │        │   LOCATION   │        │   FINANCE    │  │
│  │   CONTEXT    │        │   CONTEXT    │        │   CONTEXT    │  │
│  │              │        │              │        │              │  │
│  │   Player     │───────▶│   Casino     │        │   Player     │  │
│  │   Service    │        │   Service    │        │   Financial  │  │
│  └──────┬───────┘        └──────┬───────┘        └──────┬───────┘  │
│         │                       │                       │           │
│         │                       │                       │           │
│         ▼                       ▼                       ▼           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              SESSION CONTEXT (Aggregate Root)                 │  │
│  │                                                                │  │
│  │  ┌──────────────┐        ┌──────────────┐                    │  │
│  │  │    Visit     │───────▶│  RatingSlip  │                    │  │
│  │  │   Service    │        │   Service    │                    │  │
│  │  │              │        │ (Performance)│                    │  │
│  │  └──────────────┘        └──────────────┘                    │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Service Responsibility Matrix

| Domain | Service | Owns | References | Aggregates | Responsibilities |
|--------|---------|------|------------|------------|------------------|
| **Identity** | `PlayerService` | • Player profile<br>• Contact info<br>• Identity data | – | • Visits<br>• RatingSlips<br>• Financials | Identity management |
| **Location** | `CasinoService` | • Casino details<br>• Tables<br>• Game configs | – | • Visits<br>• RatingSlips | Venue management |
| **Session** | `VisitService` | • Visit sessions<br>• Check-in/out<br>• Visit mode/status | • Player (FK)<br>• Casino (FK) | • RatingSlips | Session lifecycle |
| **Performance** | `RatingSlipService` | • Average bet<br>• Time played<br>• Points earned<br>• Game settings<br>• Seat number | • Player (FK)<br>• Visit (FK)<br>• Gaming Table (FK) | – | **Performance metrics only** |
| **Finance** | `PlayerFinancialService` | • Cash in/out<br>• Chips brought/taken<br>• Transaction history<br>• Reconciliation | • Player (FK)<br>• Visit (FK)<br>• RatingSlip (FK, optional) | – | **Financial tracking only** |

---

## Domain Ownership Rules

### ✅ RatingSlip Service (Performance Ledger)

**OWNS:**
- `average_bet` - How much player wagered
- `start_time` / `end_time` - Duration of play
- `points` - Loyalty points earned
- `accumulated_seconds` - Time played (computed)
- `game_settings` - Game configuration during play
- `seat_number` - Where player sat
- `status` - Rating slip lifecycle state

**DOES NOT OWN:**
- ❌ Cash/chip transactions → `PlayerFinancialService`
- ❌ Player identity → `PlayerService`
- ❌ Visit session → `VisitService`

**BOUNDED CONTEXT**: "How well did the player perform?"

---

### ✅ PlayerFinancialService (Financial Ledger)

**OWNS:**
- `cash_in` - Cash brought to table
- `chips_brought` - Starting chip count
- `chips_taken` - Ending chip count
- `transaction_type` - Deposit, withdrawal, exchange
- `reconciliation_status` - Balanced vs pending
- `net_change` - Computed win/loss

**REFERENCES:**
- `player_id` - Who the transaction is for
- `visit_id` - Which session it occurred in
- `rating_slip_id` - Optional link to performance context

**BOUNDED CONTEXT**: "What money/chips moved in/out?"

---

### ✅ PlayerService (Identity Context)

**OWNS:**
- `email`, `firstName`, `lastName` - Identity
- `loyalty_tier` - Player classification
- `preferences` - Player settings

**AGGREGATES:**
- Total visits (via `VisitService`)
- Total points (sum across `RatingSlipService`)
- Financial history (via `PlayerFinancialService`)

**BOUNDED CONTEXT**: "Who is this player?"

---

### ✅ VisitService (Session Context)

**OWNS:**
- `check_in_date` / `check_out_date` - Session boundaries
- `mode` - How player is playing (tracked, untracked)
- `status` - Visit lifecycle state

**AGGREGATES:**
- Rating slips for this visit
- Financial transactions for this visit

**BOUNDED CONTEXT**: "What is the player's session at the casino?"

---

## Data Flow Diagrams

### Creating a Complete Session with Performance & Finances

```
┌──────────┐
│  Client  │
└────┬─────┘
     │
     │ 1. Create Player
     ▼
┌──────────────────┐
│ PlayerService    │ → Returns: player_id
└────┬─────────────┘
     │
     │ 2. Create Visit (player_id + casino_id)
     ▼
┌──────────────────┐
│ VisitService     │ → Returns: visit_id
└────┬─────────────┘
     │
     ├─────────────────────┬────────────────────┐
     │                     │                    │
     │ 3a. Create          │ 3b. Create         │
     │ RatingSlip          │ Financial Tx       │
     ▼                     ▼                    │
┌──────────────────┐  ┌──────────────────────┐  │
│ RatingSlipSvc    │  │ PlayerFinancialSvc   │  │
│ (Performance)    │  │ (Money tracking)     │  │
│                  │  │                      │  │
│ • average_bet    │  │ • cash_in            │  │
│ • points         │  │ • chips_brought      │  │
│ • time_played    │  │ • chips_taken        │  │
└──────────────────┘  └──────────────────────┘  │
                                                │
                                                ▼
                        ┌──────────────────────────────┐
                        │  Aggregated Session Report   │
                        │  • Performance metrics       │
                        │  • Financial summary         │
                        │  • Visit details             │
                        └──────────────────────────────┘
```

### Cross-Service Query Pattern

**Query**: "Get player's session summary"

```typescript
// Client Layer (Server Action or API Route)
async function getSessionSummary(visitId: string) {
  // 1. Get visit details
  const visit = await visitService.getById(visitId);

  // 2. Get all rating slips for this visit (parallel)
  const [ratingSlips, financials] = await Promise.all([
    ratingSlipService.getByVisitId(visitId),      // Performance
    playerFinancialService.getByVisitId(visitId)  // Money
  ]);

  // 3. Aggregate at client/action layer
  return {
    visit,
    performance: {
      totalPoints: sum(ratingSlips.map(r => r.points)),
      avgBet: avg(ratingSlips.map(r => r.average_bet)),
      totalTime: sum(ratingSlips.map(r => r.accumulated_seconds)),
    },
    financials: {
      totalCashIn: sum(financials.map(f => f.cash_in)),
      totalChipsOut: sum(financials.map(f => f.chips_taken)),
      netChange: calculate(financials),
    }
  };
}
```

**Key Rule**: Aggregation happens at **client/action layer**, NOT in services.

---

## Anti-Patterns to Avoid

### ❌ Cross-Domain Ownership

```typescript
// BAD: RatingSlip owning financial data
interface RatingSlipDTO {
  average_bet: number;  // ✅ Performance
  cash_in: number;      // ❌ Finance domain
  chips_taken: number;  // ❌ Finance domain
}
```

```typescript
// GOOD: Clear separation
interface RatingSlipDTO {
  average_bet: number;  // ✅ Performance only
}

interface PlayerFinancialDTO {
  cash_in: number;      // ✅ Finance only
  chips_taken: number;  // ✅ Finance only
}
```

---

### ❌ Service-to-Service Direct Calls

```typescript
// BAD: Services calling each other
class RatingSlipService {
  async create(data) {
    // ❌ Service calling another service
    const financial = await playerFinancialService.create({...});
    return this.insert({...financial});
  }
}
```

```typescript
// GOOD: Client/action orchestrates
async function createSession(sessionData) {
  // ✅ Client orchestrates both services
  const ratingSlip = await ratingSlipService.create(sessionData.performance);
  const financial = await playerFinancialService.create(sessionData.finance);

  return { ratingSlip, financial };
}
```

---

### ❌ Shared Mutable State

```typescript
// BAD: Services sharing state
const globalSessionCache = new Map(); // ❌ Global state

class RatingSlipService {
  create(data) {
    globalSessionCache.set(data.visitId, data); // ❌ Mutation
  }
}
```

```typescript
// GOOD: Immutable, isolated state
class RatingSlipService {
  // ✅ No shared state, pure functions
  async create(data: RatingSlipCreateDTO) {
    return executeOperation(...);
  }
}
```

---

## Migration Strategy

### Phase 1: Current State (Complete ✅)
- [x] Player, Visit, RatingSlip services implemented
- [x] RatingSlip simplified (removed financial fields)
- [x] Bounded contexts clarified

### Phase 2: PlayerFinancialService (Next)
1. Create `services/player-financial/` module
2. Schema design:
   ```sql
   CREATE TABLE player_financial_transaction (
     id UUID PRIMARY KEY,
     player_id UUID NOT NULL REFERENCES player(id),
     visit_id UUID NOT NULL REFERENCES visit(id),
     rating_slip_id UUID REFERENCES ratingslip(id), -- Optional link
     cash_in NUMERIC(10,2),
     chips_brought INTEGER,
     chips_taken INTEGER,
     transaction_type TEXT, -- 'DEPOSIT', 'WITHDRAWAL', 'EXCHANGE'
     reconciliation_status TEXT, -- 'PENDING', 'RECONCILED'
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
3. Implement CRUD following template
4. Add query methods: `getByVisitId()`, `getByPlayerId()`

### Phase 3: Integration (After PlayerFinancialService)
1. Update client actions to orchestrate both services
2. Create aggregate queries (performance + finance)
3. Update UI to separate performance vs financial metrics

---

## Bounded Context Validation Checklist

Before adding ANY field to a service, verify:

- [ ] **Single Responsibility**: Does this field belong to this domain's core responsibility?
- [ ] **Ownership**: Is this service the source of truth for this data?
- [ ] **Dependencies**: Does this create coupling with another domain?
- [ ] **YAGNI**: Is this needed for current MVP scope?

**Example**:
```
Field: cash_in
Service: RatingSlipService
Checklist:
- [ ] Single Responsibility? NO (RatingSlip = performance, not finance)
- [ ] Ownership? NO (Finance domain owns monetary data)
- [ ] Dependencies? YES (couples performance with finance)
- [ ] YAGNI? NO (not needed for MVP performance tracking)

Decision: ❌ Reject - belongs in PlayerFinancialService
```

---

## References

- [RatingSlip Simplification Analysis](./ratingslip-simplification-analysis.md) - KISS/YAGNI audit
- [Service Template](../patterns/SERVICE_TEMPLATE.md) - Implementation pattern
- [Canonical Blueprint](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) - Architecture standards

---

**Next Action**: Implement `PlayerFinancialService` following this bounded context model.
