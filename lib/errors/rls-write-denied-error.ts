import { DomainError } from './domain-errors';

export class RlsWriteDeniedError extends DomainError {
  constructor(table: string, operation: string, context?: string) {
    super(
      'RLS_WRITE_DENIED',
      `Write operation ${operation} on ${table} affected 0 rows`,
      {
        httpStatus: 403,
        details: { table, operation, context },
      },
    );
  }
}
