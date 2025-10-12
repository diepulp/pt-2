import { renderHook, act } from '@testing-library/react'

import { usePlayerUIStore } from '@/store/player-store'

describe('PlayerUIStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => usePlayerUIStore())
    act(() => {
      result.current.resetFilters()
      result.current.clearSelection()
    })
  })

  describe('Filter state', () => {
    it('should update search query and reset page', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setCurrentPage(5)
        result.current.setSearchQuery('John Doe')
      })

      expect(result.current.searchQuery).toBe('John Doe')
      expect(result.current.currentPage).toBe(1) // Should reset to page 1
    })

    it('should update status filter and reset page', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setCurrentPage(3)
        result.current.setStatusFilter('active')
      })

      expect(result.current.statusFilter).toBe('active')
      expect(result.current.currentPage).toBe(1) // Should reset to page 1
    })
  })

  describe('Sort state', () => {
    it('should set sort field', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setSortBy('name')
      })

      expect(result.current.sortBy).toBe('name')
      expect(result.current.sortDirection).toBe('desc') // Default direction
    })

    it('should toggle sort direction when clicking same field', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setSortBy('name')
      })

      expect(result.current.sortBy).toBe('name')
      expect(result.current.sortDirection).toBe('desc')

      act(() => {
        result.current.setSortBy('name') // Same field again
      })

      expect(result.current.sortDirection).toBe('asc') // Should toggle
    })

    it('should toggle sort direction directly', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      expect(result.current.sortDirection).toBe('desc')

      act(() => {
        result.current.toggleSortDirection()
      })

      expect(result.current.sortDirection).toBe('asc')

      act(() => {
        result.current.toggleSortDirection()
      })

      expect(result.current.sortDirection).toBe('desc')
    })
  })

  describe('Pagination state', () => {
    it('should update current page', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setCurrentPage(5)
      })

      expect(result.current.currentPage).toBe(5)
    })

    it('should update items per page and reset to page 1', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.setCurrentPage(3)
        result.current.setItemsPerPage(50)
      })

      expect(result.current.itemsPerPage).toBe(50)
      expect(result.current.currentPage).toBe(1) // Should reset
    })
  })

  describe('View mode state', () => {
    it('should change view mode', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      expect(result.current.viewMode).toBe('table') // Default

      act(() => {
        result.current.setViewMode('grid')
      })

      expect(result.current.viewMode).toBe('grid')

      act(() => {
        result.current.setViewMode('list')
      })

      expect(result.current.viewMode).toBe('list')
    })
  })

  describe('Selection state', () => {
    it('should toggle player selection', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.togglePlayerSelection('player-1')
      })

      expect(result.current.selectedPlayerIds.has('player-1')).toBe(true)

      act(() => {
        result.current.togglePlayerSelection('player-1')
      })

      expect(result.current.selectedPlayerIds.has('player-1')).toBe(false)
    })

    it('should select multiple players', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.togglePlayerSelection('player-1')
        result.current.togglePlayerSelection('player-2')
        result.current.togglePlayerSelection('player-3')
      })

      expect(result.current.selectedPlayerIds.size).toBe(3)
      expect(result.current.selectedPlayerIds.has('player-1')).toBe(true)
      expect(result.current.selectedPlayerIds.has('player-2')).toBe(true)
      expect(result.current.selectedPlayerIds.has('player-3')).toBe(true)
    })

    it('should select all players', () => {
      const { result } = renderHook(() => usePlayerUIStore())
      const playerIds = ['player-1', 'player-2', 'player-3', 'player-4']

      act(() => {
        result.current.selectAllPlayers(playerIds)
      })

      expect(result.current.selectedPlayerIds.size).toBe(4)
      playerIds.forEach((id) => {
        expect(result.current.selectedPlayerIds.has(id)).toBe(true)
      })
    })

    it('should clear selection', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      act(() => {
        result.current.togglePlayerSelection('player-1')
        result.current.togglePlayerSelection('player-2')
      })

      expect(result.current.selectedPlayerIds.size).toBe(2)

      act(() => {
        result.current.clearSelection()
      })

      expect(result.current.selectedPlayerIds.size).toBe(0)
    })
  })

  describe('Reset filters', () => {
    it('should reset all filters to defaults', () => {
      const { result } = renderHook(() => usePlayerUIStore())

      // Modify all filter states
      act(() => {
        result.current.setSearchQuery('test query')
        result.current.setStatusFilter('vip')
        result.current.setSortBy('totalPoints')
        result.current.setCurrentPage(5)
      })

      // Verify changes
      expect(result.current.searchQuery).toBe('test query')
      expect(result.current.statusFilter).toBe('vip')
      expect(result.current.sortBy).toBe('totalPoints')
      expect(result.current.currentPage).toBe(5)

      // Reset
      act(() => {
        result.current.resetFilters()
      })

      // Verify reset to defaults
      expect(result.current.searchQuery).toBe('')
      expect(result.current.statusFilter).toBe('all')
      expect(result.current.sortBy).toBe('lastVisit')
      expect(result.current.sortDirection).toBe('desc')
      expect(result.current.currentPage).toBe(1)
    })
  })
})
