/**
 * LoyaltyService Reward Catalog HTTP Fetchers
 *
 * Client-side fetch functions for reward catalog API endpoints.
 * Uses fetchJSON/mutateJSON from @/lib/http/fetch-json for typed responses.
 * All mutations include idempotency-key header.
 *
 * @see ADR-033 Loyalty Reward Domain Model
 * @see EXECUTION-SPEC-ADR-033.md WS3
 */

import { fetchJSON, mutateJSON } from '@/lib/http/fetch-json';

import type {
  CreateRewardInput,
  EligibleRewardDTO,
  LoyaltyEarnConfigDTO,
  RewardCatalogDTO,
  RewardDetailDTO,
  RewardListQuery,
  UpdateRewardInput,
  UpsertEarnConfigInput,
} from './dtos';

const BASE_REWARDS = '/api/v1/rewards';

// === Helper Functions ===

function buildParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const entries = Object.entries(filters).filter(
    ([, value]) => value != null,
  ) as [string, string | number | boolean][];

  return new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  );
}

// === Reward Catalog Operations ===

/**
 * Fetches list of rewards.
 *
 * GET /api/v1/rewards?family=...&kind=...&isActive=...&search=...
 */
export async function listRewards(
  query: RewardListQuery = {},
): Promise<RewardCatalogDTO[]> {
  const params = buildParams({
    family: query.family,
    kind: query.kind,
    isActive: query.isActive,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  });

  const url = params.toString() ? `${BASE_REWARDS}?${params}` : BASE_REWARDS;

  return fetchJSON<RewardCatalogDTO[]>(url);
}

/**
 * Fetches a single reward with full details.
 *
 * GET /api/v1/rewards/{id}
 */
export async function getReward(
  rewardId: string,
): Promise<RewardDetailDTO | null> {
  const url = `${BASE_REWARDS}/${rewardId}`;
  return fetchJSON<RewardDetailDTO | null>(url);
}

/**
 * Creates a new reward.
 * Requires idempotency key.
 *
 * POST /api/v1/rewards
 */
export async function createReward(
  input: CreateRewardInput,
  idempotencyKey: string,
): Promise<RewardCatalogDTO> {
  return mutateJSON<RewardCatalogDTO, CreateRewardInput>(
    BASE_REWARDS,
    input,
    idempotencyKey,
  );
}

/**
 * Updates an existing reward.
 * Requires idempotency key.
 *
 * PATCH /api/v1/rewards/{id}
 */
export async function updateReward(
  input: UpdateRewardInput,
  idempotencyKey: string,
): Promise<RewardCatalogDTO> {
  const url = `${BASE_REWARDS}/${input.id}`;
  return fetchJSON<RewardCatalogDTO>(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

// === Earn Config Operations ===

/**
 * Fetches the casino's earn configuration.
 *
 * GET /api/v1/rewards/earn-config
 */
export async function getEarnConfig(): Promise<LoyaltyEarnConfigDTO | null> {
  return fetchJSON<LoyaltyEarnConfigDTO | null>(`${BASE_REWARDS}/earn-config`);
}

/**
 * Upserts the casino's earn configuration.
 * Requires idempotency key.
 *
 * PUT /api/v1/rewards/earn-config
 */
export async function upsertEarnConfig(
  input: UpsertEarnConfigInput,
  idempotencyKey: string,
): Promise<LoyaltyEarnConfigDTO> {
  return fetchJSON<LoyaltyEarnConfigDTO>(`${BASE_REWARDS}/earn-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

// === Eligible Rewards ===

/**
 * Fetches rewards eligible for a player.
 *
 * GET /api/v1/rewards/eligible?playerId=...
 */
export async function listEligibleRewards(
  playerId: string,
): Promise<EligibleRewardDTO[]> {
  const params = buildParams({ playerId });
  return fetchJSON<EligibleRewardDTO[]>(`${BASE_REWARDS}/eligible?${params}`);
}
