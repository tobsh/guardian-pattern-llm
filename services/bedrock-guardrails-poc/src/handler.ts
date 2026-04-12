import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { loadConfig } from './config.js';
import { converseWithGuardrails, type ConverseDeps } from './converse.js';
import { logger } from './logger.js';

const config = loadConfig();
const bedrock = new BedrockRuntimeClient({ region: config.region });

const deps: ConverseDeps = {
  bedrock,
  coachModelId: config.coachModelId,
  guardrailId: config.guardrailId,
  guardrailVersion: config.guardrailVersion,
};

type ApiGatewayEvent = {
  readonly body?: string;
  readonly requestContext?: { readonly http?: { readonly method?: string } };
};

const extractMessage = (event: ApiGatewayEvent): string | null => {
  if (typeof event.body === 'string' && event.body.length > 0) {
    try {
      const parsed = JSON.parse(event.body) as { readonly message?: string };
      return typeof parsed.message === 'string' ? parsed.message : null;
    } catch {
      return null;
    }
  }
  return null;
};

export const handler = async (
  event: ApiGatewayEvent
): Promise<{ statusCode: number; body: string }> => {
  const message = extractMessage(event);

  logger.info('Incoming invocation', { hasMessage: message !== null });

  if (message === null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  try {
    const result = await converseWithGuardrails(deps, message);

    logger.info('Turn complete', {
      guardrailAction: result.guardrail.action,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        response: result.text,
        guardrailAction: result.guardrail.action,
        guardrailTrace: {
          inputAssessment: result.guardrail.inputAssessment,
          outputAssessment: result.guardrail.outputAssessment,
        },
        failedClosed: false,
        cost: {
          totalUsd: 0, // Converse API cost computed client-side from tokens
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          breakdown: [
            {
              label: 'converse',
              modelId: config.coachModelId,
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
        guardrailAction: 'NONE',
        guardrailTrace: { inputAssessment: null, outputAssessment: null },
        failedClosed: true,
        cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0, breakdown: [] },
      }),
    };
  }
};
