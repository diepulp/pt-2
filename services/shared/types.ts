/**
 * Shared service layer types following PT-2 canonical architecture
 */

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServiceResult<T> {
  data: T | null;
  error: ServiceError | null;
  success: boolean;
  status: number;
  timestamp: string;
  requestId: string;
}
