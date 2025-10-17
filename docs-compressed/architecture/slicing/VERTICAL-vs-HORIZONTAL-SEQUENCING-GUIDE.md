PT-2 Horizontal Sequencing 1.0.0 Player Tracker Council Updated 2025-10-09

guide establishes method sequencing development Player Tracker system prevents-vertical problem incomplete verticalization yields incoherent features objective directions early development Horizontal foundation consistency Vertical feature delivery agility

PT service layer follows structure services shared Types utilities operation wrapper index Factory interface crud operations business logic queries Complex queries slices layered domain

Philosophy Cake Don’t Eat metaphor vertical slices horizontal vertical slice-to not-baked Horizontal Vertical Role services handle persistence Slices call services Shared `executeOperation() normalizes errors Slices display feedback Global rules extend.ts-Cutting Auth logging metrics Slices opt in middleware transaction orchestration use-case composition

Sequencing Strategy Phase Objective Deliverables Guardrails horizontal core/shared DB client error wrapper feature logic Bootstrap vertical slices layers schema action hook UI Expand Add slices CRUD flows Uniform directory structure slice integrity checklist §6) Refactor patterns 3 slices validation extract Feedback Monitor coupling drift Lint rules import guards reviews No cross-slice imports service contracts-tier horizontal core agile vertical edge

Favor Direction New infrastructure logging metrics consistent New user feature UI action schema cohesion Shared pattern 3 slices Stabilize abstraction evidence Experimental feature isolated discard invalid Core business rule change Update service re-wire slices

Vertical Slice Integrity Checklist verify defines input contract calls canonical service UI integration uses hook no global state action hook UI flow cross-slice service interface model duplicated promotion Failing 2 checks-vertical refactor merge

Anti-Mush Policies core vertical slices second after 3 shared slice scaffolds layer import review 3–5 realign

Cross-Domain Awareness Horizontal contracts legal domains imports Horizontal Core Layer Types Vertical Slice Attentiveness PR Template Checks rules cross-slice imports Architecture review Refactor slices track slice size violations test coverage Attentiveness Balanced Architecture Principle Horizontal stability Consistent contracts safety Vertical delivery Rapid iteration cohesion Evidence-based refactors abstraction Slice integrity Regression containment Attentiveness Sustainable architecture rebuilds stable horizontal foundations agile vertical slices rebuild
