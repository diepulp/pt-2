/**
 * Authenticated, loopback-only /diagnostics endpoint (PRD-093 WS_W3)
 *
 * The machine-verifiable health surface the governed provisioning + certification
 * scripts (WS_W9 / WS_W6) probe to replace dozens of manual checks. It binds
 * loopback only (the agent's HTTP server does the bind), REQUIRES authentication,
 * and is NARROWLY scoped.
 *
 * DISCLOSURE BOUNDARY INVARIANT (audit P2-2): the response contains ONLY the six
 * fields below. It MUST NOT return credentials, secrets, authentication tokens,
 * raw request bodies, full environment variables, or filesystem paths. Native/Win32
 * detail stays in access-controlled local logs, never here. The booleans are
 * supplied by INJECTED probes, so this module never itself reads env/fs — it cannot
 * leak what it cannot see. `agent-auth-version.test.ts` asserts the exact field set.
 *
 * @see PRD-093 / EXEC-093 WS_W3
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-03)
 */

import { AGENT_PROTOCOL_VERSION } from './protocol-version';

/** The complete, allow-listed /diagnostics response. No other field is permitted. */
export interface DiagnosticsSnapshot {
  agent_version: string;
  protocol_version: number;
  service_health: 'ok' | 'degraded';
  configured_target_exists: boolean;
  native_module_loaded: boolean;
  spooler_connectivity: boolean;
}

/** Injected boolean probes — the endpoint asks; it does not read env/fs itself. */
export interface DiagnosticsProbes {
  configuredTargetExists(): boolean;
  nativeModuleLoaded(): boolean;
  spoolerConnectivity(): boolean;
}

export interface DiagnosticsEndpointDeps {
  agentVersion: string;
  probes: DiagnosticsProbes;
  /**
   * Loopback diagnostics authorization. Returns true only for the sanctioned,
   * provisioned caller credential. An absent/incorrect credential → unauthorized.
   */
  authorize(presentedCredential: string | undefined): boolean;
}

export type DiagnosticsResult =
  | { status: 200; body: DiagnosticsSnapshot }
  | { status: 401 };

/**
 * Build the /diagnostics handler. Unauthorized callers get a bare 401 (no body,
 * no hint). Authorized callers get exactly the six allow-listed fields.
 */
export function createDiagnosticsEndpoint(
  deps: DiagnosticsEndpointDeps,
): { handle(presentedCredential: string | undefined): DiagnosticsResult } {
  return {
    handle(presentedCredential: string | undefined): DiagnosticsResult {
      if (!deps.authorize(presentedCredential)) {
        return { status: 401 };
      }
      const configuredTargetExists = deps.probes.configuredTargetExists();
      const nativeModuleLoaded = deps.probes.nativeModuleLoaded();
      const spoolerConnectivity = deps.probes.spoolerConnectivity();
      const healthy =
        configuredTargetExists && nativeModuleLoaded && spoolerConnectivity;
      // Construct the snapshot as an exact literal — never spread external objects
      // (a spread could smuggle extra fields past the disclosure boundary).
      const body: DiagnosticsSnapshot = {
        agent_version: deps.agentVersion,
        protocol_version: AGENT_PROTOCOL_VERSION,
        service_health: healthy ? 'ok' : 'degraded',
        configured_target_exists: configuredTargetExists,
        native_module_loaded: nativeModuleLoaded,
        spooler_connectivity: spoolerConnectivity,
      };
      return { status: 200, body };
    },
  };
}
