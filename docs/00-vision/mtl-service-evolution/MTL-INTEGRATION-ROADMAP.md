# MTL Service Integration Roadmap

**Document ID**: VIS-MTL-EVOLUTION-001
**Status**: Draft
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Author**: System Architect
**Related**: PRD-005, ADR-016, COMP-002

---

## Executive Summary

The MTL (Monetary Transaction Log) service is currently operational with **manual entry** for AML/CTR compliance tracking. This document outlines the evolution path to achieve automated transaction streaming, real-time threshold alerts, and full regulatory compliance integration.

---

## Current State (MVP - Delivered)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CURRENT ARCHITECTURE                           │
│                                                                     │
│   ┌─────────────┐      Manual Entry      ┌──────────────────────┐  │
│   │   Staff     │ ───────────────────────▶ │   MTL Service       │  │
│   │  (Pit Boss, │      POST /entries      │   (Append-Only)      │  │
│   │   Cashier)  │                         │                      │  │
│   └─────────────┘                         │  ┌────────────────┐  │  │
│                                           │  │ mtl_entry      │  │  │
│   ┌─────────────┐                         │  │ mtl_audit_note │  │  │
│   │   Finance   │      NO CONNECTION      │  └────────────────┘  │  │
│   │   Service   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▷│                      │  │
│   │             │      (Post-MVP)         │  Badges computed     │  │
│   └─────────────┘                         │  at read time        │  │
│                                           └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Capabilities Delivered
| Feature | Status | Notes |
|---------|--------|-------|
| Manual entry creation | ✅ Done | Idempotent, append-only |
| Two-tier badge system | ✅ Done | Entry + Aggregate badges |
| Gaming day computation | ✅ Done | Trigger-based from `occurred_at` |
| Audit trail | ✅ Done | Immutable notes, RLS enforced |
| Compliance dashboard | ✅ Done | Gaming Day Summary view |
| React Query polling | ✅ Done | 60s auto-refresh |

### Known Gaps
| Gap | Impact | Priority |
|-----|--------|----------|
| No Finance streaming | High manual effort | P0 |
| No real-time alerts | Delayed compliance awareness | P1 |
| No patron lookup | Staff must know patron_uuid | P1 |
| No export/reporting | Manual CTR filing | P2 |

---

## Phase 1: Finance-to-MTL Event Streaming

**Target**: Automatic MTL entry creation from financial transactions
**Dependency**: ADR-016 (Finance Service Event Architecture)

### Data Flow Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: EVENT-DRIVEN ARCHITECTURE                       │
│                                                                             │
│  ┌─────────────────────┐                                                    │
│  │  Rating Slip Modal  │                                                    │
│  │  ─────────────────  │                                                    │
│  │  Buy-in: $5,000     │                                                    │
│  │  [Submit]           │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────┐     Event Bus      ┌─────────────────────────┐    │
│  │  PlayerFinancial    │    (Postgres)      │      MTL Service        │    │
│  │  Service            │                    │                         │    │
│  │  ──────────────     │   financial_txn    │  ┌───────────────────┐  │    │
│  │  createTransaction()│ ═══════════════════▶  │ Event Consumer    │  │    │
│  │                     │      .inserted      │  │ ─────────────────│  │    │
│  │  ┌───────────────┐  │                    │  │ processFinancial │  │    │
│  │  │financial_txn  │  │                    │  │ TxnEvent()       │  │    │
│  │  └───────────────┘  │                    │  └─────────┬─────────┘  │    │
│  └─────────────────────┘                    │            │            │    │
│                                             │            ▼            │    │
│                                             │  ┌───────────────────┐  │    │
│                                             │  │ mtl_entry         │  │    │
│                                             │  │ (auto-created)    │  │    │
│                                             │  └───────────────────┘  │    │
│                                             └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

#### 1.1 Event Schema Definition
```typescript
// services/mtl/events/financial-txn-event.ts

interface FinancialTxnEvent {
  event_id: string;           // UUID for idempotency
  event_type: 'financial_txn.created';
  occurred_at: string;        // ISO8601
  payload: {
    txn_id: string;
    patron_uuid: string;
    casino_id: string;
    staff_id: string | null;
    rating_slip_id: string | null;
    visit_id: string | null;
    amount: number;
    direction: 'in' | 'out';
    txn_type: 'buy_in' | 'cash_out' | 'marker' | 'front_money';
    source: 'table' | 'cage' | 'kiosk';
    area: string | null;
    occurred_at: string;      // When txn happened (paper form time)
  };
}
```

#### 1.2 Event Consumer Service
```typescript
// services/mtl/consumers/financial-txn-consumer.ts

export function createFinancialTxnConsumer(deps: {
  mtlService: MtlServiceInterface;
  logger: Logger;
}) {
  return {
    async processEvent(event: FinancialTxnEvent): Promise<void> {
      // Idempotency: use event_id as idempotency_key
      await deps.mtlService.createEntry({
        patron_uuid: event.payload.patron_uuid,
        casino_id: event.payload.casino_id,
        staff_id: event.payload.staff_id ?? undefined,
        rating_slip_id: event.payload.rating_slip_id ?? undefined,
        visit_id: event.payload.visit_id ?? undefined,
        amount: event.payload.amount,
        direction: event.payload.direction,
        txn_type: mapTxnType(event.payload.txn_type),
        source: event.payload.source,
        area: event.payload.area ?? undefined,
        occurred_at: event.payload.occurred_at,
        idempotency_key: event.event_id, // Event-based idempotency
      });
    }
  };
}
```

#### 1.3 Database Trigger Option (Alternative)
```sql
-- supabase/migrations/YYYYMMDDHHMMSS_mtl_finance_streaming_trigger.sql

-- Option: Database-level event streaming via trigger
-- Pro: Zero application code, guaranteed delivery
-- Con: Tight coupling, harder to version

CREATE OR REPLACE FUNCTION fn_stream_financial_txn_to_mtl()
RETURNS TRIGGER AS $$
BEGIN
  -- Only stream buy_in and cash_out (not internal transfers)
  IF NEW.txn_type IN ('buy_in', 'cash_out', 'marker', 'front_money') THEN
    INSERT INTO mtl_entry (
      patron_uuid, casino_id, staff_id, rating_slip_id, visit_id,
      amount, direction, txn_type, source, area, occurred_at,
      idempotency_key
    ) VALUES (
      NEW.patron_uuid, NEW.casino_id, NEW.staff_id, NEW.rating_slip_id, NEW.visit_id,
      NEW.amount, NEW.direction, NEW.txn_type::mtl_txn_type, NEW.source::mtl_source,
      NEW.area, COALESCE(NEW.occurred_at, NEW.created_at),
      'fin_' || NEW.id::text  -- Prefix for traceability
    )
    ON CONFLICT (casino_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_financial_txn_to_mtl
  AFTER INSERT ON financial_txn
  FOR EACH ROW
  EXECUTE FUNCTION fn_stream_financial_txn_to_mtl();
```

### Decision Required

| Approach | Pros | Cons |
|----------|------|------|
| **App-level consumer** | Loose coupling, testable, versionable | Requires event bus infra |
| **DB trigger** | Zero latency, guaranteed delivery | Tight coupling, harder to debug |
| **Hybrid** | Best of both (trigger + async enrichment) | Complexity |

**Recommendation**: Start with **DB trigger** for MVP integration, migrate to app-level consumer when event bus infrastructure is established.

---

## Phase 2: Real-Time Threshold Notifications

**Target**: Push notifications when approaching/exceeding CTR threshold
**Dependency**: Phase 1 (automated entry creation)

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: REAL-TIME NOTIFICATIONS                        │
│                                                                            │
│  ┌─────────────────────┐     Supabase      ┌─────────────────────────┐     │
│  │   mtl_entry         │     Realtime      │    Compliance           │     │
│  │   INSERT            │ ═══════════════════▶    Dashboard          │     │
│  └─────────────────────┘                   │                         │     │
│                                            │  ┌───────────────────┐  │     │
│  ┌─────────────────────┐                   │  │ ThresholdAlert    │  │     │
│  │   Threshold         │                   │  │ Component         │  │     │
│  │   Evaluation        │                   │  │ ───────────────── │  │     │
│  │   ────────────────  │                   │  │ "John Doe is at  │   │     │
│  │   On entry insert:  │                   │  │  $9,500 cash-in  │   │     │
│  │   1. Query summary  │                   │  │  (95% of CTR)"   │   │     │
│  │   2. Evaluate badge │                   │  └───────────────────┘  │     │
│  │   3. If threshold   │    WebSocket      │                         │     │
│  │      crossed →      │ ═══════════════════▶  Push notification    │     │
│  │      emit alert     │                   │  to pit boss screen     │     │
│  └─────────────────────┘                   └─────────────────────────┘     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

#### 2.1 Supabase Realtime Subscription
```typescript
// hooks/mtl/use-mtl-realtime.ts

export function useMtlRealtimeAlerts(casinoId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`mtl_alerts:${casinoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mtl_entry',
          filter: `casino_id=eq.${casinoId}`,
        },
        async (payload) => {
          // Invalidate queries to trigger re-fetch with new badges
          queryClient.invalidateQueries({
            queryKey: mtlKeys.gamingDaySummary.scope(casinoId),
          });

          // Check if threshold alert needed
          const entry = payload.new as MtlEntryRow;
          await evaluateThresholdAlert(entry, casinoId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [casinoId, queryClient]);
}
```

#### 2.2 Threshold Alert Evaluation
```typescript
// services/mtl/alerts/threshold-evaluator.ts

interface ThresholdAlert {
  patron_uuid: string;
  patron_name: string;
  direction: 'in' | 'out';
  current_total: number;
  threshold: number;
  percentage: number;
  badge: AggBadge;
  gaming_day: string;
}

export async function evaluateThresholdAlert(
  entry: MtlEntryRow,
  casinoId: string,
): Promise<ThresholdAlert | null> {
  // Fetch current day summary for this patron
  const summary = await mtlService.getGamingDaySummary({
    casino_id: casinoId,
    gaming_day: entry.gaming_day!,
    patron_uuid: entry.patron_uuid,
  });

  if (!summary.items.length) return null;

  const patronSummary = summary.items[0];
  const thresholds = await getCasinoThresholds(casinoId);

  // Check if we crossed a threshold boundary with this entry
  const alerts: ThresholdAlert[] = [];

  if (entry.direction === 'in') {
    const prevTotal = patronSummary.total_in - entry.amount;
    const currTotal = patronSummary.total_in;

    if (currTotal > thresholds.ctrThreshold && prevTotal <= thresholds.ctrThreshold) {
      alerts.push({
        patron_uuid: entry.patron_uuid,
        direction: 'in',
        current_total: currTotal,
        threshold: thresholds.ctrThreshold,
        percentage: 100,
        badge: 'agg_ctr_met',
        gaming_day: entry.gaming_day!,
      });
    } else if (currTotal > thresholds.ctrThreshold * 0.9 && prevTotal <= thresholds.ctrThreshold * 0.9) {
      alerts.push({
        patron_uuid: entry.patron_uuid,
        direction: 'in',
        current_total: currTotal,
        threshold: thresholds.ctrThreshold,
        percentage: Math.round((currTotal / thresholds.ctrThreshold) * 100),
        badge: 'agg_ctr_near',
        gaming_day: entry.gaming_day!,
      });
    }
  }

  // Similar logic for cash-out...

  return alerts.length > 0 ? alerts[0] : null;
}
```

#### 2.3 Alert Toast Component
```typescript
// components/mtl/threshold-alert-toast.tsx

export function ThresholdAlertToast({ alert }: { alert: ThresholdAlert }) {
  const { patron_name, direction, current_total, percentage, badge } = alert;

  const severity = badge === 'agg_ctr_met' ? 'error' : 'warning';
  const icon = badge === 'agg_ctr_met' ? <AlertTriangle /> : <AlertCircle />;

  return (
    <Toast variant={severity}>
      {icon}
      <div>
        <strong>CTR Threshold {badge === 'agg_ctr_met' ? 'Exceeded' : 'Approaching'}</strong>
        <p>
          {patron_name} has {direction === 'in' ? 'bought in' : 'cashed out'}{' '}
          ${current_total.toLocaleString()} today ({percentage}% of CTR threshold)
        </p>
        {badge === 'agg_ctr_met' && (
          <p className="text-sm font-medium">CTR filing required per 31 CFR § 1021.311</p>
        )}
      </div>
    </Toast>
  );
}
```

---

## Phase 3: Patron Lookup Integration

**Target**: Staff can search for patron by name/ID instead of requiring UUID
**Dependency**: Player Identity Service

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: PATRON LOOKUP                                   │
│                                                                             │
│  ┌─────────────────────┐                   ┌─────────────────────────┐     │
│  │  MTL Entry Form     │                   │  Player Service         │     │
│  │  ─────────────────  │                   │  ───────────────        │     │
│  │                     │    GET /players   │                         │     │
│  │  Patron: [________] │ ═══════════════════▶  Search by:           │     │
│  │           ↓         │    ?search=       │  - Name                 │     │
│  │  ┌───────────────┐  │                   │  - Player ID            │     │
│  │  │ John Doe      │  │ ◀═══════════════════  - Loyalty Card #      │     │
│  │  │ ID: P-12345   │  │    Results        │  - Phone (last 4)      │     │
│  │  │ Card: 9876543 │  │                   │                         │     │
│  │  └───────────────┘  │                   └─────────────────────────┘     │
│  │                     │                                                    │
│  │  Amount: [$5,000]   │                                                    │
│  │  Type: [Buy-in ▼]   │                                                    │
│  │                     │                                                    │
│  │  [Submit]           │                                                    │
│  └─────────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: Patron Combobox
```typescript
// components/mtl/patron-combobox.tsx

export function PatronCombobox({
  casinoId,
  onSelect,
}: {
  casinoId: string;
  onSelect: (patron: PatronDTO) => void;
}) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: patrons, isLoading } = usePatronSearch({
    casino_id: casinoId,
    search: debouncedSearch,
    limit: 10,
  });

  return (
    <Combobox onSelect={onSelect}>
      <ComboboxInput
        placeholder="Search patron by name or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ComboboxOptions>
        {isLoading && <ComboboxLoading />}
        {patrons?.map((patron) => (
          <ComboboxOption key={patron.patron_uuid} value={patron}>
            <div className="flex justify-between">
              <span>{patron.full_name}</span>
              <span className="text-muted-foreground">{patron.player_id}</span>
            </div>
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}
```

---

## Phase 4: CTR Export & Reporting

**Target**: Generate CTR-ready reports for compliance filing
**Dependency**: Phases 1-3

### Export Capabilities

| Report | Format | Trigger |
|--------|--------|---------|
| Daily CTR Summary | CSV/PDF | Manual or scheduled |
| Patron Transaction History | CSV | On demand |
| Threshold Breach Log | CSV | Compliance audit |
| Gaming Day Snapshot | JSON | API export |

### Implementation: Export Service
```typescript
// services/mtl/exports/ctr-report-generator.ts

export interface CtrReportRequest {
  casino_id: string;
  gaming_day: string;
  include_below_threshold?: boolean;
}

export interface CtrReportEntry {
  patron_uuid: string;
  patron_name: string;
  tax_id: string | null;  // Required for CTR filing
  total_cash_in: number;
  total_cash_out: number;
  transaction_count: number;
  first_txn_at: string;
  last_txn_at: string;
  ctr_required_in: boolean;
  ctr_required_out: boolean;
}

export async function generateCtrReport(
  request: CtrReportRequest,
): Promise<CtrReportEntry[]> {
  const summary = await mtlService.getGamingDaySummary({
    casino_id: request.casino_id,
    gaming_day: request.gaming_day,
    // Only include patrons that crossed CTR threshold
    agg_badge_in: request.include_below_threshold ? undefined : 'agg_ctr_met',
  });

  // Enrich with patron details for CTR filing
  const enriched = await Promise.all(
    summary.items.map(async (item) => {
      const patron = await playerService.getPatron(item.patron_uuid);
      return {
        patron_uuid: item.patron_uuid,
        patron_name: patron?.full_name ?? 'Unknown',
        tax_id: patron?.tax_id ?? null,  // WARNING: May need verification
        total_cash_in: item.total_in,
        total_cash_out: item.total_out,
        transaction_count: item.entry_count,
        first_txn_at: item.first_in_at ?? item.first_out_at ?? '',
        last_txn_at: item.last_in_at ?? item.last_out_at ?? '',
        ctr_required_in: item.total_in > 10000,
        ctr_required_out: item.total_out > 10000,
      };
    })
  );

  return enriched;
}
```

---

## Implementation Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE DEPENDENCIES                                   │
│                                                                             │
│   Phase 1                Phase 2              Phase 3           Phase 4     │
│   Finance Streaming      Real-time Alerts    Patron Lookup     CTR Export  │
│   ═══════════════        ═══════════════     ═════════════     ══════════  │
│                                                                             │
│   ┌─────────────┐        ┌─────────────┐     ┌───────────┐     ┌────────┐  │
│   │ DB Trigger  │───────▶│ Realtime    │     │ Player    │────▶│ Report │  │
│   │ or Event    │        │ Subscription│     │ Search    │     │ Gen    │  │
│   │ Consumer    │        │ + Threshold │     │ Combobox  │     │        │  │
│   └─────────────┘        │ Evaluator   │     └───────────┘     └────────┘  │
│         │                └─────────────┘           │                │      │
│         │                      │                   │                │      │
│         └──────────────────────┴───────────────────┴────────────────┘      │
│                                │                                            │
│                                ▼                                            │
│                    All phases required for full                             │
│                    CTR compliance automation                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Phase | Dependencies | Estimated Effort | Priority |
|-------|--------------|------------------|----------|
| Phase 1: Finance Streaming | ADR-016, PlayerFinancial Service | Medium | P0 |
| Phase 2: Real-time Alerts | Phase 1, Supabase Realtime | Medium | P1 |
| Phase 3: Patron Lookup | Player Identity Service | Low | P1 |
| Phase 4: CTR Export | Phases 1-3, Tax ID verification | Medium | P2 |

---

## Decision Log

| Date | Decision | Rationale | ADR |
|------|----------|-----------|-----|
| 2026-01-03 | Manual entry for MVP | Reduce scope, ship faster | PRD-005 |
| 2026-01-03 | Two-tier badge system | Separate UX from compliance | PRD-005 §3.2 |
| TBD | DB trigger vs App consumer | Pending infra evaluation | ADR-016 |
| TBD | Realtime vs Polling | Cost/complexity tradeoff | TBD |

---

## References

- [PRD-005: MTL Service](../10-prd/PRD-005-mtl-service.md)
- [ADR-016: Finance Service Event Architecture](../80-adrs/ADR-016-finance-event-architecture.md)
- [COMP-002: MTL Compliance Standard](../30-security/compliance/COMP-002-mtl-compliance-standard.md)
- [31 CFR § 1021.311: Currency Transaction Reports](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1021/subpart-C/section-1021.311)
