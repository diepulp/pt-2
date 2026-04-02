/**
 * Test helpers for middleware tests
 *
 * Co-located per QA-001 testing standards
 */

export {
  createMockSupabase,
  createMockContext,
  createMockContextWithAuth,
  createMockNext,
  createFailingMockNext,
  mockRLSContext,
} from './middleware-context';

export {
  getTestSupabaseClient,
  getTestSupabaseServiceClient,
  getTestAuthenticatedClient,
  setupTestData,
  cleanupTestData,
  testData,
} from './supabase-test-client';

export type { TestAuthenticatedClientResult } from './supabase-test-client';
