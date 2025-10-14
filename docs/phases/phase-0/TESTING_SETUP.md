# Testing & CI/CD Setup - Phase 0

**Status**: ✅ Complete
**PRD Reference**: Section 3.10 Testing & CI/CD, Section 4 Anti-Pattern Guardrails

---

## Overview

Phase 0 establishes the testing foundation for PT-2, following PRD requirements for Jest/RTL unit tests, Cypress E2E tests, and anti-pattern enforcement via ESLint.

---

## Testing Stack

### Unit & Integration Tests
- **Framework**: Jest 30.x with React Testing Library (RTL)
- **Environment**: jsdom for DOM simulation
- **Coverage**: v8 provider (faster than babel)
- **TypeScript**: ts-jest transformer

### E2E Tests
- **Framework**: Cypress 15.x
- **Testing Library Integration**: @testing-library/cypress for accessible queries
- **Modes**: Interactive (`cypress open`) and headless (`cypress run`)

### CI/CD
- **Pipeline**: GitHub Actions
- **Gates**: lint → type-check → test → build → e2e
- **Coverage**: Automatic upload to Codecov (optional)

---

## File Structure

```
__tests__/
├── utils/
│   ├── supabase-mock.ts       # Mock Supabase client factory
│   └── test-helpers.tsx        # Custom RTL render with providers
└── example.test.ts             # Demo test (delete when writing real tests)

cypress/
├── e2e/                        # E2E test specs (*.cy.ts)
├── fixtures/                   # Test data fixtures
└── support/
    ├── commands.ts             # Custom Cypress commands
    ├── component.ts            # Component testing setup
    └── e2e.ts                  # E2E setup

jest.config.js                  # Jest configuration
jest.setup.js                   # Global test setup
cypress.config.ts               # Cypress configuration
```

---

## NPM Scripts

### Jest (Unit/Integration)
```bash
npm test                # Run all tests once
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
npm run test:ci         # CI mode with coverage (--maxWorkers=2)
```

### Cypress (E2E)
```bash
npm run cypress         # Open Cypress UI
npm run cypress:headless # Run headless
npm run e2e             # Start dev server + run Cypress interactively
npm run e2e:headless    # Start dev server + run headless (CI)
```

---

## PRD Testing Requirements

### Service Testing Matrix (PRD 3.10)

| Service Module | Required Tests | Coverage Target |
|----------------|---------------|-----------------|
| `crud.ts` | Happy path + error path unit tests, contract test against DB | 80%+ |
| `business.ts` | Multi-step integration tests, concurrency guards, error enums | 75%+ |
| `transforms.ts` | Deterministic unit tests with snapshots for DTO ↔ view conversions | 90%+ |
| Realtime hooks | Mocked channel tests: subscribe/unsubscribe, scheduler behavior | 70%+ |
| UI service adapters | Contract tests ensuring only view models cross boundary | 80%+ |

### Example Test Patterns

#### 1. Service Unit Test (crud.ts)
```typescript
// services/player/__tests__/crud.test.ts
import { createMockSupabaseClient } from '@/__tests__/utils/supabase-mock'
import { createPlayerCrudService } from '../crud'

describe('Player CRUD Service', () => {
  it('should fetch player by ID - happy path', async () => {
    const mockClient = createMockSupabaseClient()
    const service = createPlayerCrudService(mockClient as any)

    // Mock response
    mockClient.from = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: '123', name: 'John Doe' },
        error: null
      })
    }))

    const result = await service.getById('123')
    expect(result.data).toEqual({ id: '123', name: 'John Doe' })
  })

  it('should handle errors - error path', async () => {
    const mockClient = createMockSupabaseClient()
    const service = createPlayerCrudService(mockClient as any)

    mockClient.from = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      })
    }))

    const result = await service.getById('invalid')
    expect(result.error).toBeTruthy()
  })
})
```

#### 2. Transform Snapshot Test (transforms.ts)
```typescript
// services/player/__tests__/transforms.test.ts
import { playerToViewModel } from '../transforms'

describe('Player Transforms', () => {
  it('should transform player DTO to view model', () => {
    const dto = {
      id: '123',
      name: 'John Doe',
      tier: 'GOLD',
      theoreticalWin: 5000.50
    }

    const viewModel = playerToViewModel(dto)

    // Snapshot test ensures consistent transformations
    expect(viewModel).toMatchSnapshot()
  })
})
```

#### 3. Component Test with RTL
```typescript
// components/player/__tests__/player-card.test.tsx
import { render, screen, userEvent } from '@/__tests__/utils/test-helpers'
import { PlayerCard } from '../player-card'

describe('PlayerCard Component', () => {
  it('should render player information', () => {
    const player = { id: '123', name: 'John Doe', tier: 'GOLD' }
    render(<PlayerCard player={player} />)

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('GOLD')).toBeInTheDocument()
  })

  it('should handle click events', async () => {
    const onClickMock = jest.fn()
    const player = { id: '123', name: 'John Doe', tier: 'GOLD' }

    render(<PlayerCard player={player} onClick={onClickMock} />)

    await userEvent.click(screen.getByRole('button'))
    expect(onClickMock).toHaveBeenCalledWith('123')
  })
})
```

#### 4. E2E Test with Cypress
```typescript
// cypress/e2e/player-flow.cy.ts
describe('Player Management Flow', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'password')
  })

  it('should create a new player', () => {
    cy.visit('/players')
    cy.findByRole('button', { name: /add player/i }).click()

    cy.findByLabelText(/name/i).type('Jane Smith')
    cy.findByLabelText(/tier/i).select('GOLD')
    cy.findByRole('button', { name: /save/i }).click()

    cy.findByText('Jane Smith').should('be.visible')
    cy.findByText('Player created successfully').should('be.visible')
  })
})
```

---

## Anti-Pattern Enforcement (PRD Section 4)

### ESLint Rules Configured

#### Global Anti-Patterns
```javascript
// ❌ Forbidden: Supabase client in components
const client = createClient(url, key)  // ERROR

// ❌ Forbidden: console.log in production
console.log('debug message')  // ERROR (use console.warn or console.error)

// ❌ Forbidden: 'as any' type casting
const data = response as any  // ERROR

// ❌ Forbidden: test.only in CI
test.only('temp test', () => {})  // ERROR
```

#### Service Layer Specific (.eslintrc-services.js)
```javascript
// ❌ Forbidden: ReturnType inference
type Service = ReturnType<typeof createPlayerService>  // ERROR

// ❌ Forbidden: Class-based services
class PlayerService { }  // ERROR

// ❌ Forbidden: Default exports
export default createPlayerService  // ERROR (use named exports)

// ❌ Forbidden: Global real-time managers
const realtimeManager = createGlobalManager()  // ERROR

// ❌ Forbidden: @deprecated code
/** @deprecated Use newFunction instead */  // ERROR (delete deprecated code)
```

### Lint Commands
```bash
npm run lint           # Check all files
npm run lint -- --fix  # Auto-fix issues
```

---

## CI Workflow

**File**: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

### Pipeline Stages
1. **Install**: `npm ci`
2. **Lint**: `npm run lint` (anti-pattern checks)
3. **Type Check**: `npm run type-check`
4. **Unit/Integration Tests**: `npm run test:ci` (with coverage)
5. **Build**: `npm run build`
6. **E2E Tests**: `npm run e2e:headless`
7. **Coverage Upload**: Codecov (optional)

### Environment Variables (Secrets)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key

### Expected Runtime
- Full pipeline: ~3-5 minutes
- Per PRD: Fast feedback (<2min target for unit tests)

---

## Mock Utilities

### Supabase Mock Client
```typescript
import { createMockSupabaseClient } from '@/__tests__/utils/supabase-mock'

const mockClient = createMockSupabaseClient()
const service = createPlayerService(mockClient as SupabaseClient<Database>)
```

**Features**:
- Typed mock responses
- Chainable query builder
- Pre-configured auth mocks
- Channel/realtime mocks

### Custom Render with Providers
```typescript
import { render } from '@/__tests__/utils/test-helpers'

// Automatically wraps with ThemeProvider, QueryClient, etc.
render(<MyComponent />)
```

---

## Contract Testing (PRD Requirement)

### Database Contract Tests
For `crud.ts` modules, verify column mappings against actual schema:

```typescript
// services/player/__tests__/crud.contract.test.ts
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

describe('Player CRUD Contract Tests', () => {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  it('should match database schema for player table', async () => {
    const { data, error } = await client
      .from('player')
      .select('*')
      .limit(1)
      .single()

    expect(error).toBeNull()
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('name')
    expect(data).toHaveProperty('tier')
    // Verify all expected columns exist
  })
})
```

**Note**: Contract tests run in CI against a test database instance.

---

## Coverage Thresholds

**Per PRD requirements**:
- Services: 75-90% coverage
- Components: 60%+ coverage
- E2E: Critical user flows only (not measured by coverage %)

Configure in [jest.config.js](../../jest.config.js):
```javascript
coverageThresholds: {
  global: {
    branches: 70,
    functions: 75,
    lines: 75,
    statements: 75
  }
}
```

---

## Next Steps

1. **Phase 1**: Write security skeleton tests (RLS policies, JWT helpers)
2. **Phase 2**: Implement TDD vertical slice tests (Player → Visit → Rating)
3. **Phase 3**: Add E2E smoke tests for critical flows
4. **Ongoing**: Maintain coverage thresholds per PRD service matrix

---

## Common Issues & Solutions

### Issue: Tests fail with "Cannot find module '@/...'"
**Solution**: Verify `moduleNameMapper` in jest.config.js matches tsconfig.json paths

### Issue: Cypress can't find elements
**Solution**: Use Testing Library queries: `cy.findByRole()`, `cy.findByText()`

### Issue: ESLint conflicts with Prettier
**Solution**: Prettier runs last in config, formatted code is saved by lint-staged

### Issue: CI fails but local tests pass
**Solution**: Run `npm run test:ci` locally to replicate CI environment

---

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Cypress Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [PRD Section 3.10](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#310-testing--cicd)
- [PRD Section 4](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md#4-anti-pattern-guardrails)
