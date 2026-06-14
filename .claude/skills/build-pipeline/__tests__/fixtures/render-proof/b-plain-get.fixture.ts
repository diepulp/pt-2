// FIXTURE B-plain — a GET route returning a PLAIN *ResponseDTO (not a Projection
// DTO), with no primary flag. Not a derived-value surface.
// classify-render-path.py MUST return classification=none, signal=none.
import type { PlayerResponseDTO } from '@/services/player/dtos';

export async function GET(): Promise<PlayerResponseDTO> {
  return {} as PlayerResponseDTO;
}
