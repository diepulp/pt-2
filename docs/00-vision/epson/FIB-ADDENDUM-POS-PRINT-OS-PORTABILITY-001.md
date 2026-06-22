# FIB Addendum — POS Printer OS-Portability Boundary

**Addendum ID:** FIB-ADD-POS-PRINT-OS-001  
**Amends:** FIB-H-POS-PRINT-001 and FIB-S-POS-PRINT-001  
**Date:** 2026-06-18  
**Status:** Proposed — fold into FIBs before freeze  
**Change class:** Scope clarification; no new operator outcome and no transport selection

## 1. Reason for amendment

The original intake correctly defers selection among Epson ePOS, an OS-driver path, and a managed local print agent until the installed TM-T88V interface is inventoried. It does not, however, explicitly separate:

1. the operating-system-neutral contract used by the web application; and
2. the potentially operating-system-specific adapter that communicates with the printer.

Development occurs on Linux while the likely pilot deployment host is Windows. Without an explicit boundary, downstream design could either couple application code to Windows printer APIs or over-expand the pilot by implementing and certifying both Linux and Windows physical printer adapters.

## 2. Binding portability invariant

> OS portability applies to the application-facing print contract, instrument layout model, normalized status vocabulary, and print-attempt audit semantics. It does not require every physical printer transport adapter to be operating-system independent or implemented during the pilot.

The application must not depend directly on:

- Windows Print Spooler APIs;
- Linux CUPS APIs;
- Epson OPOS, JavaPOS, or platform driver objects;
- USB device paths;
- platform-specific printer queue names or error codes.

Any such dependency must remain inside the selected printer transport adapter.

## 3. Pilot deployment posture

The pilot may certify one production adapter for the intended Windows deployment environment.

Linux development support is satisfied through:

- a deterministic fake printer transport;
- contract tests for the application-facing interface;
- receipt-layout snapshot or rendering tests;
- print-attempt state and retry/reprint tests;
- optional real-device testing only when the selected network transport is reachable from Linux.

A Linux physical-printer adapter is not required unless Linux becomes a supported production workstation environment.

## 4. Required application boundary

Downstream artifacts must define one stable application-facing contract whose semantics do not vary by operating system. The exact shape is RFC-owned, but it must cover at least:

```ts
interface LoyaltyInstrumentPrinter {
  getStatus(target: PrinterTarget): Promise<PrinterStatus>
  print(request: PrintInstrumentRequest): Promise<PrintResult>
  testPrint(target: PrinterTarget): Promise<PrintResult>
}
```

The contract must expose normalized domain-facing outcomes rather than raw platform errors.

Minimum normalized result posture:

```ts
type PrintResultStatus =
  | 'requested'
  | 'submitted'
  | 'failed'
  | 'unknown'
```

Transport-specific acknowledgement or completion states may be added only when the selected adapter can truthfully observe them.

Minimum normalized fault vocabulary:

```ts
type PrinterFault =
  | 'printer_unreachable'
  | 'paper_out'
  | 'cover_open'
  | 'offline'
  | 'transport_unavailable'
  | 'driver_error'
  | 'unknown_device_error'
```

## 5. Transport implications

### Epson ePOS path

When the installed printer/interface exposes a supported ePOS Print Service, the same browser/network integration may operate from Linux and Windows without workstation printer drivers. This is the preferred OS-neutral physical transport only if the hardware inventory proves support.

### Local-agent or driver path

When the printer requires USB, an OS driver, a spooler, or raw ESC/POS access, the application contract remains portable while the adapter is platform-specific.

A managed local agent may therefore contain:

```text
shared agent core
├── request validation
├── print-attempt correlation
├── duplicate/reprint controls
├── layout-to-command rendering
├── normalized status mapping
└── platform adapter
    ├── windows spooler / Epson driver   ← pilot candidate
    └── linux CUPS / Epson driver        ← deferred unless production requires it
```

This addendum does not authorize building a cross-platform agent framework. Only the adapter required by the selected pilot topology may be implemented.

## 6. Amendments to FIB-H-POS-PRINT-001

### Add to §F — Required outcomes

- The application-facing print contract, layout model, status vocabulary, and print-attempt semantics are operating-system neutral.
- Platform-native printer APIs and errors are confined to the selected transport adapter and normalized before crossing into application code.
- Linux development can exercise the complete application behavior through a deterministic fake adapter without requiring a Linux physical-printer implementation.
- Real-device acceptance is performed on the intended production operating system and printer topology.

### Add to §G — Explicit exclusions

- No requirement to implement both Windows and Linux physical printer adapters during the pilot.
- No platform-specific spooler, driver, OPOS, JavaPOS, CUPS, USB, or queue logic in domain, service, route, hook, or UI code outside the transport adapter.
- No generic cross-platform local-agent framework beyond the one production adapter selected for the pilot.
- No claim that Linux development-host compatibility constitutes Windows production certification.

### Add to §I — Dependencies and assumptions

- The likely pilot workstation operating system is Windows; this must be confirmed before adapter certification.
- Linux is the development environment, not automatically a supported production printer host.
- The selected transport must provide a fake or test-double implementation that conforms to the same application-facing contract as the production adapter.
- Physical-printer certification must occur against the actual Windows host, installed interface, driver/service, browser, and network or USB topology intended for deployment.

### Add to §K — Expansion trigger rule

Amend the FIB before introducing:

- Linux as a supported physical-printer production host;
- a second operating-system-specific physical adapter;
- a generic cross-platform printer-agent distribution or update framework;
- operating-system-specific behavior visible in the application contract.

## 7. Amendments to FIB-S-POS-PRINT-001

Add the following machine-readable blocks:

```json
{
  "platform_boundary": {
    "application_contract": "os_agnostic",
    "layout_contract": "os_agnostic",
    "status_and_audit_contract": "os_agnostic",
    "physical_transport_adapter": "may_be_os_specific",
    "development_environment": "linux",
    "likely_pilot_production_environment": "windows_requires_confirmation",
    "pilot_adapter_policy": "implement_and_certify_only_the_adapter_required_by_the_selected_production_topology",
    "linux_physical_adapter_required": false,
    "forbidden_leakage": [
      "windows_spooler_types_outside_adapter",
      "cups_types_outside_adapter",
      "opos_or_javapos_objects_outside_adapter",
      "raw_platform_error_codes_at_application_boundary",
      "platform_queue_names_as_domain_identifiers"
    ]
  },
  "development_validation": {
    "linux_required": [
      "fake_transport",
      "application_contract_tests",
      "layout_snapshot_or_render_tests",
      "print_attempt_state_tests",
      "retry_and_reprint_tests",
      "normalized_fault_mapping_tests"
    ],
    "linux_real_device_required": false,
    "production_certification": {
      "target_os": "windows_pending_deployment_confirmation",
      "requires_actual_host": true,
      "requires_actual_printer_interface": true,
      "requires_actual_driver_or_epos_service": true
    }
  }
}
```

## 8. Additional acceptance gates

```yaml
acceptance_gates:
  - id: GATE-PLATFORM-1
    name: application_contract_os_neutrality
    blocking: true
    evidence:
      - no Windows, Linux, CUPS, spooler, OPOS, JavaPOS, USB, or queue-specific types outside the transport adapter
      - application contract suite runs without a physical printer

  - id: GATE-PLATFORM-2
    name: adapter_contract_parity
    blocking: true
    evidence:
      - fake adapter and selected production adapter pass the same contract tests
      - both return the canonical result and fault vocabulary

  - id: GATE-PLATFORM-3
    name: windows_real_device_certification
    blocking: true
    applies_when: Windows is confirmed as the pilot deployment host
    evidence:
      - first print on intended Windows host
      - printer offline behavior
      - paper-out and cover-open behavior when observable
      - cut and layout validation
      - failed and unknown result handling
      - deliberate reprint behavior

  - id: GATE-PLATFORM-4
    name: no_cross_platform_overbuild
    blocking: true
    evidence:
      - only the selected production adapter is implemented
      - Linux physical adapter remains absent unless separately authorized
```

## 9. Downstream instruction

The RFC must select the printer transport only after `GATE-HW-1` confirms the installed interface. It must then:

1. preserve the OS-neutral application contract;
2. identify the one pilot production adapter;
3. define the fake adapter used on Linux;
4. define normalized status/error mapping;
5. identify the Windows real-device certification environment; and
6. prohibit a second physical adapter unless this FIB is amended.

## 10. Effect on existing scope

This addendum does not:

- choose Epson ePOS over a local agent;
- mandate a local agent;
- add a new operator workflow;
- add a second supported operating system;
- authorize a generic printer platform;
- weaken the hardware-interface discovery gate.

It closes only the portability ambiguity created by Linux development and likely Windows production deployment.
