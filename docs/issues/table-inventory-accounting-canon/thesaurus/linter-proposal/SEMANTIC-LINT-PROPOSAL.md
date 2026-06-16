patch_id: SRL-SEMANTIC-INTAKE-LINTER-DELTA-001
target_artifacts:
  - docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
  - docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-THESAURUS-ZACHMAN.yaml
  - docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
  - scripts/semantic/srl_intake_lint.py # new

verdict: add_programmatic_semantic_ambiguity_gate
status: proposed_delta
reason: >
  SRL admission currently depends on human review to catch ambiguous domain
  shorthand such as "drop telemetry", "drop input", or "drop absent".
  The predecessor artifact handles the core semantics correctly but still leaks
  unqualified drop shorthand in prose. SRL intake needs a deterministic
  preflight gate that catches predictable ambiguity before a term or thesaurus
  entry is admitted.

changes:
  - id: P1
    file: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
    section: "7. Enforcement Rules"
    action: add_rule_after_rule_7
    patch: |
      ### Rule 8 — Semantic ambiguity preflight

      Any artifact submitted for SRL admission MUST pass the semantic ambiguity
      preflight before it may be marked canonical.

      The preflight scans admitted terms, thesaurus entries, Zachman records,
      DTO boundary language, and legacy alias dispositions for ambiguous domain
      shorthand.

      Programmatic preflight is not the final semantic authority. It is a
      deterministic guardrail that catches known ambiguity patterns before human
      review.

      For the TIA exemplar, unqualified uses of `drop`, `drop telemetry`,
      `telemetry drop`, `drop input`, `drop source`, and `drop absent` are not
      acceptable in canonical prose when the intended meaning is
      `telemetry_derived_drop_estimate_cents`.

      Allowed uses must be one of:
      - a canonical identifier, such as `telemetry_derived_drop_estimate_cents`
      - a declared DTO key path, such as `source_authority.drop`
      - a reserved future term explicitly marked reserved or out of scope, such as
        `posted_drop_amount_cents` or `counted_drop_amount_cents`
      - a legacy alias disposition entry, where the alias is observed and mapped
        rather than admitted as canonical terminology

      A canonical SRL record must have zero hard-fail ambiguity findings.

  - id: P2
    file: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
    section: "10. Semantic Responsibility Record Shape"
    action: add_field
    patch: |
      semantic_ambiguity_preflight:
        status: pass | fail | waived
        scanner_version: <semantic linter version>
        findings_count: <number>
        hard_fail_count: <number>
        waiver_reason: <required only when status = waived>

  - id: P3
    file: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
    section: "New Section 11 — SRL Intake Preflight"
    action: append_after_section_10
    patch: |
      ## 11. SRL Intake Preflight

      Before an SRL extension artifact is admitted as canonical, it must pass
      three checks:

      1. **Owner binding check** — every admitted term binds to an SRM owner.
      2. **Record completeness check** — every admitted term declares the eight
         semantic responsibility fields and answers the six Zachman interrogatives.
      3. **Semantic ambiguity check** — known ambiguous shorthand is absent from
         canonical prose or appears only in an allowed context.

      ### 11.1 Hard-fail ambiguity examples

      For the TIA exemplar, the following phrases hard-fail when used as canonical
      prose:

      ```text
      drop telemetry
      telemetry drop
      drop input
      drop source
      drop absent
      drop estimate source
      estimated win/loss
      source_authority.inventory
      ```

      ### 11.2 Allowed context examples

      ```text
      telemetry_derived_drop_estimate_cents
      drop_estimate_state
      telemetry_drop_formula
      source_authority.drop
      posted_drop_amount_cents        # only when reserved/future/out-of-scope
      counted_drop_amount_cents       # only when reserved/future/out-of-scope
      final_reconciled_drop_amount_cents # only when reserved/out-of-scope
      ```

      ### 11.3 Acceptance rule

      ```yaml
      srl_intake_acceptance:
        pass:
          hard_fail_count: 0
          required_record_fields: complete
          zachman_interrogatives: complete
          srm_owner_binding: present
        warn:
          - shorthand appears only in quoted legacy alias disposition
          - shorthand appears in historical context
          - shorthand appears in an explicitly allowed DTO key path
        fail:
          - unqualified domain term appears in a semantic responsibility record
          - pseudo-term appears in a new capability/function name
          - prose uses "drop" where the intended meaning is telemetry_derived_drop_estimate_cents
      ```

  - id: P4
    file: docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-THESAURUS-ZACHMAN.yaml
    section: "global"
    action: replace_ambiguous_drop_shorthand
    patch: |
      replacements:
        - find: "different drop inputs"
          replace: "different uses of telemetry-derived estimate inputs, custody drop language, and win/loss-like inputs"

        - find: "rpc_shift_table_metrics as a drop source"
          replace: "rpc_shift_table_metrics as a source for telemetry_derived_drop_estimate_cents"

        - find: "Use rpc_shift_table_metrics as the telemetry drop source"
          replace: "Use rpc_shift_table_metrics as the source for telemetry_derived_drop_estimate_cents"

        - find: "without a drop estimate"
          replace: "without telemetry_derived_drop_estimate_cents"

        - find: "when drop is absent"
          replace: "when telemetry_derived_drop_estimate_cents is absent"

        - find: "inventory_only (drop absent, opener+closer resolvable)"
          replace: "inventory_only (telemetry_derived_drop_estimate_cents absent, opener+closer resolvable)"

        - find: "aggregate_session_telemetry_drop"
          replace: "aggregate_session_telemetry_derived_drop_estimate"

  - id: P5
    file: docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
    section: "global"
    action: replace_ambiguous_drop_shorthand
    patch: |
      replacements:
        - find: "drop telemetry is present"
          replace: "telemetry_derived_drop_estimate_cents is present"

        - find: "drop input"
          replace: "telemetry_derived_drop_estimate_cents input"

        - find: "drop estimate is available"
          replace: "telemetry_derived_drop_estimate_cents is available"

        - find: "not for drop"
          replace: "not for any telemetry-derived drop estimate or custody-authoritative drop amount"

        - find: "drop telemetry is absent"
          replace: "telemetry_derived_drop_estimate_cents is absent"

        - find: "no drop"
          replace: "no telemetry-derived drop estimate or custody-authoritative drop amount"

        - find: "drop proxy input"
          replace: "telemetry_derived_drop_estimate_cents input"

        - find: "telemetry-based drop proxy"
          replace: "telemetry-derived, non-custody estimate input"

  - id: P6
    file: docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
    section: "key_semantic_law"
    action: add_law
    patch: |
      - law: no_unqualified_drop_shorthand
        statement: >
          SRL-TIA-001 must not use unqualified "drop", "drop telemetry",
          "telemetry drop", "drop input", "drop source", or "drop absent"
          when referring to the canonical formula input. Use
          telemetry_derived_drop_estimate_cents, telemetry-derived drop estimate,
          or custody-authoritative drop amount, depending on the intended meaning.
        severity: hard

  - id: P7
    file: scripts/semantic/srl_intake_lint.py
    action: create
    patch: |
      purpose: >
        Add a deterministic semantic ambiguity scanner for SRL intake artifacts.

      behavior:
        - scan .md, .yaml, .yml files
        - report line number, phrase, severity, reason, suggested replacement
        - hard-fail on known ambiguous phrases unless allowlisted
        - distinguish canonical identifiers from prose where possible
        - output YAML or JSON findings
        - exit nonzero when hard_fail_count > 0

      initial_rule_set:
        hard_fail_phrases:
          - "drop telemetry"
          - "telemetry drop"
          - "drop input"
          - "drop source"
          - "drop absent"
          - "drop estimate source"
          - "Estimated Win/Loss"
          - "source_authority.inventory"

        warn_phrases:
          - "drop estimate"
          - "drop-like"
          - "drop proxy"
          - "unqualified Win/Loss"

        allowed_exact_terms:
          - "telemetry_derived_drop_estimate_cents"
          - "drop_estimate_state"
          - "telemetry_drop_formula"
          - "source_authority.drop"
          - "posted_drop_amount_cents"
          - "counted_drop_amount_cents"
          - "final_reconciled_drop_amount_cents"

        allowed_context_markers:
          - "legacy_alias_disposition"
          - "observed alias"
          - "reserved"
          - "future"
          - "out_of_scope"
          - "outside_exemplar_boundary"

      cli_examples:
        - "python scripts/semantic/srl_intake_lint.py docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml"
        - "python scripts/semantic/srl_intake_lint.py docs/issues/table-inventory-accounting-canon/thesaurus/*.yaml --format yaml"

  - id: P8
    file: docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
    section: "extension metadata"
    action: add_preflight_status
    patch: |
      semantic_ambiguity_preflight:
        status: pass
        scanner_version: srl_intake_lint.py@0.1.0
        findings_count: 0
        hard_fail_count: 0

  - id: P9
    file: docs/20-architecture/SRL-CHANGE-LOG.md
    action: append_entry
    patch: |
      v1.0.1 — 2026-05-29 — Semantic Ambiguity Intake Gate

      - Added semantic ambiguity preflight requirement for SRL admission.
      - Defined hard-fail ambiguity patterns for TIA drop semantics.
      - Required zero hard-fail findings before SRL extension artifacts may be marked canonical.
      - Added planned scanner: scripts/semantic/srl_intake_lint.py.
      - Patched TIA predecessor and SRL-TIA-001 wording to avoid unqualified drop shorthand.

acceptance:
  required:
    - SEMANTIC_RESPONSIBILITY_LAYER.md contains Rule 8 and Section 11 intake preflight.
    - TIA-CANON-THESAURUS-ZACHMAN.yaml contains no "drop telemetry", "telemetry drop", "drop input", "drop source", or "drop absent" prose except in legacy/quoted contexts.
    - SRL-TIA-001-table-inventory-accounting.yaml contains no ambiguous drop shorthand in canonical records.
    - SRL-TIA-001 has semantic_ambiguity_preflight.status = pass.
    - srl_intake_lint.py exists and exits nonzero on hard-fail phrase detection.
    - SRL-CHANGE-LOG.md records v1.0.1.

recommended_scanner_output_shape:
  findings:
    - file: <path>
      line: <line_number>
      phrase: <matched_phrase>
      severity: hard_fail | warn
      rule: <rule_id>
      reason: <why ambiguous>
      suggested_replacement: <replacement or null>
  summary:
    scanned_files: <n>
    findings_count: <n>
    hard_fail_count: <n>
    warn_count: <n>
    result: pass | fail

final_recommendation: >
  Add this intake preflight before admitting SRL-TIA-001 as canonical.
  Python is appropriate as a deterministic first-pass guardrail. It should not
  replace human semantic review, but it will catch repeatable ambiguity patterns
  like unqualified drop shorthand before they enter SRL canon.