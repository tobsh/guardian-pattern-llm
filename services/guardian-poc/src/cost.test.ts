import { describe, expect, it } from 'vitest';
import { aggregateTurnCost, computeCallCost, resolvePriceKey, ZERO_TURN_COST } from './cost.js';

describe('resolvePriceKey', () => {
  it('maps Haiku 4.5 inference profile to the price key', () => {
    expect(resolvePriceKey('eu.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('claude-haiku-4-5');
  });

  it('maps Sonnet 4.6 inference profile to the price key', () => {
    expect(resolvePriceKey('eu.anthropic.claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('returns the original ID for unknown models (falls back to zero cost)', () => {
    expect(resolvePriceKey('anthropic.claude-42')).toBe('anthropic.claude-42');
  });
});

describe('computeCallCost', () => {
  it('computes Haiku input+output cost correctly', () => {
    // 1M input @ $1/MTok = $1.00; 1M output @ $5/MTok = $5.00 → $6.00
    const c = computeCallCost('guardian_in', 'claude-haiku-4-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(c.costUsd).toBeCloseTo(6.0, 6);
  });

  it('computes Sonnet cost correctly for a realistic turn', () => {
    // 1000 input @ $3/MTok + 500 output @ $15/MTok = 0.003 + 0.0075 = 0.0105
    const c = computeCallCost('coach', 'eu.anthropic.claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(c.costUsd).toBeCloseTo(0.0105, 6);
  });

  it('returns zero cost for an unknown model rather than throwing', () => {
    const c = computeCallCost('?', 'unknown-model', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(c.costUsd).toBe(0);
  });

  it('carries the label and modelId through', () => {
    const c = computeCallCost('guardian_out', 'claude-haiku-4-5', {
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(c.label).toBe('guardian_out');
    expect(c.modelId).toBe('claude-haiku-4-5');
  });
});

describe('aggregateTurnCost', () => {
  it('sums totals across all calls', () => {
    const calls = [
      computeCallCost('guardian_in', 'claude-haiku-4-5', {
        inputTokens: 800,
        outputTokens: 40,
      }),
      computeCallCost('coach', 'claude-sonnet-4-6', {
        inputTokens: 300,
        outputTokens: 500,
      }),
      computeCallCost('guardian_out', 'claude-haiku-4-5', {
        inputTokens: 600,
        outputTokens: 40,
      }),
    ];
    const turn = aggregateTurnCost(calls);
    expect(turn.inputTokens).toBe(1700);
    expect(turn.outputTokens).toBe(580);
    expect(turn.breakdown).toHaveLength(3);
    // 0.00104 + 0.0084 + 0.0008 = ~0.0102 — check it's in the right ballpark
    expect(turn.totalUsd).toBeGreaterThan(0.005);
    expect(turn.totalUsd).toBeLessThan(0.02);
  });

  it('returns zero aggregates for an empty call list', () => {
    const t = aggregateTurnCost([]);
    expect(t.totalUsd).toBe(0);
    expect(t.inputTokens).toBe(0);
    expect(t.outputTokens).toBe(0);
    expect(t.breakdown).toEqual([]);
  });

  it('ZERO_TURN_COST is shaped consistently with aggregateTurnCost([])', () => {
    expect(ZERO_TURN_COST).toEqual(aggregateTurnCost([]));
  });
});
