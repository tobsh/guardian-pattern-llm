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
  guardrailId: 'gr-test',
  guardrailVersion: 'DRAFT',
  ...overrides,
});

describe('extractMessage', () => {
  it('returns null when body is missing', () => {
    expect(extractMessage({})).toBeNull();
  });

  it('returns null when body is empty string', () => {
    expect(extractMessage({ body: '' })).toBeNull();
  });

  it('returns null when body is not valid JSON', () => {
    expect(extractMessage({ body: 'not-json' })).toBeNull();
  });

  it('returns null when message is not a string', () => {
    expect(extractMessage({ body: JSON.stringify({ message: 123 }) })).toBeNull();
  });

  it('returns the message string', () => {
    expect(extractMessage({ body: JSON.stringify({ message: 'hi' }) })).toBe('hi');
  });
});

describe('processTurn', () => {
  it('returns 400 when the message is missing', async () => {
    const result = await processTurn(makeDeps(), { body: '' });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'message is required' });
  });

  it('returns a clean pass response on happy path', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: 'Hier ist dein Plan.' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    const result = await processTurn(
      makeDeps({ bedrock }),
      { body: JSON.stringify({ message: 'Budget?' }) }
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.response).toBe('Hier ist dein Plan.');
    expect(body.guardrailAction).toBe('NONE');
    expect(body.failedClosed).toBe(false);
    expect(body.cost.inputTokens).toBe(10);
    expect(body.cost.outputTokens).toBe(20);
    expect(body.cost.breakdown).toHaveLength(1);
  });

  it('returns GUARDRAIL_INTERVENED when bedrock blocks the turn', async () => {
    const bedrock = makeBedrock({
      output: { message: { content: [{ text: '' }] } },
      stopReason: 'guardrail_intervened',
      usage: { inputTokens: 5, outputTokens: 0 },
    });
    const result = await processTurn(
      makeDeps({ bedrock }),
      { body: JSON.stringify({ message: 'Aktientipp?' }) }
    );
    const body = JSON.parse(result.body);
    expect(body.guardrailAction).toBe('GUARDRAIL_INTERVENED');
    expect(body.response).toContain('Finanzberater');
  });

  it('fails closed when bedrock throws', async () => {
    const bedrock = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ConverseDeps['bedrock'];
    const result = await processTurn(
      makeDeps({ bedrock }),
      { body: JSON.stringify({ message: 'hi' }) }
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.failedClosed).toBe(true);
    expect(body.response).toContain('nicht verfügbar');
  });
});
