# Epson TM-T88V (M244A) — Native Capability Reference for Transport & Status Design

**Status:** Reference (sourced from Epson official documentation)
**Date:** 2026-06-18
**Scope:** Grounds the POS Loyalty Instrument Printing transport decision (FIB-H/FIB-S-POS-PRINT-001) and the OS-portability addendum's normalized result/fault contract. Hardware-capability facts only — no architecture choice.
**Method:** Extracted from Epson's official PDFs (`files.support.epson.com`) and ESC/POS / ePOS SDK technical references (`download4.epson.biz`). context7 MCP was checked and carries **no** Epson printer/SDK library, so the native vendor documents below are the authoritative source.

> **Why this doc exists:** the feature's central open decision (transport mechanism, blocked on GATE-HW-1) and the truthfulness of `result_status` / `PrinterFault` depend on *what the printer can actually observe and report over a given transport*. This captures those native capabilities with citations.

---

## 1. Model & media

| Fact | Value | Source |
|---|---|---|
| Marketing model | Epson TM-T88V | TM-T88V TRG |
| Hardware model marking | **M244A** | EPSON-TM-T88V-PRINTER-SETUP.md (device label), TM-T88V TRG |
| Paper width | **80 mm** default; 58 mm via guide | TM-T88V TRG (§Changing the Paper Width) |
| Autocutter | Present (partial/full cut via `GS V`) | TM-T88V TRG (§Cutter cover / autocutter) |
| Cash drawer | Drawer-kick connector (`ESC p`) | TM-T88V TRG (§Connecting the Cash Drawer / Controlling the Cash Drawer) |

## 2. Interfaces — ePOS is NOT inherent to the base printer

The TM-T88V ships with a **built-in USB interface** plus **one UIB slot** for an Epson UB-series interface board (Serial, Parallel, Ethernet, Wireless LAN). The interface board fitted determines connectivity — and crucially, whether **web-direct (ePOS-Print) printing** is possible.

| Interface | What it is | ePOS-Print Service? |
|---|---|---|
| **UB-U05** (installed on dev unit) | USB interface (USB ID `04b8:0202`) | **No** — USB only; no on-printer web service |
| UB-E04 | "Connect-It" Ethernet interface board | **Yes** — provides ePOS-Print Service for web/cloud/mobile apps |
| TM-T88V-**i** (intelligent variant) | Separate model with embedded web server | **Yes** — hosts ePOS-Print Service natively |

> Source: TM-T88V TRG (§Interface boards / Built-in USB), UB-E04 TRG, TM-T88V-i User's Manual, ePOS-Print API UM line 128 ("'ePOS-Print supported printer' is a generic term for the TM-i series and TM printers that support ePOS-Print Service").

**Implication for this feature:** the inventoried dev unit (UB-U05 USB) **cannot** do ePOS-direct printing. Enabling Option B (ePOS-direct) requires physically changing the interface to **UB-E04** (or deploying a TM-T88V-i). This is a concrete input to **GATE-HW-1** (inventory the *production* unit's interface) and to the transport decision.

## 3. ePOS-Print (Option B) — what it can truthfully report

ePOS-Print is an HTTP transport: the host POSTs an XML print document to the printer's ePOS-Print Service and receives a structured response.

- **Endpoint:** `http://[printer]/cgi-bin/epos/service.cgi?devid=[device ID]&timeout=[ms]` (ePOS-Print API UM line 1811).
- **Response object:** `{ success: boolean, code: string, status: number }` — `status` is an **ASB (Automatic Status Back) bitfield** (ePOS-Print API UM, `onreceive` handler, lines 1872–1948).
- **Timing (decisive):** *"A printing job will be executed immediately and a response will be returned to the application **after printing**."* (UM line 2335). Because the response is returned **after** the physical print, ePOS-Print can report **device-observed** outcome, not just request acceptance.
- **Timeout:** default 60 000 ms (API) / 300 000 ms (service); on elapse the job is canceled (UM lines 1515, 1819–1820). Maps to an **unknown** outcome.

### ASB status constants → normalized `PrinterFault` mapping

The addendum's `PrinterFault` vocabulary maps almost 1:1 onto ePOS ASB constants (ePOS-Print API UM lines 1903–1948):

| ePOS ASB constant | Condition | Normalized `PrinterFault` |
|---|---|---|
| `ASB_PRINT_SUCCESS` | Print physically succeeded | success → pilot contract records `submitted` (no completion claim) |
| `ASB_NO_RESPONSE` | No response from device | `unknown_device_error` / result `unknown` |
| `ASB_OFF_LINE` | Printer offline | `offline` |
| `ASB_COVER_OPEN` | Cover is open | `cover_open` |
| `ASB_RECEIPT_END` | Roll paper end detector: no paper | `paper_out` |
| `ASB_RECEIPT_NEAR_END` | Near-end detector: low paper | (`paper_out` precursor / warn) |
| `ASB_MECHANICAL_ERR` | Mechanical error | `driver_error` |
| `ASB_AUTOCUTTER_ERR` | Autocutter error | `driver_error` |
| `ASB_UNRECOVER_ERR` | Unrecoverable error | `driver_error` |
| `ASB_AUTORECOVER_ERR` | Auto-recoverable error | `driver_error` (transient) |
| (transport/connect fails) | host cannot reach service | `printer_unreachable` / `transport_unavailable` |

## 4. ESC/POS real-time status (Option A local agent) — what it can truthfully report

The base TM-T88V's native command set is **ESC/POS**. A local agent driving the printer can read device status **only over a bidirectional channel** (it must read bytes back from the printer):

- **`DLE EOT n`** — real-time status transmission. `n` selects: printer status, offline-cause status, error status, or roll-paper-sensor status (paper end / near-end). (ESC/POS ref: `realtime_commands.html`, `receiving_status.html`.)
- **ASB (Automatic Status Back)** — the printer pushes status unsolicited on change (cover open/close, paper end/near-end, offline, recoverable error). Same condition set as the ePOS ASB constants above.
- **Bidirectional requirement:** `DLE EOT` / ASB require the host to **read** from the printer. Over a **one-way / print-only** channel they return nothing.

> Source: Epson ESC/POS Command Reference — *Notes of Real-time Commands*, *Notes of receiving the status from the printer*, `DLE EOT`. (Pages on `download4.epson.biz` 403 to automated fetch; facts corroborated by the TM-T88V TRG status section and the ePOS ASB constant set, which share the same condition vocabulary.)

### The CUPS-raster caveat (current dev rig)

The working Linux setup (`EPSON-TM-T88V-PRINTER-SETUP.md`) uses the community **raster driver** (`rastertotmt88v`) over a **one-way** CUPS print queue. That path:

- **Can** observe: spooler-level *job accepted / job completed* → maps to normalized **`submitted`** (NOT `acknowledged`/`completed`).
- **Cannot** observe: paper_out, cover_open, offline, cutter error — the raster driver does not read device status back.

To populate the `PrinterFault` vocabulary truthfully on the local-agent path, the agent must open a **bidirectional raw ESC/POS channel** (read `DLE EOT` / ASB), not the raster queue. Otherwise faults are unknowable and only `submitted | unknown | failed(at submit)` are honest.

## 5. Per-transport truthful-status capability (design input)

> The last two columns separate hardware *capability* from the *pilot contract*. The pilot contract caps every success at `submitted`; capability only governs whether `fault` can be populated.

| Transport | Submission proof | Device completion observable? | Fault detail observable? | Pilot contract result |
|---|---|---|---|---|
| **ePOS-direct (UB-E04 / TM-i)** | ✅ HTTP response | ✅ ASB after print (line 2335) | ✅ full ASB set | `submitted` (+ `fault`) |
| **Local agent + bidirectional ESC/POS (USB raw)** | ✅ write accepted | ⚠️ via `DLE EOT`/ASB polling | ✅ full ASB set | `submitted` (+ `fault`) |
| **Local agent over current CUPS raster (one-way)** | ✅ spooler accepted | ❌ | ❌ | `submitted` (`fault` null) |
| **`window.print()` (status quo, being retired on this surface)** | ❌ dialog only | ❌ | ❌ | none (why FIB retires it here) |

**Takeaways for the RFC / GATE-HW-1:**
1. ePOS-direct is the richest *fault-fidelity* path **but is hardware-gated** on a UB-E04 / TM-i interface the installed unit lacks.
2. The local-agent path's *fault ceiling* depends on whether the agent uses a bidirectional ESC/POS channel (full faults) or the existing one-way raster queue (no observable faults).
3. **The table above states hardware *capability*, not the chosen contract.** The PT-2 pilot contract is fixed at four states (`requested|submitted|failed|unknown`) and **deliberately caps every successful observable outcome at `submitted`** — it never asserts `acknowledged`/`completed`, even on ePOS where the device could observe completion. A transport's richer observability therefore changes only **fault fidelity** (whether `fault` can be populated), never the success state. This is the conservative reading of the FIB-S "add only what the transport can truthfully observe" rule (RFC-POS-LOYALTY-PRINT §3, §5).

---

## 5a. Canonical `ReceiptDocument` → renderer mapping (validated)

The templating guide's transport-neutral `ReceiptDocument` block types map 1:1 onto real printer commands on **both** candidate transports — confirmed against the official ePOS-Print Builder API (native manual) and a current community ESC/POS library (context7 `/klemen1337/node-thermal-printer`):

| `ReceiptDocument` block | Official ePOS `ePOSBuilder` (native manual) | ESC/POS local agent (context7 node-thermal-printer) |
|---|---|---|
| `text` (align/emphasis/size) | `addTextAlign` / `addTextStyle` / `addTextSize` / `addTextFont` / `addText` | `alignLeft\|Center\|Right` / `setTextSize` / `setTypeFontA\|B` / bold |
| `barcode` (code128) | `addBarcode(…, BARCODE_CODE128, HRI_BELOW, FONT_A, …)` | `code128(data, {width,height,text})` |
| `barcode` (qr) | `addSymbol(…)` (2D symbol) | `printQR(data, {cellSize,correction,model})` |
| `image` (logo) | `addImage(context,…, COLOR_1)` | `printImage(path)` |
| `feed` | `addFeedLine` / `addFeed` / `addFeedUnit` | `newLine()` / feed |
| `cut` | `addCut(CUT_FEED)` | `cut()` / `partialCut()` |

**Source note:** context7 carries **no** official Epson web SDK; it surfaced community wrappers — `/klemen1337/node-thermal-printer` (Node ESC/POS, relevant prior art for the **local-agent** path) and `/tr3v3r/react-native-esc-pos-printer` (RN wrapper of the Epson ePOS SDK). The official `epson.ePOSBuilder()` web API comes from the native ePOS-Print API manual (§3 above). The node library's default `tcp://…:9100` raw socket is **one-way** — reinforcing §4–§5: rich faults require bidirectional ESC/POS (`DLE EOT`) or ePOS, not a raw print socket.

## 6. Sources (Epson official)

- TM-T88V Technical Reference Guide (Rev F) — https://files.support.epson.com/pdf/pos/bulk/tm-t88v_trg_en_revf.pdf
- TM-T88V Hardware User's Manual — https://files.support.epson.com/pdf/pos/bulk/tm-t88v_hwum_en_02.pdf
- TM-T88V-i User's Manual — https://files.support.epson.com/pdf/pos/bulk/tm-t88v-i_um_en_00.pdf
- UB-E04 Technical Reference Guide — https://files.support.epson.com/pdf/ube04_/ube04_trg.pdf
- ePOS-Print API User's Manual (Rev K) — https://files.support.epson.com/pdf/pos/bulk/tm-i_epos-print_um_en_revk.pdf
- ESC/POS Command Reference (real-time status / `DLE EOT` / receiving status) — https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/
- ePOS SDK `getStatus` reference — https://download4.epson.biz/sec_pubs/pos/reference_en/epos_and/ref_epos_sdk_and_en_printerclass_getstatus.html
