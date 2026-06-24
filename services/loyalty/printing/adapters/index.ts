/**
 * Transport adapters barrel (PRD-092 WS5)
 *
 * Public surface of the WS5 transport layer: the `cups` (production) and `fake`
 * (deterministic) adapters, plus the loopback agent + its clients/spoolers.
 *
 * Selection is config-driven at deployment (ADR-062 D3 — one realization per
 * deployment). WS6 owns registry wiring: it imports `createPrinterAdapterRegistry`
 * from the service barrel and registers the adapter the deployment selects. No
 * registry convenience lives here — that would close an `index → adapters → index`
 * import cycle, and registration is one-time orchestration WS6 already owns.
 *
 * @see PRD-092 / EXEC-092 WS5
 */

export {
  createCupsAdapter,
  buildTestPrintDocument,
  deriveJobKey,
  mapAgentResponseToOutcome,
  mapTransportErrorToOutcome,
  type CupsAdapterConfig,
} from './cups-adapter';
export { createFakeAdapter, type FakeAdapterConfig } from './fake-adapter';
export {
  createWindowsAdapter,
  type WindowsAdapterConfig,
} from './windows-adapter';
export * from '../agent/loopback-agent';
