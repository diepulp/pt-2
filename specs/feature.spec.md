Title: <Feature Name>
Objective: >
  Concise description of the user/business outcome.
Scope:
  in:
    - item 1
  out:
    - item A
NonFunctional:
  performance: "Budgeted p95 latency, throughput expectations."
  security: "RLS/RBAC or auth considerations tied to SEC docs."
  observability: "Metrics/logs/traces required."
  accessibility: "WCAG targets if UI surfaces change."
AcceptanceCriteria:
  - "[ ] Given/When/Then …"
  - "[ ] Telemetry emitted with fields …"
  - "[ ] QA evidence (tests, screenshots, Cypress) attached."
ArchitectureImpact:
  services:
    - name: ""
      srmRow: ""
      notes: ""
  apis:
    - method: ""
      path: ""
      contracts: ""
SecurityImpact:
  rlsMatrix: "Refer to SEC-001 row"
  rbacRoles: []
  dataClassification: ""
QualityPlan:
  tests:
    unit: []
    integration: []
    e2e: []
  coverageTarget: ">= thresholds from QA-001"
DocsToUpdate:
  - path: ""
    taxonomyGroup: ""
Risks:
  - description: ""
    mitigation: ""
RollbackPlan:
  steps:
    - ""
Dependencies:
  - ""
