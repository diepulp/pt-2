# Player Management E2E Tests

## Overview

This directory contains comprehensive End-to-End (E2E) tests for the Player Management functionality covering the complete CRUD lifecycle.

## Test Suites

### Files

1. **player-management.test.ts** - Jest/Testing Library implementation (18 tests)
2. **player-management.cy.ts** (in cypress/e2e/) - Cypress implementation (18 tests)

## Test Coverage (18 Tests Total)

### 1. Create Workflow (5 tests)
- ✅ Successful player creation
- ✅ Validation errors for empty fields
- ✅ Invalid email format handling
- ✅ Duplicate email error handling
- ✅ Required field indicators

### 2. Read Workflow (4 tests)
- ✅ Display player list
- ✅ Display player details
- ✅ Empty state handling
- ✅ Search functionality (minimum 2 characters)

### 3. Update Workflow (3 tests)
- ✅ Load player data in edit mode
- ✅ Validation errors on update
- ✅ Update button state management

### 4. Delete Workflow (3 tests)
- ✅ Delete confirmation dialog
- ✅ Cancellation of deletion
- ✅ Foreign key constraint error handling

### 5. Complete Workflow (1 test)
- ✅ Full CRUD lifecycle

### 6. Performance Tests (2 tests)
- ✅ Component render time < 1 second
- ✅ Form submission response time

### 7. Accessibility Tests (2 tests)
- ✅ Proper form labels
- ✅ ARIA attributes

## Running Tests

### Jest Tests (Recommended for CI/CD)

```bash
# Run all E2E tests
npm test -- __tests__/e2e/player-management.test.ts

# Run in watch mode
npm run test:watch -- __tests__/e2e/player-management.test.ts

# Run with coverage
npm run test:coverage -- __tests__/e2e/player-management.test.ts
```

### Cypress Tests (Requires GUI environment)

```bash
# Interactive mode
npm run cypress

# Headless mode (requires X server in WSL)
npm run cypress:headless

# With dev server
npm run e2e
```

## Environment Requirements

### For Jest Tests
- Node.js 18+
- No additional requirements

### For Cypress Tests
- Node.js 18+
- Chrome/Electron browser
- X11 server (for WSL environments)
- Development server running on localhost:3000

## Known Issues

### Cypress in WSL2
Cypress may fail to start in WSL2 environments without X11 server. Solutions:
1. Use Jest tests instead
2. Install X server (VcXsrv or similar)
3. Run Cypress in Docker
4. Use GitHub Actions/CI pipeline with proper environment

## Test Data Management

All tests use unique, timestamp-based email addresses to avoid conflicts:
```typescript
const testPlayer = {
  email: `test-${Date.now()}@example.com`,
  firstName: 'Test',
  lastName: 'User',
};
```

## Quality Gates

All 18 tests must pass before marking Wave 4 as complete:
- [ ] All 18 E2E tests implemented
- [ ] All tests passing consistently
- [ ] Performance benchmarks met
- [ ] Error scenarios validated
- [ ] Accessibility tested
- [ ] No critical bugs identified

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run E2E Tests
  run: npm run test:ci -- __tests__/e2e/player-management.test.ts
```

### Pre-commit Hook

```bash
npm test -- __tests__/e2e/player-management.test.ts
```

## Architecture Notes

The tests follow the project's architectural standards:
- Functional composition over inheritance
- Type-safe interfaces
- No global singletons
- Clean separation of concerns
- React Query for state management
- React Hook Form for form validation

## Future Enhancements

1. **Search Performance Tests**: Validate 500ms debounce timing
2. **Load Tests**: Test with large datasets (100+ players)
3. **Network Resilience**: Test offline scenarios
4. **Visual Regression**: Screenshot comparison tests
5. **Integration Tests**: Test with real Supabase instance

## Troubleshooting

### Tests Fail with "Cannot find module"
```bash
npm install
npm run build
```

### Timeout Issues
Increase timeout in jest.config.js:
```javascript
testTimeout: 30000
```

### Component Not Rendering
Check that:
1. QueryClient is properly configured
2. Next.js navigation is mocked
3. All required props are provided

## References

- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Cypress Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [React Query Testing](https://tanstack.com/query/latest/docs/react/guides/testing)
- [Project Architecture](../../docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md)
