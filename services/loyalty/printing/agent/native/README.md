# `winspool-print-helper` — RAW ESC/POS winspool helper (PRD-093 WS_W2)

The native half of the Windows RAW print path (DEC-WIN-01). The Node agent spawns
this signed executable by its **absolute, install-rooted path** and pipes the
complete RAW ESC/POS byte payload to its **stdin**; the helper performs the Win32
`OpenPrinter → StartDocPrinter(pDatatype="RAW") → WritePrinter → …` sequence and
returns a single JSON result on **stdout**. See `../windows-spooler-native.ts` for
the TS facade and the framing/timeout/error-mapping contract.

This is **delivered code**, not a certification-time stub. Gate W-A is the manual
*execution* of this built binary on a real Windows host + TM-T88V — not its creation.

## I/O contract

| Channel | Content |
|---------|---------|
| `argv`  | `--queue "<printer/queue name>"` (required) |
| `stdin` | the complete RAW ESC/POS payload, read to EOF (binary) |
| `stdout`| exactly one newline-terminated JSON object: `{"outcome":"accepted","jobId":"…"}` or `{"outcome":"rejected","reason":"…"}` |
| `stderr`| agent-local diagnostics only (Win32 `GetLastError`, queue name) — never enters the canonical contract (INV-4) |
| exit    | `0` accepted, non-zero rejected |

`reason` is a sanitized class string: `missing_queue` · `empty_payload` ·
`open_failed` · `start_doc_failed` · `start_page_failed` · `partial_write`.

## Build

Requires Visual Studio Build Tools 2022 (MSVC v143) + the Windows SDK. Produces a
static-CRT (`/MT`) x64 console exe with **no** VC++ redistributable dependency.

```bat
:: From this directory, in a "x64 Native Tools Command Prompt for VS 2022":
msbuild winspool-print-helper.vcxproj /p:Configuration=Release /p:Platform=x64
:: Output: bin\x64\Release\winspool-print-helper.exe

:: Dev one-liner (equivalent):
cl /MT /O2 /EHsc /std:c++17 winspool-print-helper.cpp /link winspool.lib /OUT:winspool-print-helper.exe
```

The built `winspool-print-helper.exe` is Authenticode-signed and bundled into the
release package; its SHA-256 is pinned in the package `manifest.json` and verified
fail-closed at provisioning (DEC-WIN-04). The agent refuses to spawn a helper whose
on-disk hash does not match the pinned manifest hash.

> Cross-compilation note: this target builds on a Windows host / Windows CI runner.
> The Linux build pipeline ships the **source + project** and verifies the TS facade;
> the `.exe` is produced and signed on the Windows certification host (Gate W-A/W-B).
