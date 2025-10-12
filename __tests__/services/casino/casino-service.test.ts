/**
 * Casino Service Tests - TDD approach for Casino vertical slice
 * Following PT-2 canonical architecture standards
 * Bounded Context: "Where is this happening?" (Location Domain)
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { createCasinoService, type CasinoService } from '@/services/casino'
import type { Database } from '@/types/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('Casino Service - Create Casino', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should create a casino with name and location', async () => {
      const result = await casinoService.create({
        name: `Test Casino ${Date.now()}`,
        location: 'Las Vegas, NV',
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBeDefined()
      expect(result.data?.name).toContain('Test Casino')
      expect(result.data?.location).toBe('Las Vegas, NV')
      expect(result.data?.company_id).toBeNull()
    })

    it('should create a casino with company_id', async () => {
      // First create a company
      const { data: company } = await supabase
        .from('company')
        .insert({ name: `Test Company ${Date.now()}` })
        .select('id')
        .single()

      const result = await casinoService.create({
        name: `Casino with Company ${Date.now()}`,
        location: 'Atlantic City, NJ',
        company_id: company!.id,
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data?.company_id).toBe(company!.id)
    })
  })

  describe('Foreign Key Violation', () => {
    it('should return FOREIGN_KEY_VIOLATION error for invalid company_id', async () => {
      const invalidCompanyId = '00000000-0000-0000-0000-000000000000'

      const result = await casinoService.create({
        name: `Invalid Company Casino ${Date.now()}`,
        location: 'Nowhere',
        company_id: invalidCompanyId,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('FOREIGN_KEY_VIOLATION')
      expect(result.error?.message).toContain('company does not exist')
      expect(result.data).toBeNull()
    })
  })
})

describe('Casino Service - Get By Id', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should retrieve an existing casino by id', async () => {
      // Create a casino first
      const createResult = await casinoService.create({
        name: `GetById Casino ${Date.now()}`,
        location: 'Reno, NV',
      })
      expect(createResult.success).toBe(true)
      const casinoId = createResult.data!.id

      // Retrieve the casino
      const result = await casinoService.getById(casinoId)

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBe(casinoId)
      expect(result.data?.name).toContain('GetById Casino')
      expect(result.data?.location).toBe('Reno, NV')
    })
  })

  describe('Not Found Error', () => {
    it('should return NOT_FOUND error for non-existent casino', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const result = await casinoService.getById(nonExistentId)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('NOT_FOUND')
      expect(result.error?.message).toContain('Casino not found')
      expect(result.data).toBeNull()
    })
  })
})

describe('Casino Service - Update Casino', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should update casino name and location', async () => {
      // Create a casino first
      const createResult = await casinoService.create({
        name: `Original Casino ${Date.now()}`,
        location: 'Original Location',
      })
      expect(createResult.success).toBe(true)
      const casinoId = createResult.data!.id

      // Update the casino
      const result = await casinoService.update(casinoId, {
        name: `Updated Casino ${Date.now()}`,
        location: 'Updated Location',
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(result.data?.id).toBe(casinoId)
      expect(result.data?.name).toContain('Updated Casino')
      expect(result.data?.location).toBe('Updated Location')
    })

    it('should update casino company_id', async () => {
      // Create a casino and company
      const createResult = await casinoService.create({
        name: `Company Update Casino ${Date.now()}`,
        location: 'Test City',
      })
      expect(createResult.success).toBe(true)
      const casinoId = createResult.data!.id

      const { data: company } = await supabase
        .from('company')
        .insert({ name: `Update Company ${Date.now()}` })
        .select('id')
        .single()

      // Update casino with company_id
      const result = await casinoService.update(casinoId, {
        company_id: company!.id,
      })

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data?.company_id).toBe(company!.id)
    })
  })

  describe('Not Found Error', () => {
    it('should return NOT_FOUND error when updating non-existent casino', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'

      const result = await casinoService.update(nonExistentId, {
        name: 'Ghost Casino',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('NOT_FOUND')
      expect(result.data).toBeNull()
    })
  })

  describe('Foreign Key Violation', () => {
    it('should return FOREIGN_KEY_VIOLATION error for invalid company_id on update', async () => {
      // Create a casino first
      const createResult = await casinoService.create({
        name: `FK Test Casino ${Date.now()}`,
        location: 'Test Location',
      })
      expect(createResult.success).toBe(true)
      const casinoId = createResult.data!.id

      const invalidCompanyId = '00000000-0000-0000-0000-000000000000'

      const result = await casinoService.update(casinoId, {
        company_id: invalidCompanyId,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('FOREIGN_KEY_VIOLATION')
      expect(result.data).toBeNull()
    })
  })
})

describe('Casino Service - Delete Casino', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should delete an existing casino', async () => {
      // Create a casino first
      const createResult = await casinoService.create({
        name: `Delete Casino ${Date.now()}`,
        location: 'Delete Location',
      })
      expect(createResult.success).toBe(true)
      const casinoId = createResult.data!.id

      // Delete the casino
      const result = await casinoService.delete(casinoId)

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()

      // Verify deletion
      const getResult = await casinoService.getById(casinoId)
      expect(getResult.success).toBe(false)
      expect(getResult.error?.code).toBe('NOT_FOUND')
    })
  })
})

describe('Casino Service - List Casinos', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should list all casinos', async () => {
      // Create a few casinos
      await casinoService.create({
        name: `List Test A ${Date.now()}`,
        location: 'Location A',
      })
      await casinoService.create({
        name: `List Test B ${Date.now()}`,
        location: 'Location B',
      })

      const result = await casinoService.list()

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('Casino Service - List By Company', () => {
  let supabase: SupabaseClient<Database>
  let casinoService: CasinoService

  beforeEach(() => {
    supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    casinoService = createCasinoService(supabase)
  })

  describe('Happy Path', () => {
    it('should list all casinos for a specific company', async () => {
      // Create a company
      const { data: company } = await supabase
        .from('company')
        .insert({ name: `List Company ${Date.now()}` })
        .select('id')
        .single()

      // Create casinos for this company
      await casinoService.create({
        name: `Company Casino 1 ${Date.now()}`,
        location: 'Location 1',
        company_id: company!.id,
      })
      await casinoService.create({
        name: `Company Casino 2 ${Date.now()}`,
        location: 'Location 2',
        company_id: company!.id,
      })

      const result = await casinoService.listByCompany(company!.id)

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data!.length).toBeGreaterThanOrEqual(2)
      expect(result.data!.every((c) => c.company_id === company!.id)).toBe(true)
    })

    it('should return empty array for company with no casinos', async () => {
      // Create a company without casinos
      const { data: company } = await supabase
        .from('company')
        .insert({ name: `Empty Company ${Date.now()}` })
        .select('id')
        .single()

      const result = await casinoService.listByCompany(company!.id)

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
      expect(result.data).toBeDefined()
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data!.length).toBe(0)
    })
  })
})
