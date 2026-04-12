/**
 * Cost computation for Bedrock Claude calls.
 *
 * Prices are approximate 2026-Q2 EU Bedrock list prices — verify against
 * your actual AWS bill for authoritative numbers. They change from time
 * to time, and inference-profile cross-region routing doesn't alter the
 * per-token price.
 */

export type ModelPrices = {
  readonly inputPerMtok: number;
  readonly outputPerMtok: number;
};

// Readonly Partial so index access narrows to `ModelPrices | undefined`
// at the type level, letting us branch on missing models without the
// linter thinking the check is vacuous.
const MODEL_PRICES: Readonly<Partial<Record<string, ModelPrices>>> = {
  'claude-haiku-4-5': { inputPerMtok: 1.0, outputPerMtok: 5.0 },
  'claude-sonnet-4-6': { inputPerMtok: 3.0, outputPerMtok: 15.0 },
};

export type TokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export type CallCost = {
  /** A human-readable label for the call (e.g. 'guardian_in', 'coach'). */
  readonly label: string;
  /** The full Bedrock model ID as invoked (incl. EU prefix). */
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
};

export type TurnCost = {
  readonly totalUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly breakdown: readonly CallCost[];
};

/**
 * Map an inference-profile model ID back to the price-table key.
 * e.g. `eu.anthropic.claude-haiku-4-5-20251001-v1:0` → `claude-haiku-4-5`.
 */
export const resolvePriceKey = (modelId: string): string => {
  if (modelId.includes('haiku-4-5')) return 'claude-haiku-4-5';
  if (modelId.includes('sonnet-4-6')) return 'claude-sonnet-4-6';
  return modelId;
};

export const computeCallCost = (label: string, modelId: string, usage: TokenUsage): CallCost => {
  const prices = MODEL_PRICES[resolvePriceKey(modelId)];
  const costUsd =
    prices === undefined
      ? 0
      : (usage.inputTokens * prices.inputPerMtok + usage.outputTokens * prices.outputPerMtok) /
        1_000_000;
  return {
    label,
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
  };
};

export const aggregateTurnCost = (calls: readonly CallCost[]): TurnCost => ({
  totalUsd: calls.reduce((s, c) => s + c.costUsd, 0),
  inputTokens: calls.reduce((s, c) => s + c.inputTokens, 0),
  outputTokens: calls.reduce((s, c) => s + c.outputTokens, 0),
  breakdown: calls,
});

export const ZERO_TURN_COST: TurnCost = {
  totalUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  breakdown: [],
};
