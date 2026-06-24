/**
 * Caller<->agent protocol version handshake (PRD-093 WS_W3, ADR-063 D4)
 *
 * A versioned contract between the controlled-path caller and the local agent.
 * An incompatible caller MUST be refused FAIL-CLOSED rather than silently
 * mis-printing (D4). This is intentionally a single integer with exact-match
 * semantics — no negotiation matrix, no rotation machinery (proportionate to a
 * single-workstation pilot).
 *
 * @see PRD-093 / EXEC-093 WS_W3
 * @see docs/00-vision/epson/prd-093/PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md (DEC-WIN-03)
 */

/** The protocol version this agent build speaks. Bump on any wire-shape change. */
export const AGENT_PROTOCOL_VERSION = 1 as const;

/**
 * Fail-closed compatibility check. Exact-match only: an absent, malformed, or
 * mismatched caller version is INCOMPATIBLE (returns false) — never a permissive
 * default. The agent rejects an incompatible caller BEFORE any spooler submission.
 */
export function isCompatibleProtocolVersion(callerVersion: unknown): boolean {
  return (
    typeof callerVersion === 'number' &&
    Number.isInteger(callerVersion) &&
    callerVersion === AGENT_PROTOCOL_VERSION
  );
}
