# LoyaltyService — InstrumentPrinting submodule (PRD-092)

Linux/CUPS **exemplar** (reference implementation) of the controlled
loyalty-instrument print path. Replaces the browser `window.print()` path on the
named redemption surface with a controlled action that persists a durable
`print_attempt` audit row and returns a truthful four-state outcome.

> **Phase scope (ADR-062 D8 Phase 1 / Gate E1):** Linux/CUPS exemplar only. NO
> Windows `windows_spooler` adapter, NO install/update, NO ADR-063 D1–D4/D7
> hardening (those are PRD #2 / Gate E2).

## Pattern

**Pattern A (Contract-First)** functional factory — mirrors `services/loyalty`.
Explicit interfaces, no `ReturnType<>`, no classes. This submodule is the typed
**surface + seam**; the controlled-action orchestration (RPC calls + adapter
submission, fail-closed) lives in the WS6 route handler.

## Files

| File | Responsibility |
|------|----------------|
| `contract.ts` | OS-neutral `LoyaltyInstrumentPrinter` port (`getStatus`, `print`, `testPrint`) + four-state vocabulary + adapter-registry seam (ADR-062 D3). |
| `dtos.ts` | camelCase DTOs derived from the `print_attempt` row; request/transition input DTOs. |
| `schemas.ts` | Zod validation for the controlled-write inputs (ADR-013). |
| `mappers.ts` | Pure row → DTO and input → RPC-args transforms. |
| `index.ts` | Barrel + `createInstrumentPrintingService()` factory + `createPrinterAdapterRegistry()`. |

## Hard boundaries

- **OS-neutral (GATE-PLATFORM-1):** ZERO CUPS / Epson / ESC-POS / spooler types
  or strings in this layer. The contract is the seam adapters (WS5) plug into;
  the rendered-document type is a generic parameter to avoid a layering cycle.
- **Four-state vocabulary only:** `requested | submitted | failed | unknown`.
  No `acknowledged` / `printed` / `completed` — **`submitted` ≠ printed**.
- **§7a device-fault deferral:** `failureDomain` is limited to `render_validation`.
  Device / `PrinterFault` vocabulary is intentionally **absent** (one-way CUPS
  cannot observe device faults; `failure_domain=device` stays null this phase).
- **No instrument authoring (DEC-003):** writes ONLY `print_attempt`.
  `promo_coupon` / `loyalty_ledger` are READ-ONLY correlation sources, referenced
  by a polymorphic `instrumentKind` + `instrumentRef` (uuid, **no hard FK**).
- **Payload reuse:** the frozen `FulfillmentPayload` (`services/loyalty/dtos.ts`,
  `face_value_cents`) is the templating input (WS4) — reused, never forked.

## Deliberate omissions

- **No `keys.ts` (DA §8 — YAGNI).** A React Query key factory is **deferred**:
  the submodule exposes a single mutation surface with no list/detail query in
  scope. Add it only if/when the deferred print-health dashboard arrives.
- **No SRM row / no bounded-context admission.** `InstrumentPrinting` is a
  submodule of `LoyaltyService` (ADR-062 D1). Print-lifecycle terms are local
  integration-contract vocabulary governed by the §7a Terminology/Operator-Copy
  Gate — **not** SRL-admitted.

## Downstream

WS4 builds the `ReceiptDocument` templating layer on this contract; WS5 supplies
the `cups` + `fake` adapters and the loopback agent; WS6 is the controlled action
+ admin test-print; WS7 retires `window.print()` on the operator surface.
