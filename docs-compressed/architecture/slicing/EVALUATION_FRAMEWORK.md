Architectural Slicing Evaluation 2025-10-09 strategies Approved Solo developer 7 services 98 tests 2 3

Executive Summary framework vertical slicing horizontal layering PT-2 evolves decisions project state team size business priorities decisions

Decision Tree`mermaid graph Decision Q1 domain user-facing domains{Affects domains{Cross-cutting concern Vertical Delivery{Backend logic Horizontal domains{Domain utility Q5 Service Mixed domains>3 domains Workflow Module Vertical Horizontal DB Service Action UI Horizontal Infrastructure domains Service service layer Action Workflow New workflow orchestration layer Mixed M1[Review team document decision Vertical#c8e6c9#2e7d32 Horizontal#bbdefb#1565c0 Service#fff9c4#f57f17 Action#ffccbc#d84315 Workflow#f8bbd0#c2185b Mixed#e0e0e0#424242

Context Assessment Matrix project decisions2.1 Team Context Current Impact Decision 1 developer Favor simplicity defer formalization Solo >3 developers Formalize layer contracts Zero >1 person/month Documentation ESLint rules High Informal patterns Switching HIGH LOW Favor vertical delivery domain week Solo developer vertical delivery 2.2 Codebase Context Threshold Impact Decision 7 services horizontal structure <200 lines/file >500 lines Split modules 1-2 service >5 modules Vertical slicing 98 tests Protect refactoring >80% Maintain coverage 0 Fix Low Monitor debt paydown triggers Strong foundation incrementally avoid 2.3 Business Context Current State Threshold Impact Decision8 weeks target <12 weeks Favor pragmatic perfect-Visible 0 Vertical delivery Service layer Weekly UI Favor vertical visibility Not started Launched Ship MVP ASAP Unknown Favor speed $0 > learning

0 features vertical delivery

Evaluation Criteria Horizontal Layering Affects domains>5 services Cross-cutting validation error handling Infrastructure evolution Testing infrastructure Performance optimization `executeOperation wrapper services batch cache invalidation Supabase client library structured logging shared UI primitives Implement horizontally roll domains 1-3 days infrastructure changes Vertical Delivery User-facing feature Single domain context user workflow Stakeholder demo Market validation hypothesis Player Management UI Visit Tracking workflow Rating Slip MTL compliance dashboard Search functionality Implement DB Service Action Hook UI iteration 1 week 3.3 Hybrid Approach spans 2-3 domains Orchestration Partial infrastructure change Domain-specific enhancement start Real-time domains Search Horizontal infrastructure vertical domain 1-2 weeks

Decision Matrices 4.1 Scope-Based Decision Matrix Domains Affected User Recommended Approach>5) Error handling logging 1 domain Player UI 2-3 domains Casino >3 domains Complex-step process 1 domain Module Business rule query optimization 1 domain Domain-specific components Input 4.2 Complexity-Based Decision Matrix Complexity Level Code Files Recommended Approach Safeguards <100 lines 1-2 files Code review 100-500 lines 3-5 files Unit tests code review 500-1000 lines 6-10 files Integration tests ADR >1000 lines >10 files Prototype team review ADR 4.3 Risk-Based Decision MatrixImpact Reversibility Recommended Approach Validation Single domain Easy Manual testing 2-3 domains Moderate HYBRID Integration tests domains Hard week Staging rollback System-wide hard>1 week ADR team approval staging canary

Trade-Off Analysis Framework 5.1 Time vs Quality Trade-Off for quality improvement Quality Gain change Status quo architecture fix +10-20% Critical bug quick win Inline validation optimization +30-40% MVP feature delivery UI +50-70% Technical debt paydown Module separation error catalog (Redesign +80-90% architecture change Focus 1-week increments 5.2 Flexibility vs Consistency Trade-Off for experimentation or standardization? Flexibility Consistency HIGH MEDIUM consistency LOW CRITICAL value Solo developer flexibility defer 5.3 Speed vs Perfection Trade-Off level "good enough" Perfect (10 weeks Good Enough (4-8 weeks**Module 5 files/service 1 file >500 lines-Time WebSocket infrastructure Manual refresh (Week 7) **Error Error catalog String messages Optimistic updates Loading spinners Explicit interfaces **Schema Integrity** database.types.ts Recommendation** 4/6 aspects weeks to MVP**

Quantitative Metrics 6.1 Service Complexity Metrics Metric Current Warning Critical Action Required <200 >300 >500 lines Split modules 1-2 4 >5 vertical slicing <10 >15 >20 Extract separate modules **Cyclomatic <5 per function >8 >10 Refactor simplify logic Depth** <3 >4 >5 Decouple reduce dependencies File <300 >500 >800 lines Split tests by module metrics green action 6.2 Architecture Health Metrics Metric Target Current Trend Action Below Target Pass 100% Fix failing tests >80% Add tests uncovered code Fix Refactor respect boundaries Type Add explicit types <60s<30s Excellent Optimize 60s Response <500ms Pending Optimize queries add caching metrics green 6.3 Delivery Velocity

Metric Baseline Target Current Calculation 1 per week UI-complete features 10-15 per week Estimate vertical slice 1400 +500/week Productive output Coverage >80% Coverage decrease <5 per week New bugs Stable Intentional debt Phase 2 (7 services 6 weeks service Phase 3 (3 UI features 5 weeks feature

Context Guidelines Solo Developer Context Momentum motivation wins Cognitive locality domain Fast feedback Minimal context switching Visible progress Rigid formalization Premature abstraction Over-engineering Delayed gratification vertical delivery horizontal 7.2 Small Team Context Developers Clear ownership Parallel work Integration contracts Code review standards ESLint boundary rules Formal ADRs LAYER_CONTRACTS horizontal consistency vertical Large Team Context>5 Developers Formalized processes Strict layer boundaries Comprehensive documentation Architectural governance PT-2

Decision Documentation Architectural Decision Record Title Accepted Deprecated Superseded project team size business needs

Decision doing?

Rationale doing

Alternatives Considered Rejected [reason B\*\* Rejected [reason

Consequences [Benefit 1 2 [Trade-off 1

Metrics outcome 1 2

Rollback Plan reverse decision rollback/effort rollback

Related Decisions-001-002-002-test-location-standardization 8.2 Quick Decision Checklist informal decisions ADR Delivery Affects single domain User-facing feature demoed stakeholders completed 1 week Tests alongside infrastructure changes 4 checked Layer Affects ALL domains>5) Cross-cutting concern Infrastructure change No user-facing rolled incrementally Rollback plan 4 checked

Adaptation Framework Reconsider Architecture Review Team size changed MVP shipped Technical debt Performance issues Developer velocity-Hoc Review Service file 500 lines 5 modules Cross-domain orchestration Test suite 10 minutes Layer violations Evolution Pathways Solo to A Formalize layer contracts Add ESLint boundary rules onboarding documentation code review standards MVP to D Performance optimization Bundle splitting Observability Deployment automation Hybrid to D Service files 500 lines team size >3 2 weeks per service split folders MEDIUM

10. Tools Automation 10.1 Metrics Collection Service complexity Test coverage Build time Bundle size **Manual** (Weekly): Team size README Feature delivery count changelog Bug count issue tracker Stakeholder feedback notes 10.2 Decision Support Tools **ESLint Rules** (Future team size >3)-imports import/shared **Architecture Tests**'Architecture Constraints import actions Enforce boundaries import services

Success Criteria Framework Effectiveness decisions <1 hour documented Rollback plans before revisited evidence revision Decisions >1 day Frequent rework>1 month disagreement Metrics tracked Framework not referenced 11.2 Architecture Health architecture healthy Test pass rate 100% coverage >80% PRD violations 0 Layer violations time <60s Action response time <500ms Developer velocity intervention pass rate <95% coverage declining PRD violations Layer violations time>2min Performance degrading velocity

Reference One-Page Decision Guide 1: Single domain user-facing domains infrastructure 2-3 domains user-facing layer complex <500 lines >500 module split 3: Low risk domain High risk-wide (phased rollout urgent MVP feature demo Infrastructure Nice-to-have (future doubt \*\*VERTICAL defer abstractions 12.2 Common Scenarios Recommended Approach Player search Single domain user-facing Supabase services affected start Casino Visit HYBRID 3 services orchestration needed real-time Player Domain-specific enhancement error not urgent PlayerService (>500 lines Technical refactoring pagination-specific UI enhancement workflow layer >3 services involved

Appendix A Synthesis Architect recommendations Layering Analysis Layer structure-Driven Vertical Analysis contexts Strategy Analysis Complementary dimensions Migration Analysis assessment-Pragmatic Analysis Time-to optimization 1.0.0 2025-10-09 Active Framework Quarterly size EVALUATION
