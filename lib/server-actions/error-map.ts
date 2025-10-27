import type { ResultCode } from '@/lib/http/service-response';

const PG_ERROR_CODE_MAP: Record<string, ResultCode> = {
  '23502': 'VALIDATION_ERROR',
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23505': 'UNIQUE_VIOLATION',
  '23514': 'VALIDATION_ERROR',
};

const RESULT_CODES: ResultCode[] = [
  'OK',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNIQUE_VIOLATION',
  'FOREIGN_KEY_VIOLATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
];

export interface MappedError {
  code: ResultCode;
  message: string;
  details?: unknown;
}

function isResultCode(value: unknown): value is ResultCode {
  return typeof value === 'string' && RESULT_CODES.includes(value as ResultCode);
}

function normalizeMessage(message?: unknown, fallback = 'Internal error occurred'): string {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
}

export function mapDatabaseError(error: unknown): MappedError {
  if (error && typeof error === 'object') {
    const code = Reflect.get(error, 'code');
    const message = Reflect.get(error, 'message');
    const details = Reflect.get(error, 'details');

    if (isResultCode(code)) {
      return { code, message: normalizeMessage(message), details };
    }

    if (typeof code === 'string' && PG_ERROR_CODE_MAP[code]) {
      return {
        code: PG_ERROR_CODE_MAP[code],
        message: normalizeMessage(message, 'Database constraint violated'),
        details,
      };
    }

    // PostgREST not found error
    if (code === 'PGRST116') {
      return { code: 'NOT_FOUND', message: 'Record not found', details };
    }
  }

  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message, details: error }; 
  }

  return { code: 'INTERNAL_ERROR', message: 'Internal error occurred', details: error };
}
