// FIXTURE B-route — PRD-090 analog. A GET route handler returning a
// *ProjectionResponseDTO, with NO primary flag anywhere. The secondary signal
// (governed *Projection suffix on a GET route) MUST fire:
// classification=derived_value, signal=secondary_projection_dto.
import type { OperationalProjectionResponseDTO } from '@/services/table-context/dtos';

export async function GET(): Promise<OperationalProjectionResponseDTO> {
  return {} as OperationalProjectionResponseDTO;
}
