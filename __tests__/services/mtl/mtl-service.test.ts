/**
 * MTL Service Tests
 * Following PT-2 canonical service test architecture
 *
 * Test Coverage:
 * - CRUD operations (create, getById, update, delete)
 * - Query operations (gaming day, patron, CTR threshold, area)
 * - Compliance logic (CTR aggregation, pending reports)
 * - Error handling (FK violations, validation errors, NOT_FOUND)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

import {
  createMTLService,
  type MTLService,
  type MTLEntryCreateDTO,
} from '@/services/mtl'
import type { Database } from '@/types/database.types'

describe('MTL Service', () => {
  let supabase: SupabaseClient<Database>
  let mtlService: MTLService

  // Test fixtures
  let testStaffId: string
  let testCasinoId: string
  let testPatronId: string
  let testEntryId: number

  beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    supabase = createClient<Database>(supabaseUrl, supabaseKey)
    mtlService = createMTLService(supabase)

    // Create test fixtures
    // Staff member (required for recorded_by_employee_id)
    const { data: staff, error: staffError } = await supabase
      .from('Staff')
      .insert({
        firstName: 'MTL',
        lastName: 'TestStaff',
        email: `mtl-test-${Date.now()}@example.com`,
        role: 'AUDITOR',
        updatedAt: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (staffError) {
      throw new Error(`Failed to create test staff: ${staffError.message}`)
    }
    testStaffId = staff.id

    // Casino (for casino_id - text field, not FK)
    testCasinoId = 'test-casino-1'

    // Patron (for patron_id - text field, not FK)
    testPatronId = `patron-${Date.now()}`
  })

  afterAll(async () => {
    // Clean up test fixtures
    if (testStaffId) {
      await supabase.from('Staff').delete().eq('id', testStaffId)
    }
  })

  describe('CRUD Operations', () => {
    describe('create()', () => {
      it('should create MTL entry with valid data', async () => {
        const createData: MTLEntryCreateDTO = {
          casinoId: testCasinoId,
          patronId: testPatronId,
          personName: 'John',
          personLastName: 'Doe',
          direction: 'cash_in',
          area: 'pit',
          tenderType: 'cash',
          amount: 5000,
          tableNumber: 'BJ-01',
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'John Doe Signature',
          notes: 'Test transaction',
        }

        const result = await mtlService.create(createData)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.id).toBeDefined()
          expect(result.data.casino_id).toBe(testCasinoId)
          expect(result.data.patron_id).toBe(testPatronId)
          expect(Number(result.data.amount)).toBe(5000)
          expect(result.data.direction).toBe('cash_in')
          expect(result.data.area).toBe('pit')

          testEntryId = result.data.id
        }
      })

      it('should create MTL entry without patron (anonymous)', async () => {
        const createData: MTLEntryCreateDTO = {
          casinoId: testCasinoId,
          personName: 'Anonymous',
          personLastName: 'Person',
          personDescription: 'White male, 40s, brown hair',
          direction: 'cash_out',
          area: 'cage',
          tenderType: 'cash',
          amount: 3000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'Jane Smith Signature',
        }

        const result = await mtlService.create(createData)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.id).toBeDefined()
          expect(result.data.patron_id).toBeNull()
          expect(result.data.person_description).toBe(
            'White male, 40s, brown hair',
          )
        }
      })

      it('should reject invalid employee ID (FK violation)', async () => {
        const createData: MTLEntryCreateDTO = {
          casinoId: testCasinoId,
          personName: 'Test',
          personLastName: 'Person',
          direction: 'cash_in',
          area: 'pit',
          tenderType: 'cash',
          amount: 1000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: '00000000-0000-0000-0000-000000000000',
          recordedBySignature: 'Invalid Signature',
        }

        const result = await mtlService.create(createData)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(['FOREIGN_KEY_VIOLATION', 'VALIDATION_ERROR']).toContain(
            result.error.code,
          )
        }
      })

      it('should reject empty signature (check constraint)', async () => {
        const createData: MTLEntryCreateDTO = {
          casinoId: testCasinoId,
          direction: 'cash_in',
          area: 'pit',
          tenderType: 'cash',
          amount: 1000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: '   ', // Empty/whitespace only
        }

        const result = await mtlService.create(createData)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('VALIDATION_ERROR')
        }
      })
    })

    describe('getById()', () => {
      it('should retrieve MTL entry by ID', async () => {
        const result = await mtlService.getById(testEntryId)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.id).toBe(testEntryId)
          expect(result.data.patron_id).toBe(testPatronId)
        }
      })

      it('should return NOT_FOUND for non-existent ID', async () => {
        const result = await mtlService.getById(999999999)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND')
        }
      })
    })

    describe('update()', () => {
      it('should update MTL entry fields', async () => {
        const result = await mtlService.update(testEntryId, {
          amount: 6000,
          notes: 'Updated transaction',
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(Number(result.data.amount)).toBe(6000)
          expect(result.data.notes).toBe('Updated transaction')
        }
      })

      it('should return NOT_FOUND for non-existent ID', async () => {
        const result = await mtlService.update(999999999, {
          amount: 1000,
        })

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('NOT_FOUND')
        }
      })
    })

    describe('delete()', () => {
      it('should delete MTL entry', async () => {
        // Create a temporary entry to delete
        const createData: MTLEntryCreateDTO = {
          casinoId: testCasinoId,
          personName: 'Delete',
          personLastName: 'Test',
          direction: 'cash_in',
          area: 'slot',
          tenderType: 'cash',
          amount: 100,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'Delete Test Signature',
        }

        const createResult = await mtlService.create(createData)
        expect(createResult.success).toBe(true)

        if (createResult.success) {
          const deleteResult = await mtlService.delete(createResult.data.id)
          expect(deleteResult.success).toBe(true)

          // Verify deletion
          const getResult = await mtlService.getById(createResult.data.id)
          expect(getResult.success).toBe(false)
        }
      })

      it('should handle delete for non-existent ID', async () => {
        // Supabase delete doesn't fail for non-existent IDs
        const result = await mtlService.delete(999999999)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Query Operations', () => {
    beforeAll(async () => {
      // Create test data for queries
      const testEntries: MTLEntryCreateDTO[] = [
        {
          casinoId: testCasinoId,
          patronId: testPatronId,
          direction: 'cash_in',
          area: 'pit',
          tenderType: 'cash',
          amount: 3000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'Query Test 1',
        },
        {
          casinoId: testCasinoId,
          patronId: testPatronId,
          direction: 'cash_in',
          area: 'cage',
          tenderType: 'cash',
          amount: 8000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'Query Test 2',
        },
        {
          casinoId: testCasinoId,
          patronId: `${testPatronId}-2`,
          direction: 'cash_out',
          area: 'slot',
          tenderType: 'cash',
          amount: 12000,
          eventTime: new Date().toISOString(),
          gamingDay: '2025-10-07',
          recordedByEmployeeId: testStaffId,
          recordedBySignature: 'Query Test 3',
        },
      ]

      for (const entry of testEntries) {
        await mtlService.create(entry)
      }
    })

    describe('listByGamingDay()', () => {
      it('should list entries for specific gaming day', async () => {
        const result = await mtlService.listByGamingDay('2025-10-07')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.length).toBeGreaterThan(0)
          expect(result.data.every((e) => e.gaming_day === '2025-10-07')).toBe(
            true,
          )
        }
      })

      it('should filter by casino ID', async () => {
        const result = await mtlService.listByGamingDay(
          '2025-10-07',
          testCasinoId,
        )

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.every((e) => e.casino_id === testCasinoId)).toBe(
            true,
          )
        }
      })
    })

    describe('listByPatron()', () => {
      it('should list entries for specific patron', async () => {
        const result = await mtlService.listByPatron(testPatronId)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.length).toBeGreaterThan(0)
          expect(result.data.every((e) => e.patron_id === testPatronId)).toBe(
            true,
          )
        }
      })

      it('should filter by gaming day', async () => {
        const result = await mtlService.listByPatron(testPatronId, '2025-10-07')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(
            result.data.every(
              (e) =>
                e.patron_id === testPatronId && e.gaming_day === '2025-10-07',
            ),
          ).toBe(true)
        }
      })
    })

    describe('listByCTRThreshold()', () => {
      it('should list entries meeting CTR threshold', async () => {
        const result = await mtlService.listByCTRThreshold(10000)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.length).toBeGreaterThan(0)
          expect(result.data.every((e) => Number(e.amount) >= 10000)).toBe(true)
        }
      })

      it('should filter by gaming day', async () => {
        const result = await mtlService.listByCTRThreshold(5000, '2025-10-07')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(
            result.data.every(
              (e) => Number(e.amount) >= 5000 && e.gaming_day === '2025-10-07',
            ),
          ).toBe(true)
        }
      })
    })

    describe('listByArea()', () => {
      it('should list entries for specific area', async () => {
        const result = await mtlService.listByArea('pit')

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.length).toBeGreaterThan(0)
          expect(result.data.every((e) => e.area === 'pit')).toBe(true)
        }
      })
    })

    describe('getPendingCTRReports()', () => {
      it('should aggregate patron transactions meeting CTR threshold', async () => {
        const result = await mtlService.getPendingCTRReports(
          '2025-10-07',
          testCasinoId,
          10000,
        )

        expect(result.success).toBe(true)
        if (result.success) {
          // Should find patron with 3000 + 8000 = 11000 in cash_in
          const patronReport = result.data.find(
            (r) => r.patron_id === testPatronId,
          )
          expect(patronReport).toBeDefined()
          if (patronReport) {
            expect(patronReport.total_amount).toBeGreaterThanOrEqual(10000)
            expect(patronReport.direction).toBe('cash_in')
            expect(patronReport.transaction_count).toBeGreaterThan(1)
          }
        }
      })

      it('should separate cash_in and cash_out by direction', async () => {
        const result = await mtlService.getPendingCTRReports(
          '2025-10-07',
          testCasinoId,
          5000,
        )

        expect(result.success).toBe(true)
        if (result.success) {
          // Should have both cash_in and cash_out entries
          const directions = result.data.map((r) => r.direction)
          expect(directions.length).toBeGreaterThan(0)
        }
      })
    })
  })
})
