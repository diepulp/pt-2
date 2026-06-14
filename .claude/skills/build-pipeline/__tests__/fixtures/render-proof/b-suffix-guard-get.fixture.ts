// FIXTURE B-suffix-guard — `Projection` appears MID-name (ProjectionConfigResponseDTO),
// not as the frozen suffix. Even on a GET route, the $-anchored suffix regex must
// NOT match, isolating the suffix guard from the GET-scope guard.
// classify-render-path.py MUST return classification=none.
import type { ProjectionConfigResponseDTO } from '@/services/table-context/dtos';

export async function GET(): Promise<ProjectionConfigResponseDTO> {
  return {} as ProjectionConfigResponseDTO;
}
