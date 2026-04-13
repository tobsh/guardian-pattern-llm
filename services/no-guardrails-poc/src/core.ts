import { converseRaw, type ConverseDeps } from './converse.js';
import { logger } from './logger.js';

export type ApiGatewayEvent = {
  readonly body?: string;
};

export type HandlerResponse = { statusCode: number; body: string };

export const extractMessage = (event: ApiGatewayEvent): string | null => {
  if (typeof event.body !== 'string' || event.body.length === 0) return null;
  try {
    const parsed = JSON.parse(event.body) as { readonly message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
};

export const processTurn = async (
  deps: ConverseDeps,
  event: ApiGatewayEvent
): Promise<HandlerResponse> => {
  const message = extractMessage(event);
  logger.info('Incoming invocation', { hasMessage: message !== null });

  if (message === null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  try {
    const result = await converseRaw(deps, message);
    logger.info('Turn complete', {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        response: result.text,
        failedClosed: false,
        cost: {
          totalUsd: 0,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          breakdown: [
            {
              label: 'converse',
              modelId: deps.coachModelId,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: 0,
            },
          ],
        },
      }),
    };
  } catch (error) {
    logger.error('Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        response: 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.',
        failedClosed: true,
        cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0, breakdown: [] },
      }),
    };
  }
};
