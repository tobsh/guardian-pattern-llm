import { describe, expect, it, vi } from 'vitest';
import { extractMessage, processTurn } from './core.js';
import { type ConverseDeps } from './converse.js';

const makeBedrock = (response: unknown) =>
  ({ send: vi.fn().mockResolvedValue(response) }) as unknown as ConverseDeps['bedrock'];

const makeDeps = (overrides: Partial<ConverseDeps> = {}): ConverseDeps => ({
  bedrock: makeBedrock({
    output: { message: { content: [{ text: 'ok' }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1 },
  }),
  coachModelId: 'eu.anthropic.claude-sonnet-4-6',
  ...overrides,
});

describe('extractMessage', () => {
  it('returns null when body is missing or empty', () => {
    expect(extractMessage({})).toBeNull();
    expect(extractMessage({ body: '' })).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    expect(extractMessage({ body: 'not-json' })).toBeNull();
  });

  it('returns the parsed message', () => {
    expect(extractMessage({ body: JSON.stringify({ message: 'hi' }) })).toBe('hi');
  });
});

describe('processTurn', () => {
  it('returns 400 on missing message', async () => {
    const result = await processTurn(makeDeps(), { body: '' });
    expect(result.statusCode).toBe(400);
  });

  it('returns coach text with cost breakdown', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'Hier ist dein Plan.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 34 },
    });
    const result = await processTurn(makeDeps({ bedrock }), {
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response).toBe('Hier ist dein Plan.');
    expect(body.failedClosed).toBe(false);
    expect(body.cost.inputTokens).toBe(12);
    expect(body.cost.outputTokens).toBe(34);
    expect(body.cost.breakdown[0].label).toBe('converse');
  });

  it('fails closed when bedrock throws', async () => {
    const bedrock = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ConverseDeps['bedrock'];
    const result = await processTurn(makeDeps({ bedrock }), {
      body: JSON.stringify({ message: 'hi' }),
    });
    const body = JSON.parse(result.body);
    expect(body.failedClosed).toBe(true);
    expect(body.response).toContain('nicht verfügbar');
  });
});
