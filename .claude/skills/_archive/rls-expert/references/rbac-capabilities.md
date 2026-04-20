# RBAC Capabilities Matrix

Complete role-based access control matrix for PT-2, sourced from SEC-003 and SEC-005.

## Role Registry

### Primary Staff Roles (`staff_role` enum)

| Role | Auth | Description |
|------|------|-------------|
| `admin` | REQUIRED | Full administrative access within casino scope |
| `pit_boss` | REQUIRED | Operations: tables, visits, rating slips, limited finance |
| `cashier` | REQUIRED | Finance: cage operations, transactions via RPC |
| `dealer` | PROHIBITED | ZERO permissions - scheduling metadata only |

### Service Claims (Future)

| Claim | Issuer | Scope |
|-------|--------|-------|
| `compliance` | Auth gateway | Read MTL/finance, append audit notes |
| `reward_issuer` | Auth gateway | Issue loyalty rewards via RPC |
| `automation` | System | Limited config updates |

---

## Capabilities by Bounded Context

### CasinoService (Foundational)

| Role | Read Settings | Write Settings | Read Staff | Manage Staff | Read Audit |
|------|--------------|----------------|------------|--------------|------------|
| admin | YES | YES | YES | YES | YES |
| pit_boss | YES | NO | YES | NO | YES |
| cashier | YES | NO | NO | NO | NO |
| dealer | NO | NO | NO | NO | NO |

### Player & Visit Service

| Role | Read Player | Write Player | Read Visit | Create/Update Visit | Close Visit |
|------|-------------|--------------|------------|---------------------|-------------|
| admin | YES | YES | YES | YES | YES |
| pit_boss | YES | NO | YES | YES | YES |
| cashier | YES | NO | YES | NO | NO |
| dealer | NO | NO | NO | NO | NO |

### TableContext Service (Operational)

| Role | Read Tables | Update Tables | Manage Rotations | Chip Custody |
|------|-------------|---------------|------------------|--------------|
| admin | YES | YES | YES | YES |
| pit_boss | YES | YES | YES | YES |
| cashier | NO | NO | NO | YES |
| dealer | NO | NO | NO | NO |

### RatingSlip Service (Telemetry)

| Role | Read Rating Slips | Update Status | Close Slip |
|------|-------------------|---------------|------------|
| admin | YES | YES | YES |
| pit_boss | YES | YES | YES |
| cashier | YES | NO | NO |
| dealer | NO | NO | NO |

### LoyaltyService (Reward)

| Role | Read Balance | Read Ledger | Issue Rewards (RPC) | Approve Rewards |
|------|--------------|-------------|---------------------|-----------------|
| admin | YES | YES | YES | YES |
| pit_boss | YES | YES | via RPC | YES |
| cashier | YES | NO | NO | NO |
| dealer | NO | NO | NO | NO |

### PlayerFinancialService (Finance)

| Role | Read Transactions | Create Transaction | View Aggregations |
|------|-------------------|-------------------|-------------------|
| admin | YES | YES (via RPC) | YES |
| pit_boss | YES | LIMITED* | YES |
| cashier | YES | YES (via RPC) | YES |
| dealer | NO | NO | NO |

**\*Pit Boss Constraints (SEC-005 v1.1.0):**
- `direction = 'in'` only (buy-ins, not cash-outs)
- `tender_type IN ('cash', 'chips')` only (no markers)
- `visit_id` required (linked to active session)

### MTLService (Compliance)

| Role | Read MTL | Create Entry | Append Audit Note |
|------|----------|--------------|-------------------|
| admin | YES | YES | YES |
| pit_boss | NO | NO | NO |
| cashier | YES | YES | NO |
| compliance | YES | NO | YES |
| dealer | NO | NO | NO |

### FloorLayoutService (Spatial)

| Role | Read Layouts | Create/Update | Activate |
|------|--------------|---------------|----------|
| admin | YES | YES | YES |
| pit_boss | YES | NO | NO |
| cashier | NO | NO | NO |
| dealer | NO | NO | NO |

---

## Role Hierarchy

```
Admin (highest privilege)
  ├─ Pit Boss (operational)
  ├─ Cashier (financial)
  ├─ Compliance (audit)
  └─ Reward Issuer (loyalty)

Dealer (zero privilege, metadata only)
```

### Inheritance Rules

1. **Admin inherits all** - Has all capabilities of other roles
2. **Specialized roles do NOT inherit** - pit_boss, cashier, compliance are distinct
3. **Dealer inherits nothing** - Zero permissions, cannot authenticate

---

## RLS Policy Role Patterns

### Admin or Operations

```sql
role IN ('pit_boss', 'admin')
```

### Admin or Finance

```sql
role IN ('cashier', 'admin')
```

### Admin Only

```sql
role = 'admin'
```

### Exclude Dealers (Implicit)

```sql
-- Any auth.uid() check automatically excludes dealers
-- because dealers have user_id = NULL
auth.uid() IS NOT NULL
```

---

## Realtime Channel Access

| Channel Type | admin | pit_boss | cashier | compliance | dealer |
|--------------|-------|----------|---------|------------|--------|
| Visit | YES | YES | NO | NO | NO |
| Rating Slip | YES | YES | NO | NO | NO |
| Table Context | YES | YES | NO | NO | NO |
| Loyalty | YES | YES | YES | NO | NO |
| Finance | YES | YES | YES | YES | NO |
| MTL | YES | NO | YES | YES | NO |
| Floor Layout | YES | YES | NO | NO | NO |

---

## Adding New Roles

To add a new role:

1. Determine role type (core enum vs service claim)
2. For core roles: `ALTER TYPE staff_role ADD VALUE 'new_role'`
3. Update capabilities matrices in SEC-005
4. Create RLS policies following SEC-001 templates
5. Update authentication flow in `getAuthContext()`
6. Define realtime channel permissions
7. Document in this taxonomy

## Deprecating Roles

1. Mark as deprecated with EOL date
2. Create migration plan
3. Update all RLS policies to exclude
4. Remove from enum after EOL period
