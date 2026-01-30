/**
 * Claims Lifecycle Tests — AUTH-HARDENING v0.1 WS3
 *
 * Validates that reconcileStaffClaims() correctly syncs/clears JWT claims
 * based on staff mutations. Errors must propagate (no silent swallowing).
 */

import { reconcileStaffClaims } from '../claims-reconcile';

// Mock auth-admin functions
jest.mock('../auth-admin', () => ({
  syncUserRLSClaims: jest.fn().mockResolvedValue(undefined),
  clearUserRLSClaims: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncUserRLSClaims, clearUserRLSClaims } = require('../auth-admin');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reconcileStaffClaims', () => {
  const baseParams = {
    staffId: 'staff-001',
    userId: 'user-001',
    casinoId: 'casino-001',
    staffRole: 'pit_boss',
    currentStatus: 'active',
  };

  describe('staff creation (no previous state)', () => {
    it('syncs claims for active staff with user_id', async () => {
      await reconcileStaffClaims(baseParams);

      expect(syncUserRLSClaims).toHaveBeenCalledTimes(1);
      expect(syncUserRLSClaims).toHaveBeenCalledWith('user-001', {
        casino_id: 'casino-001',
        staff_role: 'pit_boss',
        staff_id: 'staff-001',
      });
      expect(clearUserRLSClaims).not.toHaveBeenCalled();
    });

    it('skips sync for dealers (no user_id)', async () => {
      await reconcileStaffClaims({
        ...baseParams,
        userId: null,
        staffRole: 'dealer',
      });

      expect(syncUserRLSClaims).not.toHaveBeenCalled();
      expect(clearUserRLSClaims).not.toHaveBeenCalled();
    });
  });

  describe('staff deactivation', () => {
    it('clears claims when status changes to inactive', async () => {
      await reconcileStaffClaims({
        ...baseParams,
        currentStatus: 'inactive',
        previousStatus: 'active',
      });

      expect(clearUserRLSClaims).toHaveBeenCalledTimes(1);
      expect(clearUserRLSClaims).toHaveBeenCalledWith('user-001');
      expect(syncUserRLSClaims).not.toHaveBeenCalled();
    });

    it('clears claims using previousUserId if userId removed simultaneously', async () => {
      await reconcileStaffClaims({
        ...baseParams,
        userId: null,
        currentStatus: 'inactive',
        previousStatus: 'active',
        previousUserId: 'user-001',
      });

      expect(clearUserRLSClaims).toHaveBeenCalledTimes(1);
      expect(clearUserRLSClaims).toHaveBeenCalledWith('user-001');
    });
  });

  describe('user_id removal', () => {
    it('clears claims when user_id is removed', async () => {
      await reconcileStaffClaims({
        ...baseParams,
        userId: null,
        previousUserId: 'user-001',
      });

      expect(clearUserRLSClaims).toHaveBeenCalledTimes(1);
      expect(clearUserRLSClaims).toHaveBeenCalledWith('user-001');
      expect(syncUserRLSClaims).not.toHaveBeenCalled();
    });
  });

  describe('casino_id change', () => {
    it('clears stale claims then re-syncs on casino change', async () => {
      const callOrder: string[] = [];
      (clearUserRLSClaims as jest.Mock).mockImplementation(async () => {
        callOrder.push('clear');
      });
      (syncUserRLSClaims as jest.Mock).mockImplementation(async () => {
        callOrder.push('sync');
      });

      await reconcileStaffClaims({
        ...baseParams,
        casinoId: 'casino-002',
        previousUserId: 'user-001',
        previousCasinoId: 'casino-001',
      });

      expect(clearUserRLSClaims).toHaveBeenCalledWith('user-001');
      expect(syncUserRLSClaims).toHaveBeenCalledWith('user-001', {
        casino_id: 'casino-002',
        staff_role: 'pit_boss',
        staff_id: 'staff-001',
      });
      expect(callOrder).toEqual(['clear', 'sync']);
    });
  });

  describe('error propagation', () => {
    it('propagates syncUserRLSClaims failure', async () => {
      (syncUserRLSClaims as jest.Mock).mockRejectedValueOnce(
        new Error('Sync failed'),
      );

      await expect(reconcileStaffClaims(baseParams)).rejects.toThrow(
        'Sync failed',
      );
    });

    it('propagates clearUserRLSClaims failure', async () => {
      (clearUserRLSClaims as jest.Mock).mockRejectedValueOnce(
        new Error('Clear failed'),
      );

      await expect(
        reconcileStaffClaims({
          ...baseParams,
          currentStatus: 'inactive',
          previousStatus: 'active',
        }),
      ).rejects.toThrow('Clear failed');
    });
  });
});
