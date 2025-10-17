Testing CI/CD Phase Section 3.10 4 Anti Guardrails

Phase 0 PT-2 PRD/RTL Cypress anti-pattern enforcement

Testing Stack Integration Jest 30.x React Testing Library jsdom DOM simulation v8 babel ts-jest transformer E2E Tests Cypress 15.x queries Interactive headless GitHub Actions lint type-check test build e2e upload Codecov

File Structure utils supabase-mock Supabase client factory test-helpers RTL render.test Demo test e2e test specs fixtures support commands Cypress commands component Component testing e2e E2E setup Global test cypress.config configuration

NPM Scripts/Integration test Run mode development Generate coverage report CI mode coverage Cypress (E2E run cypress Open UI Run headless Start dev server run Cypress Start run headless

PRD Testing Requirements Service Testing Matrix 3.10) Service Module Required Tests Coverage Target `crud.ts error path tests contract test DB 80%+.ts Multi-step integration tests concurrency guards error enums 75%+ `transforms.ts Deterministic tests snapshots DTO conversions 90%+ Realtime hooks Mocked channel tests subscribe/unsubscribe scheduler behavior 70%+ UI service adapters Contract tests models boundary 80%+ Example Test Patterns Service Unit Test (crud.ts.test createMockSupabaseClient createPlayerCrudService mockClient Doe error nullid '123 name 'John Doe handle errors async mockClient createMockSupabaseClient service createPlayerCrudService(mockClient.fn select().mockReturnThis data null error message 'Not found result await service.getById'invalid expect(result.error).toBeTruthy Transform Snapshot Test (transforms.ts.test playerToViewModel transform player view model id '123 name 'John Doe 'GOLD 5000.50 viewModel playerToViewModel consistent transformations(viewModel).toMatchSnapshot Component Test RTL-card.test import render screen userEvent PlayerCard Component render player information player id '123 name 'John Doe 'GOLD render.'John Doe expect'GOLD

handle click events async const onClickMock player id '123 name Doe 'GOLD render<PlayerCard onClick await userEvent.click.getByRole('button expect(onClickMock).toHaveBeenCalledWith'123 E2E Test Cypress/player-flow Management Flow.login('test@example 'password create new player/players.findByRole('button /add player'Jane Smith/tier'GOLD'button /save'Jane Smith.visible created successfully

Anti-Pattern Enforcement Section 4) ESLint Rules Global Anti-Patterns Forbidden Supabase client components client createClient(url console.log production message console.warn.error any type data response test.only CI Service Layer Specific.eslintrc-services.js Forbidden ReturnType Service createPlayerService Forbidden Class-based services PlayerService Default exports createPlayerService named exports Global real-time managers createGlobalManager @deprecated code newFunction deprecated code Lint Commands lint Check files-fix issues

CI Workflow.github/workflows/ci.yml Pipeline Stages `npm ci run-pattern checks/Integration run test:ci run run e2e:headless Codecov Environment Variables_PUBLIC_SUPABASE_URL project URL_ANON_KEY anonymous key Runtime Full pipeline ~3-5 minutes PRD Fast feedback<2min unit tests

Mock Utilities Supabase Mock Client createMockSupabaseClient service Typed mock responses Chainable query builder Pre-configured auth mocks Channel/realtime mocks Custom Render Providers-helpers wraps ThemeProvider QueryClient

Contract Testing Requirement Database Contract Tests.ts modules verify column mappings schema services/player/crud.contract.test.ts createClient/supabase-js Database CRUD Contract Tests client createClient<Database_URL match database schema player table async data await client\*.single expect(error).toBeNull Verify columns Contract tests run CI test database instance

Coverage Thresholds PRD Services 75-90% Components 60% E2E Critical user flows.config branches 70 functions 75 lines statements

Steps security tests JWT TDD slice tests Add E2E smoke tests flows Maintain coverage thresholds PRD matrix

Issues Solutions Tests fail find module Verify.json Cypress find elements queries ESLint conflicts Prettier Prettier runs last code saved lint CI fails local tests pass Run test replicate

References Documentation/getting-started Testing Library [Cypress Best Practices [PRD Section 3.10#310-testing Section 4#4-anti-pattern-guardrails
