## Dual-Boundary Tenancy — Implementation Précis

### What Was Achieved

Two phases merged to main via PR #25 (commit `f12ae75`) and PR #27:

**Phase 1 — Company Foundation (ADR-043)**
- `company` entity populated with 1:1 synthetic ownership per casino
- `casino.company_id` enforced NOT NULL with RESTRICT FK
- `set_rls_context_from_staff()` derives and sets `app.company_id` via SET LOCAL
- `RLSContext` TypeScript interface extended with required `companyId`
- Zero behavioral change for existing single-casino users

**Phase 2 Slice 1 — Cross-Property Recognition + Loyalty Entitlement (ADR-044, PRD-051)**
- **3 RPCs**: `rpc_lookup_player_company`, `rpc_activate_player_locally`, `rpc_redeem_loyalty_locally`
- **3 API routes**: `/api/v1/players/{lookup-company,activate-locally,redeem-loyalty}`
- **Dual-mode SELECT RLS** on `player_casino` and `player_loyalty` — Path 1 (same casino) + Path 2 (same company)
- **Recognition service** (`services/recognition/`) — full Pattern A with DTOs, mappers, schemas, keys, http
- **4 UI components**: recognition card, activate dialog, loyalty entitlement display, redeem dialog
- **Audit events**: `company_lookup`, `local_activation`, `loyalty_redemption`
- All mutations remain local-casino-scoped; only reads cross the company boundary

### Key Architectural Rules

| Rule | Summary |
|---|---|
| **Entitlement Boundary** | Balance + tier cross company boundary; ledger entries do not |
| **Recognition Surface** | Identity, enrollment, entitlement visible cross-property; operational/financial/compliance data stays property-scoped |
| **Accrual/Redemption Symmetry** | Both execute locally; portfolio total is a computed consequence |
| **D7 Hybrid Surface** | Portfolio total = awareness only; `redeemable_here` = actionable |

### Gaps — Phase 2 Slice 2 (Exclusion Safety Signal)

**Status: STUBBED** — awaiting `player-exclusion` branch merge to main

| Stub | Current Value | Intended Behavior |
|---|---|---|
| `has_sister_exclusions` | `NULL` | `boolean` — cross-company exclusion check |
| `max_exclusion_severity` | `NULL` | `hard_block` / `soft_alert` / `monitor` / `null` |

**What's needed after `player-exclusion` merges:**
1. Update `rpc_lookup_player_company` to query `player_exclusion` for sister-property signals
2. Add severity enforcement in activation/redemption RPCs (block `hard_block`, require admin override for `soft_alert`)
3. Wire `soft_alert` override auditing
4. Update UI components for exclusion warnings

### Tangential Dependencies

| Dependency | Status | Impact |
|---|---|---|
| `player-exclusion` branch | **Not on main** | Blocks Slice 2 exclusion signals |
| Generated types lag | RPCs called untyped in `crud.ts` | Needs `npm run db:types-local` after next migration sync |
| ADR-040 (Identity Provenance) | Accepted | Amends ADR-024 INV-8 — company_id derivation follows Category A classification |
| `player_loyalty` write policies | Casino-scoped only | Intentional — loyalty accounting stays property-bound |

### Not In Scope (by design)

- No multi-casino staff access or tenant switching
- No `staff_casino_access` junction table
- No client-supplied casino selection (ADR-024 INV-8 preserved)
- No `loyalty_ledger` cross-property visibility
- No company admin tooling
What It Does                                                                                                                                                                                                      
                                                                                                                                                                                                                  
  When a player walks into one of your sister casinos — a property owned by the same company — the pit boss can recognize them instantly. They can see that this person is already a known player at another        
  property in the group, view their loyalty balance across all properties, and activate them locally without re-enrolling from scratch.                                                                             
                                                                                                                                                                                                                    
  Once activated, the player's existing loyalty points are visible. The pit boss can redeem points earned at other properties right there on the floor. Points are always earned and spent at the local property,   
  but the player's total across the company is visible for context.                                                                                                                                                 
                                                                                                                                                                                                                    
  What's Accessible Across Sister Properties                                                                                                                                                                        
                                                                                                                                                                                                                  
  Can see across properties:                                                                                                                                                                                        
  - Player identity (name, DOB)                                                                                                                                                                                     
  - Where they're enrolled in the company
  - Their loyalty tier and total points balance                                                                                                                                                                     
                                                                  
  Cannot see across properties:                                                                                                                                                                                     
  - How they earned their points (individual ledger entries, campaign details)                                                                                                                                    
  - Their gaming activity (visits, rating slips, table play)                                                                                                                                                        
  - Financial or compliance records                                                                                                                                                                                 
                                                      
  The rule is simple: what the player has is visible company-wide; how they got it stays at the property where it happened.                                                                                         
                                                                  
  Current Posture                                                                                                                                                                                                   
                                                                                                                                                                                                                  
  The foundation is working — lookup, activation, and local redemption are all live. The one missing piece is the exclusion safety check: if a player has been excluded or flagged at a sister property, the system 
  doesn't yet surface that warning. That's waiting on the player exclusion feature to land on main. Until then, the cross-property view is blind to exclusion status.                                               
                                                                                                                                                                                                                    
  Staff remain bound to their home casino. There's no casino-switching or multi-property login — a pit boss at Casino A can see a player from Casino B, but they're always operating as Casino A staff. 