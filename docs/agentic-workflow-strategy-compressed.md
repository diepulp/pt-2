Agentic Workflow Optimization Strategy PT-2 workflows agentic primitives context 1.0.0 2025-10-17 Proposed AI Workflows

PT-2 documentation (100 files 203k words-hoc creation friction AI agents Manual context loading minutes No cross-session memory validation gates Single agent implementation review role boundaries Manual documentation updates automation framework Cross-session knowledge Role-based expertise boundaries tasks validation gates Implementation-ready blueprints Scope guidance Context load 2-5min <10s Session continuity Quality Manual Automated (3 checkpoints Documentation freshness Weekly Real-time Developer onboarding 4h 30min

Table of Contents Agentic Primitives State Analysis Architecture Workflows [Implementation Roadmap [Migration Path [Success Metrics [Risks Mitigation [Comparison Table Steps

Agentic Primitives Reusable configurable blocks AI work natural language files executable language programs professional tooling GitHub Five Primitives Purpose File Pattern Scope Cross-session knowledge Project-wide facts Role expertise Task-specific boundaries task prompts Systematic operations Implementation blueprints Feature requirements Modular guidance rules Context Engineering Patterns Separate sessions focus-Driven.memory.md files prevent rebuild human approval workflows Review before code generation MCP tool restrictions role plan engineers execute Apply.instructions.md files YAML relevant guidance

State Analysis Documentation 104 markdown files 23 subdirectories 202,833 words organization ADRs patterns workflows phases roadmaps Compressed version,640 words 64.2% reduction LLM Templates_TEMPLATE guide_ARCHITECTURE HORIZONTAL VERTICAL decision framework_BLUEPRINT_MVP_PRD specification anti guardrails §4) Foundational contexts ADR documentation state management Hybrid architecture strategy Phase-by-phase implementation tracking Critical Gaps No Agentic static markdown No executable workflow Ad-Hoc Documentation

_HANDOFF no template Created not freeform no structured workflow Copy-paste templates inconsistent Documentation drifts from implementation scales poorly No Validation workflow MTL service No checkpoints design review test planning quality validation Manual Context.claude.md references_BLUEPRINT_MVP_ARCHITECTURE_RESPONSIBILITY_MATRIX read 3-5 files manually No automatic context injection No Role Single agent handles Architecture design Service implementation Code review Documentation updates No professional boundaries quality depends rules Session

session starts Agent review current_HANDOFF.md PRD docs minutes understand No cross-session memory context Missing Templates not workflows_TEMPLATE.md no.prompt.md_TYPE_WORKFLOW.md no validation gates automation Migration workflow no checklist Templates patterns not execution discipline

Architecture Layer Memory-Session Distill 203k documentation 5-6 files context loading project-context Tech stack constraints-decisions ADR summaries phase-status Current work blockers next steps service-catalog Implemented services patterns domain-glossary contexts terminology template-context.memory 2025-10-17

Tech Stack Next.js 14 Router Supabase RLS React Query Cypress React Testing Library

Core Architecture Patterns Functional factories classes Dual files Hybrid layers VERTICAL features domain VERTICAL domains

Anti-Patterns NO ReturnType inference interfaces global singletons factories class-based services factories service-to-service calls production code

87.5% (7/8 services Integration React Query 3 delivery Loyalty service optional post-MVP

References PRD_BLUEPRINT_MVP Service Template Architecture Decision Framework_ARCHITECTURE_QUICK <10s 2-5 minutes Updated task essential facts Git-tracked auditable changes Layer Chat Modes Expertise professional boundaries tool restrictions scoped context architect System design ADR creation service-engineer Frontend reviewer Code review quality checks documenter Documentation creation template.chatmode.md

System Architect High-level design decisions ADR creation tools Read Grep Glob WebSearch WebFetch-only Write Edit Bash git commands NotebookEdit-context-decisions/CANONICAL_BLUEPRINT_MVP_PRD_ARCHITECTURE_QUICK Architect Chat high design decisions

Evaluate patterns Create Design boundaries contexts Identify anti-patterns violations Provide guidance

Boundaries Write code changes Implement features tests Update Create design specifications Draft ADRs Identify gaps risks Recommend patterns Challenge

Validation Gate Protocol architectural task Present design user Explain 2-3 options **Identify wrong Wait user confirmation VALIDATION GATE Architecture Design Review **Proposed description **Alternatives [Option A not B not 1 [Mitigation 2 [Mitigation approve design? user confirmation

Output Deliverables architectural task deliver significant ADR document-XXX-description.md Specification file.md Update-decisions.memory.md summary

Interaction User add LoyaltyService extend PlayerService Architect analyze bounded context sequential VALIDATION Service Boundary Decision separate LoyaltyService distinct context Different data ownership SERVICE_RESPONSIBILITY_MATRIX evolution loyalty rules Rejected violates responsibility Rejected couples domains Additional service complexity Mitigation SERVICE_TEMPLATE_QUICK minimal overhead Create LoyaltyService bounded context model-service.spec implementation

Success Criteria work successful Design clear unambiguous contexts Alternatives evaluated Risks identified mitigations Specification ready implementation User approved Architects write code engineers make decisions MCP use Write tool loads relevant documentation role definition Architect creates.spec.md engineer implements Layer Workflow Prompts Convert ad-hoc requests repeatable validated workflows create-service write-migration Database-adr session-handoff phase-completion template Workflow prompt creation-service.prompt.md

Create New Service End-to service creation 3 validation gates architect Design-engineer Implementation Testing 4: Documentation validation context-catalog_TEMPLATE_QUICK_RESPONSIBILITY_MATRIX_BLUEPRINT_MVP_PRD Create Service Workflow

workflow service PT-2 validation gates 2-4 hours implementation testing

Phase Design Specification Mode.md Read Grep sequential-thinking.claude/specs-service.spec.md Step 1.1 Define Bounded Context service cash transactions regulatory reporting?" data table_x computed_field_y REFERENCES table_z read-only SERVICE_RESPONSIBILITY_MATRIX No overlap services separation domains Step 1.2 Create Service Specification.claude/specs-service.spec.md service_name bounded_context question status proposed created Specification

Bounded Context

Data Ownership OWNS_x_y logic REFERENCES `table_z

Interface Definition export interface CRUD operations create Promise< getById update Promise< delete Promise<void Specialized queries Promise<{Result

Implementation Requirements 1 2 target

Validation Criteria CRUD operations Business logic Test coverage No anti-pattern violations Passes integration smoke test Step 1.3 VALIDATION Design Review specification context unique No overlap SERVICE_RESPONSIBILITY_MATRIX principles Interface complete unambiguous Validation criteria measurable approve Phase

Phase 2: Implementation Engineer Mode-engineer.md Read Write Edit Bash/specs.spec.md Service implementation files Step 2.1 Create Directory Structure mkdir -p services Step 2.2 Implement SERVICE_TEMPLATE_QUICK Functional factory create interfaces Type parameter `SupabaseClient<Database> Separation CRUD.ts business.ts Public API export.ts-Pattern NO class-based services `ReturnType global singletons service-to-service direct calls Step 2.3 VALIDATION Implementation Review Implementation Complete {ServiceName

Files Created lines (125 lines (68 lines (45 lines TypeScript Anti-Pattern Check Functional factory Explicit interfaces typing No classes global state Ready testing approve before Phase

Phase 3: Testing Engineer Mode-engineer.md Read Write Bash execution Test files report Step 3.1 Create Test Files mkdir -p/services.test Step 3.2 Implement Test Coverage Test.test.ts Create path Validation errors Read Found Success Delete.test.ts Calculations correct Edge cases handled Validation logic works (queries.test.ts returns results empty results Performance limits Step 3.3 Run Tests services lines branches functions Step 3.4 VALIDATION GATE 3 Test Review Present test Results Suites X passed Tests Coverage Lines% Branches% Functions XX% All Tests Passing

Check Works services No breaking changes Performance Ready documentation approve before Phase

Phase 4: Documentation Mode.md Read Write Edit Updated memory files documentation Step 4.1 Update Service Catalog-catalog question OWNS REFERENCES services/ XX% 1 2 4.2 Update SERVICE_RESPONSIBILITY_MATRIX Add row table 4.3 Create Reference Documentation complex/services.md API reference Usage examples Special considerations 4.4 Update Phase Status-status.md

Completed CRUD queries% test coverage Zero anti-pattern violations

Checklist service creation Specification approved 1) Implementation SERVICE_TEMPLATE_QUICK anti-patterns avoided Tests coverage tests passing 3) service-catalog SERVICE_RESPONSIBILITY_MATRIX phase-status No changes services

Success Metrics Zero anti-pattern violations Test coverage validation gates passed 2-4 hours 4-6 3 approval checkpoints continuous review Memory files auto-updated No manual documentation creation workflow Same workflow outcomes 3 checkpoints prevent bad implementations Architect designs engineer implements documenter records Memory files phase tracked approvals documented Layer Specification Files Blueprints unambiguous implementation requirements loyalty-service-loyalty-tracking template Specification creation-service.spec.md rewards approved Loyalty Service Specification

Context rewards tier LoyaltyService owns reward tier management

Data Ownership OWNS_tier BRONZE GOLD PLATINUM Points calculation Tier Reward redemption tracking REFERENCES point attribution Points session OWN identity Financial transactions Session management

Interface Definition export LoyaltyService Points Management addPoints(playerId visitId Promise getPointsBalance getPointsHistory Tier Management getCurrentTier checkTierUpgrade<TierChangeResult Rewards getAvailableRewards redeemReward<RedemptionResult export PointsTransaction id playerId visitId points reason Date export LoyaltyTier BRONZE GOLD PLATINUM TierChangeResult currentTier newTier pointsRequired

Database Schema Required Tables Loyalty points ledger CREATE TABLE loyalty_points_random player_id_id created Tier configuration TABLE loyalty_tier_config min_points multiplier benefits Reward redemptions CREATE TABLE loyalty_redemption_random player_id reward_type points_cost redeemed TIMESTAMP ZONE Computed Fields table ALTER TABLE ADD COLUMN loyalty_tier 'BRONZE' COLUMN total_loyalty_points 0

Business Rules Points Accumulation $10 Bonus multipliers BRONZE SILVER GOLD PLATINUM Tier Thresholds BRONZE SILVER,999 GOLD PLATINUM Tier Upgrades threshold Multiplier future earnings

Implementation Requirements Factory export createLoyaltyService/loyalty Public API export Database operations Points logic Specialized queries interfaces defined No inference SupabaseClient typing getPointsBalance <50ms getCurrentTier <50ms addPoints <100ms check Validate player operations Handle point additions Return null non entities

Test Requirements Unit Tests/loyalty.test addPoints Success Invalid player ID getPointsBalance Player exists doesn Returns ordered date Respects limit.test BRONZE GOLD PLATINUM upgrade Crosses threshold Tier multiplier Applied **queries.test getAvailableRewards Returns Deducts points Insufficient points error Coverage Target 80% lines branches functions 90%+

Integration Points RatingSlipService rating slip attribute points await.addPoints.playerId calculatePoints.visitId PlayerService Display tier player profile await.getCurrentTier

Migration Strategy 3) loyalty Apply tables fields seed tier Implementation 3) tests Validate Integration 4) RatingSlipService Update player loyalty dashboard widget

Validation Criteria interface methods Functional factory pattern No anti-patterns Test coverage business rules validated Performance targets<100ms Integration RatingSlipService service-catalog.memory updated SERVICE_RESPONSIBILITY_MATRIX

References Service Template Responsibility Matrix Architecture Standards/CANONICAL_BLUEPRINT_MVP_PRD.md §3.3 Ready implementation service-engineer engineer implement requirements schema tests performance Links standards validation criteria Created architect implemented engineer Layer 5 Modular Instructions-Based Guidance Load relevant instructions file YAML service-layer.instructions services/* testing migrations supabase/migrations*.sql template creation-layer.instructions.md/**/*.ts.test layer implementation standards anti-pattern enforcement Service Layer Implementation Instructions

instructions directory files

Type Safety Enforce CORRECT Patterns import Database SupabaseClient/supabase export interface PlayerService getById create Functional factory parameter export createPlayerService use 'any' PlayerService async getById(id data await supabase Type-safe .select(.eq(.single return data Fully typed FORBIDDEN Patterns ReturnType inference export PlayerService 'any' typing export createPlayerService Class-based services export PlayerService Global singletons supabaseClient export playerService

File Organization services index.ts API export crud Database operations business calculations queries Specialized queries.ts data access no business logic.ts Calculations validations DB Complex queries Compose export

Anti-Patterns Validation file changes service layer functional factory interfaces explicit `SupabaseClient<Database> No global state singletons Service call fails STOP ask user

Context Verification creating service/memory-catalog.md clear No overlap services Follows SERVICE_RESPONSIBILITY_MATRIX unclear switch architect.chatmode design review

Common Scenarios Adding New Service Method Add export PlayerService existing methods getByEmail Promise null New method Implement file data access.ts business logic.ts complex query queries.ts Service Needs Data Another Service WRONG service-to-service call export function createPlayerService visitService async getWithVisits(id string player await getById visits CORRECT Client/action orchestrates export async function getPlayerWithVisits(playerId await.getById visits

Performance Considerations <100ms indexes fields Batch operations Avoid N+1

Testing Requirements service/crud.test.ts.test.ts Coverage lines branches functions

Escalate architect.chatmode Unclear logic business Service ambiguity context overlap create new service reviewer.chatmode Implementation complete quality check anti-patterns validation before committing 2025-10-17 editing UI load layer Anti checks workflow templates memory files

Systematic Workflows 1: Session Start Context Loading User starts session review current reads SESSION_HANDOFF.md.claude.md navigates PRD templates minutes understand starts session Code auto-loads-context-status-decisions<10 seconds Phase 2 87.5% complete Next .claude/config.yml-load-context-status-decisions-catalog-glossary 96% faster context loading (2-5min <10s No manual reference current files updated Consistent session starts Workflow 2: Create Service (Validation Gates

MTL service starts creating files issues violates issues debugging continues MTL service create-service workflow architect 1: DESIGN Architect context Design Review MTLService cash transactions require regulatory reporting Data Ownership CTR calculations compliance status player_financial_transaction visit No overlap services Specification/mtl-service.spec.md approve 2: IMPLEMENTATION Service Engineer spec Implementation Review services/mtl/index Anti-pattern check Functional factory Explicit interfaces No classes Ready 3: Service Engineer tests VALIDATION GATE Test Results 24/24 passing Coverage 92% validation gates passed

4: DOCUMENTATION Documenter Agent memory files complete service-catalog.memory.md updated SERVICE_RESPONSIBILITY_MATRIX updated Service creation complete Execute.claude/workflows/create-service.prompt.md 3 human approval checkpoints Zero anti-pattern violations Consistent quality role separation engineer documenter Workflow 3: Session Handoff session SESSION writes edits minutes session session handoff session-handoff phase-status.memory.md handoff memory progress SESSION_HANDOFF.md handoff created/phases/phase-2/SESSION_HANDOFF.md/phase-status.memory.md updated commit both Execute.claude/workflows/session-handoff.prompt.md

Session Handoff

Current phase

Completed Session updates

Progress tasks

impediments

Actions list

Technical Notes discoveries 5-10 minutes 15-30 manual Consistent format current memory Auto-updates memory Workflow ADR Creation need ADR state management miss review alternatives incomplete rationale revision rounds ADR state management workflow architect-decisions.memory sequential-thinking analyze state management options Phase 3 client state management Query Pros Server local state separation Cons Two libraries learning curve Single state mixed Context Built-in lightweight Limited devtools manual optimization VALIDATION Architecture Decision React Query Zustand Server state caching updates Local state API separation client Aligns Next.js App Router

Risk Two state systems Mitigation guidelines Benefit Best-in-class approve decision create Architect Agent ADR-003-state-management-strategy.md-decisions.memory.md created-003-state-management-strategy.md-decisions.memory.md updated-adr.prompt.md.chatmode.md Structured analysis 3 alternatives rationale documentation Memory auto-updated Validation creation

Implementation Roadmap Phase Memory Infrastructure 1) cross-session memory foundation Create/memory directory-context stack CANONICAL_BLUEPRINT BALANCED_ARCHITECTURE-decisions-001-003 management-status work blockers_HANDOFF Add blockers actions-catalog services List Player Casino Visit RatingSlip TableContext MTL contexts-glossary Define terms domain-specific vocabulary 4-6 hours 6 memory files <500 lines Auto-load configuration Session start <10s full context Measure context load Verify context Phase 2: Chat Modes 1-2 Define role boundaries tool restrictions

Read Grep Glob WebSearch Write PRD ADRs patterns Design ADRs specs-engineer Read Write Bash SERVICE_TEMPLATE_QUICK-catalog implementation tests-engineer Read Write UI patterns component library Frontend implementation Grep Quality standards anti-patterns Code review validation Read Write Edit Memory files documentation standards Update docs 4-6 hours 5 chatmodes Tool restrictions Context Validation gates defined architect mode Write context loads Phase Workflow Prompts 2-3 Systematize operations validation gates

-service 4 phases design implementation testing docs 3 validation gates architect service-engineer-migration Migration Type regeneration schema check commit-adr Structured ADR Sequential thinking alternatives rationale-handoff-generate Update outcomes format-completion Checklist Quality verification next phase 6-8 hours 5 workflow prompts validation gates repeatable outcomes Tested end-to 3 validation gates chatmode switches memory files update Phase Specification Files 3-4 implementation-ready blueprints

-service.spec rewards Interface Database schema Business rules Test requirements-loyalty-ui loyalty Component breakdown API integration Validation criteria-tracking-ui Real-time updates Form validation.spec.md specs 4-6 hours 3 specification files Implementable junior engineer validation criteria Links templates spec junior engineer implement requirements measurable Phase 5 Modular Instructions 4) Context engineering-based instruction

-layer.instructions Anti-pattern enforcement safety rules context checks-layer.instructions Component patterns standards Accessibility requirements.instructions.ts Test structure Coverage requirements Naming conventions.instructions.sql patterns regeneration reminder Naming convention enforcement.claude.md modular instructions Remove content 3-4 hours 4 files Scope-based loading No context pollution.claude.md streamlined Edit services/player/index.ts Verify service-layer.instructions.md loads ui-layer.instructions.md Phase 6 Validation Iteration 4-5 Test system refine usage

-to-end create-service workflow session start time Developer onboarding adjust workflows Update AGENTIC_WORKFLOW_STRATEGY.md 2-3 hours create-service workflow Session start <10s context New developer <30 minutes Zero anti-pattern violations Memory files

Migration Ad-Hoc Systematic Step Extract Knowledge Structuring 203,833 words 104 files 2-5 minutes Context rebuilt compressed Extract facts 6 memory files docs-compressed,640 words 64.2% compression Output (6 files words Reduction 96% 3k Read compressed docs Tech stack project decisions Current status Service list Terminology-glossary summarizes structured memory reviews approves repo 96% context reduction <10s session load Define Roles Single agent No validation Quality memory Create 5 chatmodes Design

Architect Read Grep Glob WebSearch Write Service Engineer Read Bash UI Engineer Read Reviewer Read Grep Glob Documenter Read Professional boundaries quality gates Systematize Operations Ad-hoc requests Inconsistent outcomes Manual review Create workflow prompts validation gates regeneration Structured format-handoff generation Design review implementation Implementation Test quality deterministic outcomes Preserve Context-Session Memory SESSION_HANDOFF Context rebuilt Facts lost sessions-update memory task service-catalog-decisions phase-status.memory single source session continuity no context loss

Success Metrics Quantitative Metrics Current Target Load 2-5 minutes <10 seconds session start to agent ready 203k words <5k words Gate 0% 100% % operations human approval Weekly Real-time-Pattern Detection Manual 100% violations caught **Session 0% 100% sessions full context Qualitative Metrics Target 4 hours 30 minutes review Ad-hoc inconsistent Systematic repeatable Assurance** Manual review Automated human gates Single agent Specialized Manual weekly Automated real-time

Risks Mitigation Impact Probability **Memory outdated Weekly auto-validation git blame tracking-Engineering** many files Start minimal (6 memory 5 expand needed Resistance** learning curve Phase 1 invisible gradual rollout Restrictions block override chatmode review after 2 weeks **Validation Gates Slow critical ops skip routine tasks **Memory Files 500-line limit compression techniques Pollution** (wrong instructions load clear file patterns-Session not updated Mandatory memory update

Comparison Before After Current-Hoc Proposed Improvement Manual (2-5 min Auto-memory<10s **96% Lost sessions Persistent memory 3 gates per workflow Single agent 5 specialized chatmodes Manual (weekly Automated-time Human review Automated human gates anti-patterns** Varies agent Deterministic 4 hours 30 minutes **87% 203k words docs <5k words (memory files **96% Ad-hoc reactive Systematic validated checkpoints**

Steps 1) Review Confirm Prioritize phases 1 (4-6 hours directory Extract 6 files Configure auto-load Test Memory (1 hour session auto-load Measure load time Phase 2-5 2-4 (4-6 hours 5 Test restrictions Verify context scoping (6-8 hours 5 workflow prompts Test Validate triggering (4-6 hours loyalty-service.spec UI specs future specs hours 4 files Test Streamline.claude Improvement Track metrics feedback Adjust workflows Update_WORKFLOW_STRATEGY.md

References External AI Workflows Agentic Primitives-workflows-engineering Code Engineering Patterns.claude-code Internal/diepulp/projects/pt-2/docs words 104 files (72k words 64.2% reduction-2/.md_ARCHITECTURE_QUICK.md/CANONICAL_BLUEPRINT_MVP_PRD.md Related ADRs ADR-001 Dual Database Type Strategy-002 Test Location Standardization-003 State Management Strategy

Appendices A Memory File Template true 500 lines File Name

Section no prose

Section decisions constraints

Section 3: actions

References Context detailed doc Appendix B Chatmode Template role description tools_allowed 1 2 X context_files file reference Chat Mode

Responsibilities role

Boundaries NOT actions actions

Validation Protocol approval

Deliverables role

Example Interaction task execution Appendix C Workflow Prompt Template title chatmode validation_gates context_files reference

Overview outcome

Phase 1: validation gate

Phase 2: validation gate

Final Checklist criteria Appendix D Specification Template service proposed YYYY-MM Specification

Bounded answers

Data Ownership REFERENCES services

Interface Definition interface

Implementation Requirements

Validation Criteria 1.0.0 2025-10-17 Proposed Approval Phase 1

Change Log Version Author 1.0.0 2025-10-17 strategy AI Agent