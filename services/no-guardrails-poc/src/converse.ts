import {
  type BedrockRuntimeClient,
  ConverseCommand,
  type Message as BedrockMessage,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger.js';

export type ConverseDeps = {
  readonly bedrock: BedrockRuntimeClient;
  readonly coachModelId: string;
};

export type ConverseResult = {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

const SYSTEM_PROMPT =
  'Du bist ein empathischer Finanz-Coach. Antworte wertschätzend in einfacher Sprache. Hilf bei Budgetplanung, Sparen und Schuldenmanagement.';

export const converseRaw = async (
  deps: ConverseDeps,
  userMessage: string
): Promise<ConverseResult> => {
  const messages: BedrockMessage[] = [
    {
      role: 'user',
      content: [{ text: userMessage } as ContentBlock],
    },
  ];

  const command = new ConverseCommand({
    modelId: deps.coachModelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages,
    inferenceConfig: {
      maxTokens: 1024,
      temperature: 0.7,
    },
  });

  const response = await deps.bedrock.send(command);

  const outputText =
    response.output?.message?.content
      ?.filter((block): block is ContentBlock & { text: string } => 'text' in block)
      .map((block) => block.text)
      .join('') ?? '';

  logger.info('Converse call complete', {
    stopReason: response.stopReason,
    inputTokens: response.usage?.inputTokens,
    outputTokens: response.usage?.outputTokens,
  });

  return {
    text: outputText,
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
  };
};
