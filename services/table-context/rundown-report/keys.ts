/**
 * Rundown Report React Query Key Factory (PRD-038)
 *
 * @see SLAD section 308 for key factory patterns
 */

const ROOT = ['table-context', 'rundown-report'] as const;

export const rundownReportKeys = {
  root: ROOT,

  /** Scope key for invalidation of all rundown report queries */
  scope: [...ROOT] as const,

  /** Report by session ID */
  bySession: (sessionId: string) => [...ROOT, 'by-session', sessionId] as const,

  /** Reports by gaming day */
  byDay: (gamingDay: string) => [...ROOT, 'by-day', gamingDay] as const,

  /** Report by report ID */
  byId: (reportId: string) => [...ROOT, 'by-id', reportId] as const,
};
