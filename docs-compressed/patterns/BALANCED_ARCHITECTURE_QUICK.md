Balanced Architecture horizontal slicing Synthesis Solo developer 8-week MVP Phase 2→3 transition

Decision Tree graph Start Task Q1 domain-facing domains Layer domains ACTION Orchestration VERT Slice SERVICE Service Action Hook UI week services days ACTION action coordinates days SERVICE S1 service layer hours VERT#c8e6c9#2e7d32-width#bbdefb#1565c0 ACTION#fff9c4#f57f17 SERVICE#ffccbc#d84315

4-Second Rule Question Answer **Scope 1 domain **VERTICAL** domains>5) **HORIZONTAL\*\* **User sees **VERTICAL\*\* **Infrastructure doubt **VERTICAL\*\* defer abstractions

Vertical Slicing Delivery Single domain Visit RatingSlip User-facing demo stakeholders 1 week No infrastructure Implementation Pattern Week N Player Management Feature DATA Migration_tables CREATE TABLE player SERVICE Business logic/player/index.ts ACTION Server action/actions/player/create-player.ts createPlayerAction HOOK React Query-player useCreatePlayer UI Component/player/player-form PlayerForm( useCreatePlayer Examples Player Management UI 2-3 Visit Tracking workflow 4-5 RatingSlip creation 6) Search specific domain Timeline vertical slice developer Day 1-2 Service tests 3-4 Action hooks 5 UI components 6-7 tests polish

Horizontal Layering Affects domains>5 services Cross-cutting system evolution Testing infrastructure No immediate user value Implementation Pattern Week N Add executeOperation wrapper services Create shared infrastructure/operation-wrapper export executeOperation Promise Apply ALL services rollout/player/crud/crud repeat ALL 8 services Examples `executeOperation wrapper services Batch cache invalidation Supabase client upgrade Structured logging Shared UI primitives Timeline infrastructure changes Design pattern (2-4 hours Apply all services (1-2 days Integration testing (2-4 hours

Hybrid Orchestration spans 2-3 domains Orchestration needed Domain-specific enhancement Cross-domain workflow Implementation Pattern Visit Start Player Casino Visit domains app/actions-visit async startVisitAction playerId casinoId createServerClient Orchestrate services Validate dependencies player playerService.getById return casino casinoService domain operation visitService.startVisit player casino_id Examples Visit start Casino Visit Real-time domains Search Player Visit Timeline hybrid features Action orchestration Domain hooks Integration tests

Common Scenarios-Paste Approach Rationale Timeline Player search Single domain user-facing 1 week Supabase services 2 days start 3 services orchestration 3 days real-time Domain-specific 1 week error Not urgent PlayerService>500 lines Refactoring 2 hours pagination Domain-specific UI 3 days structured services 1 day

Strategic Technical Debt Accept 1 until >500 lines split No 3+ reuses No real-time MVP 7 No pagination until >100 records String messages not catalogs ~22 days-week MVP Compromise NOT SupabaseClient NOT Consistent error handling test Service layer minimum Single source Zero cost high protection

Complexity Triggers Split Service File service Function reused Team size>3 Split 2 hours service Formalize Layers Team size>3 Onboarding>1 person Layer violations Technical debt Add ESLint rules LAYER_CONTRACTS.md 2 days Add Workflow Layer>3 operation Complex processes Cross-domain coordination Introduce workflow orchestration layer 1 week

Week-by-Week Application 3) Week Service Layer Finalization Complete MTL queries Add modules Integration testing Foundation features Weeks 2-3 Player Management DB schema Service Actions UI Tests Working Player Management UI Weeks 4-5 Visit Tracking DB schema tableActions Hooks UI Tests lifecycle Working Visit Tracking UI Week 6 RatingSlip Creation DB schema table Actions UI Tests workflows Working RatingSlip UI Week 7 Real-Time Infrastructure wrapper Batch invalidation scheduler real-time hooks Visit RatingSlip Memory leak prevention Real-time synchronization domains Week 8 Production Hardening Integration tests Performance optimization Bundle optimization Deployment automation Production MVP

Sanity Checks Consulted decision tree (4-second rule domain or Verified user-facing infrastructure Estimated timeline days weeks Implementation Tests code SERVICE_TEMPLATE_QUICK patterns No PRD violations Coverage >80% Before PR tests Type check clean No layer violations Documented session handoff

Emergency Decision Matrix 3 questions services 1 VERTICAL HORIZONTAL 2-3 HYBRID orchestration users Yes VERTICAL No HORIZONTAL SERVICE module urgent MVP blocker VERTICAL feature Defer Infrastructure HORIZONTAL Default ship feature refactor

Core Principle layers vertical feature delivery 4 horizontal layers Service Action UI vertical cadence week 1 Visit 2 either/or together

Visual Reference Diagram Selected Layer (Client Components UI UIH Query Layer Actions Middleware Cache Strategies Layer (Business Logic CRUD Modules Business Queries Transforms Validation Layer Supabase Client DB RLS Policies RT-time UI UIH CRUD Business Queries Supabase DB RLS RT uiLayer#fce4ec#880e4f actionLayer#f0f4c3 serviceLayer#e1f5fe#e8f5e9 UI SA,Middleware CRUD,Queries,Transforms,Validation Supabase,RLS Technical layers Feature delivery Visit RatingSlip

Related Docs_TEMPLATE_QUICK.md implementation_TYPE_WORKFLOW.md Type management_HANDOFF.md Current status.md Full analysis (723 lines_FRAMEWORK.md Decision framework (651 lines_BLUEPRINT_MVP_PRD.md PRD §4-pattern 1.0.0 CONSENSUS_SYNTHESIS.md Solo developer 8-week MVP Phase 2→3 transition 10 minutes 3 hours full analysis 90% use case edge cases team scaling consult full framework
