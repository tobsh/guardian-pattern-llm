import { describe, expect, it, vi } from 'vitest';
import { converseWithGuardrails, type ConverseDeps } from './converse.js';

const makeBedrock = (response: unknown) =>
  ({ send: vi.fn().mockResolvedValue(response) }) as unknown as ConverseDeps['bedrock'];

const makeDeps = (overrides: Partial<ConverseDeps> = {}): ConverseDeps => ({
  bedrock: makeBedrock({}),
  coachModelId: 'eu.anthropic.claude-sonnet-4-6',
  guardrailId: 'gr-test',
  guardrailVersion: 'DRAFT',
  ...overrides,
});

describe('converseWithGuardrails', () => {
  it('returns coach text and NONE action on a clean pass', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'Hier ist dein Budget-Plan.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 42, outputTokens: 17 },
    });
    const result = await converseWithGuardrails(makeDeps({ bedrock }), 'Budget?');
    expect(result.text).toBe('Hier ist dein Budget-Plan.');
    expect(result.guardrail.action).toBe('NONE');
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(17);
  });

  it('reports GUARDRAIL_INTERVENED when stopReason is guardrail_intervened', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: '' }] } },
      stopReason: 'guardrail_intervened',
      usage: { inputTokens: 10, outputTokens: 0 },
    });
    const result = await converseWithGuardrails(makeDeps({ bedrock }), 'Aktientipp?');
    expect(result.guardrail.action).toBe('GUARDRAIL_INTERVENED');
    expect(result.text).toContain('Finanzberater');
  });

  it('surfaces bedrock guardrail trace when present', async () => {
    const inputAssessment = { 'policy-1': { topicPolicy: { topics: [] } } };
    const outputAssessments = { 'policy-1': [{ topicPolicy: { topics: [] } }] };
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
      trace: { guardrail: { inputAssessment, outputAssessments } },
    });
    const result = await converseWithGuardrails(makeDeps({ bedrock }), 'hi');
    expect(result.guardrail.inputAssessment).toStrictEqual(inputAssessment);
    expect(result.guardrail.outputAssessments).toStrictEqual(outputAssessments);
  });

  it('concatenates multi-block text output', async () => {
    const bedrock = makeBedrock({
      output: {
        message: { content: [{ text: 'Teil eins. ' }, { toolUse: {} }, { text: 'Teil zwei.' }] },
      },
      stopReason: 'end_turn',
      usage: { inputTokens: 5, outputTokens: 5 },
    });
    const result = await converseWithGuardrails(makeDeps({ bedrock }), 'hi');
    expect(result.text).toBe('Teil eins. Teil zwei.');
  });

  it('defaults to zero tokens when usage is missing', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
    });
    const result = await converseWithGuardrails(makeDeps({ bedrock }), 'hi');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
