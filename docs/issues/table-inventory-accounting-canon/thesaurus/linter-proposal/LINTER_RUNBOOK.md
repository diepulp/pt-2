Patch the linter proposal first, then use that rule-set to patch the docs.

Not code-first necessarily — policy-first, then document repair.

Recommended sequence:

sequence:
  1: Patch SRL root with Rule 8 + Section 11
  2: Define the linter rule-set in prose/YAML
  3: Mark SRL-TIA-001 as pending semantic ambiguity preflight, not pass
  4: Run/apply the linter logic manually or with Python
  5: Patch SRL-TIA-001 and Zachman predecessor findings
  6: Only then set semantic_ambiguity_preflight.status: pass

Why: if you patch the doc first, you are still relying on vibes and another human audit. The whole point is to create an intake mechanism so the patch is not just “Vladimir noticed another cursed drop phrase at line 93.”

So the first patch should not claim the linter passed yet.

Use this instead:

semantic_ambiguity_preflight:
  status: pending
  scanner_version: srl_intake_lint.py@0.1.0
  findings_count: null
  hard_fail_count: null

Then after the doc is patched and scanned:

semantic_ambiguity_preflight:
  status: pass
  scanner_version: srl_intake_lint.py@0.1.0
  findings_count: 0
  hard_fail_count: 0
Practical order
Step 1 — Admit the gate

Patch SEMANTIC_RESPONSIBILITY_LAYER.md:

add:
  - Rule 8 — Semantic ambiguity preflight
  - Section 11 — SRL Intake Preflight
  - semantic_ambiguity_preflight field in record shape

This makes the gate legitimate.

Step 2 — Add scanner spec or script

Either create:

scripts/semantic/srl_intake_lint.py

or, before implementation, create a rule-set artifact:

docs/20-architecture/SRL-INTAKE-LINTER-RULES.yaml

For now I’d prefer the rule-set artifact first if you do not want to build code immediately. Then Python can implement the rule-set.

Step 3 — Patch SRL-TIA-001 to pending

Do not write status: pass until after scan/patch.

semantic_ambiguity_preflight:
  status: pending
  scanner_version: srl_intake_lint.py@0.1.0
  findings_count: null
  hard_fail_count: null
Step 4 — Run the linter or simulate it

Expected first output should include findings like:

findings:
  - phrase: drop telemetry
  - phrase: drop input
  - phrase: drop absent
  - phrase: drop proxy
Step 5 — Patch the docs

Patch the ambiguous wording using canonical replacements:

replace:
  "drop telemetry": "telemetry_derived_drop_estimate_cents"
  "drop input": "telemetry_derived_drop_estimate_cents input"
  "drop absent": "telemetry_derived_drop_estimate_cents absent"
  "drop proxy": "telemetry-derived, non-custody estimate input"
Step 6 — Re-run and mark pass

Only after zero hard-fail findings:

semantic_ambiguity_preflight:
  status: pass
  scanner_version: srl_intake_lint.py@0.1.0
  findings_count: 0
  hard_fail_count: 0