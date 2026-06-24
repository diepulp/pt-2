# Supply-Chain Acceptance — TEMPLATE (Gate W-B) — PRD-093

Copy to `SUPPLY-CHAIN-ACCEPTANCE.md` and populate **on the certification Windows host with the named
signing authority**. Until populated, the real acceptance artifact is **PENDING** — the template alone
does not satisfy Gate W-B. The integrity-rejection *logic* is proven in CI
(`__tests__/scripts/print-agent/integrity-rejection.test.ts`); these fields confirm it on the **real
signed package**.

**Package:** ______  **Version (pinned):** ______  **Signing authority (named):** ______  **Date:** ______

| Field | Verified (not nominal) | Evidence (command output / hash / thumbprint) |
|-------|------------------------|-----------------------------------------------|
| `agent_binary_signature_verified` | ▢ | `Get-AuthenticodeSignature` → Valid; thumbprint ______ |
| `installer_signature_verified` | ▢ | `signtool verify /pa` → Successfully verified |
| `update_manifest_or_package_integrity_verified` | ▢ | `manifest.json` SHA-256 of every file matches; `node verify-integrity.js <pkgDir>` → `OK package_version=… protocol_version=…` |
| `single_signing_system` | ▢ | one Authenticode signature (no dual-signing); `package-agent.ps1` built the versioned ZIP + manifest |
| `signing_certificate_owner_named` | ▢ | owner ______ |
| `expired_or_invalid_signature_fails_closed` | ▢ | tampered/expired package → verifier exits non-zero, agent refuses |
| `rollback_package_version_pinned` | ▢ | rollback target version ______ pinned, not "latest" |

## Rollback acceptance (D7 / INV-5)
- ▢ rollback disables the agent path
- ▢ controlled loyalty path yields `failed`/`unknown` — **no** automatic `window.print()`
- ▢ no browser print dialog on the loyalty surface

## Notes
- No self-update framework was built (NFR-7) unless the deployment explicitly required one: ______
- Sign-off: ______ · date ______
