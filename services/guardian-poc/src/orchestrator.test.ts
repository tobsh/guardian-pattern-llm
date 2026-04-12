import { describe, expect, it, vi } from 'vitest';
import { handleTurn, type OrchestratorDeps } from './orchestrator.js';
import { type GuardianOutput } from './schema.js';
import type { Constitution } from './constitution.js';

const stubConstitution: Constitution = {
  schema_version: 1,
  phase: 'input',
  role: 'test role',
  allowed_categories: [],
  forbidden_categories: [],
  red_flags: [],
  routing_rules: 'pass all',
};

const makeVerdict = (verdict: GuardianOutput['verdict']): GuardianOutput => ({
  verdict,
  categories: [],
  flags: {
    prompt_injection: 0,
    red_flag_risk: 0,
    profanity: 0,
    off_topic_regulated: 0,
    pii_leak_attempt: 0,
  },
  confidence: 0.99,
  notes: '',
});

const makeGuardianResult = (verdict: GuardianOutput['verdict']) => ({
  verdict: makeVerdict(verdict),
  usage: { inputTokens: 100, outputTokens: 20 },
});

const makeDeps = (overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps => ({
  guardian: { bedrock: {} as never, modelId: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' },
  coach: { bedrock: {} as never, modelId: 'eu.anthropic.claude-sonnet-4-6' },
  inputConstitution: stubConstitution,
  outputConstitution: { ...stubConstitution, phase: 'output' },
  forceFailClosed: false,
  classifyFn: vi.fn().mockResolvedValue(makeGuardianResult('pass')),
  coachFn: vi.fn().mockResolvedValue({
    text: 'mocked coach reply',
    usage: { inputTokens: 200, outputTokens: 400 },
  }),
  ...overrides,
});

describe('handleTurn', () => {
  it('returns fail-closed template when FORCE_FAIL_CLOSED is set', async () => {
    const result = await handleTurn(makeDeps({ forceFailClosed: true }), 'hi');
    expect(result.failedClosed).toBe(true);
    expect(result.response).toContain('nicht verfügbar');
    expect(result.cost.totalUsd).toBe(0);
  });

  it('routes to escalation template on escalate verdict', async () => {
    const deps = makeDeps({
      classifyFn: vi.fn().mockResolvedValue(makeGuardianResult('escalate')),
    });
    const result = await handleTurn(deps, 'Ich habe alles beim Glücksspiel verloren');
    expect(result.inputVerdict.verdict).toBe('escalate');
    expect(result.response).toContain('Schuldnerberatung');
    // Only the input guardian call happened
    expect(result.cost.breakdown).toHaveLength(1);
  });

  it('routes to refusal template on refuse verdict', async () => {
    const deps = makeDeps({ classifyFn: vi.fn().mockResolvedValue(makeGuardianResult('refuse')) });
    const result = await handleTurn(deps, 'Soll ich NVIDIA-Aktien kaufen?');
    expect(result.inputVerdict.verdict).toBe('refuse');
    expect(result.response).toContain('Finanzberater');
    expect(result.cost.breakdown).toHaveLength(1);
  });

  it('fails closed when guardian throws', async () => {
    const deps = makeDeps({ classifyFn: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await handleTurn(deps, 'hi');
    expect(result.failedClosed).toBe(true);
  });

  it('returns coach output when both guardian phases pass', async () => {
    const deps = makeDeps();
    const result = await handleTurn(deps, 'Wie stelle ich ein Monatsbudget auf?');
    expect(result.inputVerdict.verdict).toBe('pass');
    expect(result.outputVerdict?.verdict).toBe('pass');
    expect(result.response).toBe('mocked coach reply');
    expect(result.failedClosed).toBe(false);
  });

  it('aggregates cost across all three model calls on a happy path', async () => {
    const deps = makeDeps();
    const result = await handleTurn(deps, 'Wie stelle ich ein Monatsbudget auf?');
    expect(result.cost.breakdown).toHaveLength(3);
    // 2x Haiku guardian (100 in / 20 out each) + 1x Sonnet coach (200 in / 400 out)
    expect(result.cost.inputTokens).toBe(100 + 200 + 100);
    expect(result.cost.outputTokens).toBe(20 + 400 + 20);
    expect(result.cost.totalUsd).toBeGreaterThan(0);
    // Labels should identify each call
    const labels = result.cost.breakdown.map((c) => c.label);
    expect(labels).toEqual(['guardian_in', 'coach', 'guardian_out']);
  });
});
