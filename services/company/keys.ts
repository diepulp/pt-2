/**
 * CompanyService React Query Key Factories
 *
 * @see docs/21-exec-spec/EXEC-060-company-registration-bootstrap.md
 */

const ROOT = ['company'] as const;

export const companyKeys = {
  /** Root key for all company queries */
  root: ROOT,

  /** Registration status for the current user */
  registration: () => [...ROOT, 'registration'] as const,
};
