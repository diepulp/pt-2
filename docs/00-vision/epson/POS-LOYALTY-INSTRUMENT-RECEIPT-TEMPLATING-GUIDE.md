# POS Loyalty Instrument Receipt Templating Guide

**Document type:** Implementation guidance / feature companion  
**Applies to:** Epson TM-T88V loyalty-instrument printing  
**Related artifacts:**  
- `FIB-H-POS-LOYALTY-INSTRUMENT-PRINTING-001.md`
- `FIB-S-POS-LOYALTY-INSTRUMENT-PRINTING-001.json`
- `FIB-ADDENDUM-POS-PRINT-OS-PORTABILITY-001.md`
- `FIB-S-POS-PRINT-OS-PORTABILITY-PATCH-001.json`

**Status:** Proposed guidance for RFC and PRD authoring  
**Scope:** Match play and other loyalty-instrument receipt templates  
**Primary constraint:** HTML/iframe rendering may be used for preview, but must not be the canonical physical-print payload.

---

## 1. Purpose

This guide defines how loyalty-instrument receipt templates should be represented, rendered, and delivered to an Epson TM-T88V printer.

The current application uses an iframe and `window.print()`. That mechanism is suitable for browser-controlled document printing, but it is not the preferred integration model for a POS thermal printer where the system requires deterministic control over:

- paper width;
- text sizing and alignment;
- barcodes or QR codes;
- feed distance;
- cutter behavior;
- printer status;
- paper-out and cover-open faults;
- retry and reprint behavior;
- auditability of physical-print attempts.

The replacement is not an iframe with a different print call.

The replacement is:

```text
application-owned receipt template
        ↓
canonical receipt document
        ↓
transport-specific renderer
        ↓
printer adapter
        ↓
Epson TM-T88V
```

The iframe may remain as an optional preview surface.

---

## 2. Core Architectural Boundary

The system must separate three concerns.

### 2.1 Instrument definition

The instrument definition represents what was issued and what it means.

Examples:

- instrument ID;
- instrument type;
- face value;
- redemption token;
- expiration date;
- eligibility or terms;
- issuing casino;
- issuance timestamp;
- reprint eligibility.

The print workflow must consume an already-issued instrument.

Printing must not generate or alter:

- redemption identity;
- value;
- expiration;
- issuance status;
- financial authority;
- redemption state.

### 2.2 Receipt template

The receipt template defines how the issued instrument is arranged for physical output.

Examples:

- title;
- text alignment;
- emphasized text;
- value placement;
- terms;
- barcode;
- expiration line;
- casino branding;
- footer;
- feed and cut instructions.

The template is application-owned and versioned.

### 2.3 Printer adapter

The printer adapter defines how the canonical receipt document reaches the physical printer.

Potential adapters include:

- Epson ePOS;
- ESC/POS;
- Windows spooler;
- Linux CUPS;
- a local print agent;
- a deterministic fake adapter for tests.

Printer-specific APIs must not leak into the instrument, service, route, hook, or UI layers.

---

## 3. Canonical Template Model

The system should define a transport-neutral receipt document.

```ts
export type ReceiptAlignment = 'left' | 'center' | 'right';

export type ReceiptBlock =
  | {
      type: 'text';
      value: string;
      align?: ReceiptAlignment;
      emphasis?: boolean;
      underline?: boolean;
      width?: 1 | 2;
      height?: 1 | 2;
    }
  | {
      type: 'divider';
      character?: string;
    }
  | {
      type: 'image';
      assetId: string;
      align?: ReceiptAlignment;
    }
  | {
      type: 'barcode';
      value: string;
      format: 'code128' | 'qr';
      humanReadable?: boolean;
    }
  | {
      type: 'feed';
      lines: number;
    }
  | {
      type: 'cut';
      mode: 'feed';
    };

export interface ReceiptDocument {
  templateId: string;
  templateVersion: number;
  instrumentId: string;
  blocks: ReadonlyArray<ReceiptBlock>;
}
```

This receipt document is the canonical physical-print intent.

It must remain:

- independent of Windows and Linux;
- independent of Epson ePOS and ESC/POS;
- independent of browser HTML;
- deterministic for the same template version and instrument input;
- suitable for serialization in logs or test snapshots.

---

## 4. Template Construction

Each instrument type should have an explicit template builder.

```ts
export function buildMatchPlayReceipt(
  instrument: MatchPlayInstrument,
  profile: CasinoReceiptProfile
): ReceiptDocument {
  return {
    templateId: 'match-play',
    templateVersion: 1,
    instrumentId: instrument.id,
    blocks: [
      ...(profile.receiptLogoAssetId
        ? [{
            type: 'image' as const,
            assetId: profile.receiptLogoAssetId,
            align: 'center' as const,
          }]
        : []),

      {
        type: 'text',
        value: 'MATCH PLAY',
        align: 'center',
        emphasis: true,
        width: 2,
        height: 2,
      },
      {
        type: 'text',
        value: formatCents(instrument.faceValueCents),
        align: 'center',
        emphasis: true,
        width: 2,
        height: 2,
      },
      {
        type: 'text',
        value: instrument.termsSummary,
        align: 'center',
      },
      {
        type: 'barcode',
        value: instrument.redemptionToken,
        format: 'code128',
        humanReadable: true,
      },
      {
        type: 'text',
        value: `Expires: ${formatGamingDate(instrument.expiresAt)}`,
        align: 'center',
      },
      {
        type: 'feed',
        lines: 3,
      },
      {
        type: 'cut',
        mode: 'feed',
      },
    ],
  };
}
```

Template builders must be pure.

They must not:

- perform network requests;
- mutate an instrument;
- generate a new token;
- issue a new instrument;
- check printer status;
- select an operating-system driver;
- invoke Epson APIs;
- invoke `window.print()`.

---

## 5. Template Storage and Versioning

For the pilot, templates should be stored as version-controlled code.

Recommended structure:

```text
services/loyalty-printing/
├── templates/
│   ├── match-play.v1.ts
│   ├── free-play.v1.ts
│   └── comp-voucher.v1.ts
├── receipt-document.ts
├── receipt-profile.ts
├── renderers/
│   ├── epos-renderer.ts
│   ├── escpos-renderer.ts
│   ├── fake-renderer.ts
│   └── html-preview-renderer.ts
├── printer-adapters/
│   ├── epos-printer-adapter.ts
│   ├── local-agent-printer-adapter.ts
│   └── fake-printer-adapter.ts
└── print-service.ts
```

A template version must be immutable after release.

If layout or semantics change:

```text
match-play.v1
        ↓
match-play.v2
```

Do not silently modify `v1`.

The print-attempt record should preserve:

- `template_id`;
- `template_version`;
- `instrument_id`;
- `printer_target_id`;
- request timestamp;
- result status;
- normalized fault, if any.

This allows the system to explain what was physically requested during a prior print or reprint.

---

## 6. Configuration Boundary

Database configuration should contain bounded casino-specific values, not arbitrary template source.

```ts
export interface CasinoReceiptProfile {
  casinoId: string;
  displayName: string;
  addressLines: string[];
  receiptLogoAssetId: string | null;
  footerText: string | null;
  printerTargetId: string;
}
```

Allowed configurable values:

- casino display name;
- address;
- logo selection;
- bounded footer text;
- printer target;
- optional support phone number;
- property-specific disclosure selected from an approved set.

Pilot exclusions:

- raw HTML editing;
- raw JavaScript editing;
- raw ePOS XML;
- raw ESC/POS byte commands;
- arbitrary CSS;
- arbitrary database-authored receipt layouts;
- runtime template scripting;
- user-authored barcode payloads.

An unrestricted template editor would create a separate authoring product and security boundary. It is not required for printer introduction.

---

## 7. Renderer Boundary

The canonical `ReceiptDocument` must be converted by a transport-specific renderer.

```ts
export interface ReceiptRenderer<TPayload> {
  render(document: ReceiptDocument): Promise<TPayload>;
}
```

Expected implementations:

```text
EposReceiptRenderer
    ReceiptDocument → Epson ePOS builder commands or XML

EscPosReceiptRenderer
    ReceiptDocument → ESC/POS bytes

HtmlPreviewRenderer
    ReceiptDocument → preview-only HTML

FakeReceiptRenderer
    ReceiptDocument → deterministic serialized snapshot
```

The renderer owns command translation.

It does not own:

- instrument issuance;
- retry authorization;
- printer target selection;
- audit persistence;
- operator permissions.

---

## 8. Epson Rendering Guidance

For match plays and loyalty instruments, standard line mode should be the default.

Standard mode is appropriate when:

- receipt length varies;
- content flows vertically;
- text and barcode sections are sequential;
- precise absolute positioning is unnecessary.

Page mode should be considered only when the instrument requires rigid coupon-style placement.

A conceptual ePOS renderer may translate canonical blocks as follows:

```ts
function renderToEpos(document: ReceiptDocument): EposPayload {
  const builder = new epson.ePOSBuilder();

  for (const block of document.blocks) {
    switch (block.type) {
      case 'text':
        builder.addTextAlign(toEposAlign(block.align));
        builder.addTextStyle(
          false,
          block.underline ?? false,
          block.emphasis ?? false
        );
        builder.addTextSize(block.width ?? 1, block.height ?? 1);
        builder.addText(`${block.value}\n`);
        break;

      case 'barcode':
        builder.addBarcode(
          block.value,
          builder.BARCODE_CODE128,
          block.humanReadable ? builder.HRI_BELOW : builder.HRI_NONE,
          builder.FONT_A,
          2,
          60
        );
        break;

      case 'feed':
        builder.addFeedLine(block.lines);
        break;

      case 'cut':
        builder.addCut(builder.CUT_FEED);
        break;

      default:
        assertNever(block);
    }
  }

  return builder.toString();
}
```

This code is illustrative. Exact Epson APIs and supported operations must be verified against the selected transport and installed printer interface during RFC and implementation.

---

## 9. Iframe and HTML Posture

The iframe is not forbidden.

Its role changes.

### Permitted

```text
ReceiptDocument
        ↓
HtmlPreviewRenderer
        ↓
iframe preview
```

Use cases:

- operator preview;
- support diagnostics;
- template review during development;
- visual regression review.

### Forbidden

```text
HTML template
        ↓
iframe
        ↓
window.print()
        ↓
canonical production print
```

The iframe must not be the production source of truth because browser rendering may introduce:

- scaling;
- hidden margins;
- page breaks;
- font substitution;
- platform differences;
- print-dialog dependencies;
- inconsistent cut and feed behavior.

The HTML preview should be described as approximate unless physical-output parity has been explicitly certified.

---

## 10. Logo and Asset Handling

Two asset strategies are possible.

### 10.1 Application-sent raster image

The application preprocesses the logo into a printer-safe monochrome raster representation and includes it in each print job.

Advantages:

- version controlled;
- no per-printer asset synchronization;
- deterministic across printer replacements;
- simpler pilot deployment.

Trade-offs:

- larger payload;
- repeated transfer;
- image rendering cost.

### 10.2 Printer NV-memory asset

The logo is registered in printer nonvolatile memory and referenced by key.

Advantages:

- smaller print payload;
- faster repeat printing.

Trade-offs:

- printer provisioning required;
- asset-version drift;
- replacement-printer setup;
- deployment verification needed;
- application must know which asset version exists.

Pilot recommendation:

> Use application-managed raster assets unless physical testing proves that payload size or print latency requires NV-memory registration.

---

## 11. Print Service Boundary

The print service coordinates template construction, rendering, transport, and print-attempt persistence.

```ts
export interface LoyaltyInstrumentPrintService {
  printInstrument(
    request: PrintInstrumentRequest
  ): Promise<PrintInstrumentResult>;
}
```

Conceptual flow:

```text
1. Load already-issued instrument.
2. Verify operator may print or reprint it.
3. Select template ID and frozen version.
4. Load casino receipt profile.
5. Build canonical ReceiptDocument.
6. Persist print attempt as requested.
7. Render through selected renderer.
8. Send through printer adapter.
9. Normalize transport result.
10. Persist final or uncertain print status.
```

A print failure must not create a new instrument.

A retry must refer to the same instrument and an explicit print-attempt lineage.

---

## 12. Result and Fault Vocabulary

Platform-native errors must be normalized.

```ts
export type PrintResultStatus =
  | 'submitted'
  | 'acknowledged'
  | 'failed'
  | 'unknown';

export type PrinterFault =
  | 'printer_unreachable'
  | 'paper_out'
  | 'cover_open'
  | 'offline'
  | 'transport_unavailable'
  | 'driver_error'
  | 'invalid_document'
  | 'unsupported_operation';
```

Windows, Linux, ePOS, ESC/POS, and local-agent errors must not escape directly into application contracts.

The `unknown` state is load-bearing.

It represents cases where the system cannot prove whether the printer physically produced the instrument.

The UI must not automatically issue another instrument in response.

---

## 13. Testing Requirements

Each template requires three levels of proof.

### 13.1 Semantic snapshot

Verify that the canonical document contains the correct:

- instrument ID;
- template ID;
- template version;
- value;
- expiration;
- terms;
- redemption token;
- casino profile;
- footer;
- feed and cut blocks.

### 13.2 Renderer contract test

Verify the adapter translation contains the expected:

- alignment commands;
- emphasized text;
- text scaling;
- barcode format;
- human-readable barcode text posture;
- feed;
- cut;
- image operation.

The same canonical document should pass through:

- fake renderer;
- HTML preview renderer;
- selected production renderer.

### 13.3 Physical printer proof

Certify on the actual TM-T88V and intended production topology:

- correct paper width;
- no clipping;
- no unexpected margins;
- readable smallest text;
- correct emphasis;
- logo contrast;
- barcode scan success;
- expected feed distance;
- expected cut;
- paper-out behavior;
- cover-open behavior;
- disconnect and reconnect behavior;
- uncertain-result handling;
- controlled reprint behavior.

Physical proof must occur on the intended Windows deployment host if the pilot adapter uses Windows-specific transport.

Linux development tests do not substitute for Windows production certification.

---

## 14. Acceptance Gates

```yaml
receipt_templating_gates:
  - id: TEMPLATE-1
    requirement: >
      Each loyalty instrument print path builds a canonical ReceiptDocument
      from an already-issued instrument.

  - id: TEMPLATE-2
    requirement: >
      No React component, hook, route, or domain service directly invokes
      Epson, ESC/POS, Windows spooler, Linux CUPS, or window.print APIs.

  - id: TEMPLATE-3
    requirement: >
      HTML and iframe output are preview-only and are not the canonical
      production print payload.

  - id: TEMPLATE-4
    requirement: >
      Template ID and immutable template version are recorded on each
      print attempt.

  - id: TEMPLATE-5
    requirement: >
      Dynamic values are sourced from the existing issued instrument and
      are not generated by the template layer.

  - id: TEMPLATE-6
    requirement: >
      A shared renderer contract suite passes for the fake renderer and
      the selected production renderer.

  - id: TEMPLATE-7
    requirement: >
      The physical TM-T88V output passes readability, clipping, barcode,
      feed, cut, and fault-handling tests on the intended deployment host.

  - id: TEMPLATE-8
    requirement: >
      Failed or uncertain print outcomes do not create a replacement
      instrument automatically.
```

---

## 15. Explicit Non-Goals

This guide does not authorize:

- a generic document-layout engine;
- WYSIWYG template editing;
- arbitrary HTML receipt authoring;
- arbitrary ESC/POS command injection;
- multi-vendor printer support;
- automatic reissuance after print failure;
- Windows and Linux physical-printer adapters in the same pilot;
- remote cloud printing without a selected and reviewed transport;
- replacement of the loyalty-instrument issuance model;
- redemption workflow redesign.

---

## 16. Recommended RFC Questions

The RFC should resolve:

1. Which interface board and connection topology are installed on the target TM-T88V?
2. Does the production unit expose Epson ePOS Print Service?
3. Is the production path direct browser-to-printer, browser-to-local-agent, or server-to-agent?
4. Which adapter is certified for the Windows deployment host?
5. Which exact paper width and printable character width are canonical?
6. Is Code 128 sufficient, or is QR required for any instrument?
7. How is printer identity mapped to casino and workstation?
8. How are `submitted`, `acknowledged`, `failed`, and `unknown` distinguished?
9. What constitutes an authorized reprint?
10. Are logos sent as raster images or provisioned in printer NV memory?
11. Is iframe preview retained, removed, or limited to support/admin contexts?
12. What physical proof evidence is required before pilot acceptance?

---

## 17. Canonical Direction

The system should treat receipts as application-owned structured documents, not browser pages.

```text
Instrument record
      ↓
Versioned template builder
      ↓
ReceiptDocument
      ├── HTML preview renderer
      ├── fake test renderer
      └── Epson/ESC-POS production renderer
                 ↓
           printer adapter
                 ↓
             TM-T88V
```

The governing rule is:

> Loyalty-instrument templates are application-owned, versioned receipt-document definitions. They are rendered into transport-specific printer commands at the adapter boundary. HTML and iframe rendering may provide an operator preview but must not serve as the canonical physical-print payload.
