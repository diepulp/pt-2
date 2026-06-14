// FIXTURE B-verb-guard — a valid *ProjectionResponseDTO suffix returned from a
// POST route. The secondary signal is GET-scoped only; the write-path classifier
// owns mutations. classify-render-path.py MUST return classification=none.
import type { OperationalProjectionResponseDTO } from '@/services/table-context/dtos';

export async function POST(): Promise<OperationalProjectionResponseDTO> {
  return {} as OperationalProjectionResponseDTO;
}
