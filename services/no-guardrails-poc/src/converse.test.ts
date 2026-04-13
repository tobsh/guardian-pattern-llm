import { describe, expect, it, vi } from 'vitest';
import { converseRaw, type ConverseDeps } from './converse.js';

const makeBedrock = (response: unknown) =>
  ({ send: vi.fn().mockResolvedValue(response) }) as unknown as ConverseDeps['bedrock'];

const makeDeps = (overrides: Partial<ConverseDeps> = {}): ConverseDeps => ({
  bedrock: makeBedrock({}),
  coachModelId: 'eu.anthropic.claude-sonnet-4-6',
  ...overrides,
});

describe('converseRaw', () => {
  it('returns coach text on happy path', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'Hier ist dein Budget.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 30, outputTokens: 50 },
    });
    const result = await converseRaw(makeDeps({ bedrock }), 'Budget?');
    expect(result.text).toBe('Hier ist dein Budget.');
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(50);
  });

  it('concatenates multi-block text output', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'A ' }, { text: 'B' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const result = await converseRaw(makeDeps({ bedrock }), 'hi');
    expect(result.text).toBe('A B');
  });

  it('defaults text to empty string when no content blocks', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [] } },
      stopReason: 'end_turn',
    });
    const result = await converseRaw(makeDeps({ bedrock }), 'hi');
    expect(result.text).toBe('');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});
