'use client';

/**
 * Shift Alerts Hooks (PRD-056 WS6)
 *
 * React Query hooks for persistent alert operations:
 * - useShiftAlerts: query persistent alerts by gaming day
 * - usePersistAlerts: mutation to sync anomaly results to shift_alert
 * - useAcknowledgeAlert: mutation to acknowledge an alert
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AcknowledgeAlertInput,
  PersistAlertsInput,
  ShiftAlertDTO,
} from '@/services/shift-intelligence/dtos';
import {
  fetchAcknowledgeAlert,
  fetchAlerts,
  fetchPersistAlerts,
} from '@/services/shift-intelligence/http';
import { shiftIntelligenceKeys } from '@/services/shift-intelligence/keys';

// ── Query: persistent alerts ────────────────────────────────────────────────

export function useShiftAlerts(gamingDay: string, status?: string) {
  return useQuery<{ alerts: ShiftAlertDTO[] }>({
    queryKey: shiftIntelligenceKeys.shiftAlerts(gamingDay, status),
    queryFn: () => fetchAlerts(gamingDay, status),
    enabled: !!gamingDay,
    staleTime: 30_000,
  });
}

// ── Mutation: persist anomaly alerts to DB ──────────────────────────────────

export function usePersistAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PersistAlertsInput | undefined) =>
      fetchPersistAlerts(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: shiftIntelligenceKeys.shiftAlerts.scope,
      });
    },
  });
}

// ── Mutation: acknowledge alert ─────────────────────────────────────────────

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AcknowledgeAlertInput) => fetchAcknowledgeAlert(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: shiftIntelligenceKeys.shiftAlerts.scope,
      });
    },
  });
}
