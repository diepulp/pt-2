/**
 * Mock Supabase client for unit/integration tests
 * Provides typed mock responses without hitting real database
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../../types/database.types'

export type MockSupabaseClient = Partial<SupabaseClient<Database>>

/**
 * Creates a mock Supabase client with chainable query builder
 * Usage: const mockClient = createMockSupabaseClient()
 */
export function createMockSupabaseClient(): MockSupabaseClient {
  const createQueryBuilder = (mockData?: any, mockError?: any) => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: mockData, error: mockError }),
    maybeSingle: jest.fn().mockResolvedValue({ data: mockData, error: mockError }),
    limit: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: jest.fn((resolve) =>
      resolve({ data: mockData, error: mockError })
    ),
  })

  return {
    from: jest.fn((table: string) => createQueryBuilder()),
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } } },
        error: null,
      }),
    } as any,
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  } as MockSupabaseClient
}

/**
 * Creates a mock service factory with typed Supabase client
 * Usage in service tests:
 *
 * const mockClient = createMockSupabaseClient()
 * const service = createPlayerService(mockClient as SupabaseClient<Database>)
 */
export function mockServiceFactory<T>(
  factory: (client: SupabaseClient<Database>) => T,
  mockData?: any,
  mockError?: any
): { service: T; mockClient: MockSupabaseClient } {
  const mockClient = createMockSupabaseClient()
  const service = factory(mockClient as SupabaseClient<Database>)

  return { service, mockClient }
}
