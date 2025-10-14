🎯 Immediate Next Steps (Week 3)
1. Team Adoption (Priority 1)
Read BALANCED_ARCHITECTURE_QUICK.md (10 minutes)
Internalize the 4-second rule: "1 domain? VERTICAL. ALL domains? HORIZONTAL."
Apply to all Phase 3 planning decisions
2. Phase 3 Planning (This Week - HORIZONTAL Infrastructure)
Based on the roadmap, Week 3 should focus on HORIZONTAL foundation:
# Week 3 HORIZONTAL Tasks:
✓ Integration smoke tests (Service layer validation)
⏳ React Query setup (lib/query-client.ts)
⏳ Server action wrapper (lib/actions/with-server-action-wrapper.ts)
⏳ Zustand UI stores (store/ui-store.ts, store/player-store.ts)
⏳ Query/mutation hook templates (hooks/shared/)
Rationale: This infrastructure enables Weeks 4-6 VERTICAL feature delivery
3. Create ADR-003: State Management Strategy (Week 3)
Document your React Query + Zustand decisions:
Cache strategy (staleTime, refetchOnWindowFocus)
Query key patterns
Invalidation approach
Zustand scope (ephemeral UI only)
📅 Phase 3 Execution Plan
Week 3 (HORIZONTAL) - State Management Foundation
Deliverable: Infrastructure ready for vertical UI slices Tasks:
Set up React Query with PT-2 defaults
Create server action wrapper pattern
Build Zustand UI stores (modals, navigation state)
Create hook templates (use-service-query, use-service-mutation)
Integration tests across all 7 services
Success Criteria:
✅ React Query provider configured
✅ Server action wrapper tested
✅ Hook templates documented
✅ All services smoke-tested
Week 4 (VERTICAL) - Player Management UI
Deliverable: Working Player Management feature Tasks:
Server actions (create, update, delete, search player)
Query hooks (usePlayer, usePlayers, usePlayerSearch)
Mutation hooks (useCreatePlayer, useUpdatePlayer)
UI components (player-list, player-form, player-detail)
E2E tests (player CRUD workflows)
Success Criteria:
✅ Complete DB → Service → Action → Hook → UI stack
✅ Users can create, view, edit, delete players
✅ E2E tests passing
Week 5 (VERTICAL) - Visit Tracking UI
Deliverable: Working Visit Tracking feature Tasks:
Server actions (start, end, cancel visit)
Query hooks (useVisit, useActiveVisits)
Mutation hooks (useStartVisit, useEndVisit)
UI components (visit-form, visit-list, visit-status)
E2E tests (visit lifecycle)
Week 6 (VERTICAL) - RatingSlip Creation UI
Deliverable: Working RatingSlip Management feature Tasks:
Server actions (create, update rating slips)
Query hooks (useRatingSlip, useRatingSlipsByPlayer)
Mutation hooks (useCreateRatingSlip)
UI components (rating-form, rating-list, point-display)
E2E tests (rating workflows)
🔧 Architectural Decisions Needed
ADR-003: State Management Strategy (Week 3)
Questions to answer:
React Query defaults (staleTime, cacheTime, retry logic)?
Query key pattern ([domain, entity, id] or different)?
Invalidation strategy (invalidateQueries vs setQueryData)?
Zustand scope (which state goes in Zustand vs React Query)?
ADR-004: Real-Time Strategy (Week 6)
Questions to answer:
Direct invalidation or batch scheduler?
Memory leak prevention approach?
Domain-specific channels or shared?
Reconnection handling?
ADR-005: Security Patterns (Week 7)
Questions to answer:
RLS policy patterns per role?
JWT claim validation approach?
Audit logging strategy?
4 (VERTICAL)** - Player Management UI
Deliverable: Working Player Management feature Tasks:
Server actions (create, update, delete, search player)
Query hooks (usePlayer, usePlayers, usePlayerSearch)
Mutation hooks (useCreatePlayer, useUpdatePlayer)
UI components (player-list, player-form, player-detail)
E2E tests (player CRUD workflows)
Success Criteria:
✅ Complete DB → Service → Action → Hook → UI stack
✅ Users can create, view, edit, delete players
✅ E2E tests passing
Week 5 (VERTICAL) - Visit Tracking UI
Deliverable: Working Visit Tracking feature Tasks:
Server actions (start, end, cancel visit)
Query hooks (useVisit, useActiveVisits)
Mutation hooks (useStartVisit, useEndVisit)
UI components (visit-form, visit-list, visit-status)
E2E tests (visit lifecycle)
Week 6 (VERTICAL) - RatingSlip Creation UI
Deliverable: Working RatingSlip Management feature Tasks:
Server actions (create, update rating slips)
Query hooks (useRatingSlip, useRatingSlipsByPlayer)
Mutation hooks (useCreateRatingSlip)
UI components (rating-form, rating-list, point-display)
E2E tests (rating workflows)
🔧 Architectural Decisions Needed
ADR-003: State Management Strategy (Week 3)
Questions to answer:
React Query defaults (staleTime, cacheTime, retry logic)?
Query key pattern ([domain, entity, id] or different)?
Invalidation strategy (invalidateQueries vs setQueryData)?
Zustand scope (which state goes in Zustand vs React Query)?
ADR-004: Real-Time Strategy (Week 6)
Questions to answer:
Direct invalidation or batch scheduler?
Memory leak prevention approach?
Domain-specific channels or shared?
Reconnection handling?
ADR-005: Security Patterns (Week 7)
Questions to answer:
RLS policy patterns per role?
JWT claim validation approach?
Audit logging strategy?
-003 template for state management (30 min)
✅ Set up React Q� Tracking & Metrics
Update SESSION_HANDOFF.md (End of Week 3)
Add section:
## Hybrid Strategy Adoption

**Architecture Decision**: Path D - Hybrid Model formalized

**Week 3 (HORIZONTAL)**:
- ✅ React Query infrastructure
- ✅ Server action wrapper
- ✅ Hook templates
- ✅ Zustand stores

**Weeks 4-6 (VERTICAL)**:
- ⏳ Player Management UI
- ⏳ Visit Tracking UI  
- ⏳ RatingSlip Creation UI

**Reference**: [BALANCED_ARCHITECTURE_QUICK.md](../patterns/BALANCED_ARCHITECTURE_QUICK.md)
Track Weekly Progress
Monitor these metrics: HORIZONTAL Metrics:
React Query adoption across hooks
Server action wrapper usage
Infrastructure completeness
VERTICAL Metrics:
Features delivered (0/3 → 3/3)
E2E test coverage per domain
User-facing functionality
🚀 Quick Win Opportunities
This Week (Week 3)
Loyalty Service (optional, 4 hours)
If time permits, complete to reach 8/8 services
Otherwise, defer to post-MVP
Integration Smoke Tests (priority, 2 hours)
Validate all 7 services work together
Test cross-service dependencies
Document any issues
React Query Setup (priority, 4 hours)
lib/query-client.ts with PT-2 defaults
Provider in root layout
DevTools in development
🎓 Continuous Learning
As You Build Phase 3
Use BALANCED_ARCHITECTURE_QUICK.md for every decision
Label each PR with HORIZONTAL or VERTICAL
Document learnings in ADRs when patterns emerge
Update roadmap if timeline shifts
When Stuck
Check common scenarios table in BALANCED_ARCHITECTURE_QUICK.md
Apply 4-second rule
Default to VERTICAL (ship features, refactor later)
📋 Recommended Action Plan
Today/Tomorrow (2 hours):
✅ Review BALANCED_ARCHITECTURE_QUICK.md (10 min) - ⭐ START HERE
✅ Plan Week 3 HORIZONTAL tasks (30 min)
✅ Create ADR-003 template for state management (30 min)
✅ Set up React Query infrastructure (1 hour)
This Week (Week 3):
Complete HORIZONTAL foundation (5 days)
Document decisions in ADR-003
Update SESSION_HANDOFF.md with progress
Next 3 Weeks (Weeks 4-6):
Execute VERTICAL feature delivery (one domain per week)
Track completion via TodoWrite
E2E tests per feature
🔗 Key References for Phase 3
Decision Making:
BALANCED_ARCHITECTURE_QUICK.md - 4-second rule
Implementation:
SERVICE_TEMPLATE_QUICK.md - Service patterns
DATABASE_TYPE_WORKFLOW.md - Type management
Planning:
MVP_PRODUCTION_ROADMAP.md - 8-week timeline
ARCHITECTURE_GAPS.md - What's missing
Progress Tracking:
SESSION_HANDOFF.md - Current status
INDEX.md - Documentation map
TL;DR Next Steps:
⭐ Read BALANCED_ARCHITECTURE_QUICK.md (10 min)
🔧 Week 3: Build HORIZONTAL state management foundation
🎨 Weeks 4-6: Deliver VERTICAL features (Player → Visit → RatingSlip)
📝 Document decisions in ADRs as you go
📊 Track HORIZONTAL vs VERTICAL progress weekly