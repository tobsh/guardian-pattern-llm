import {
  type BedrockRuntimeClient,
  ConverseCommand,
  type GuardrailAssessment as SdkGuardrailAssessment,
  type Message as BedrockMessage,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger.js';

export type ConverseDeps = {
  readonly bedrock: BedrockRuntimeClient;
  readonly coachModelId: string;
  readonly guardrailId: string;
  readonly guardrailVersion: string;
};

export type GuardrailAssessmentSummary = {
  readonly action: 'NONE' | 'GUARDRAIL_INTERVENED';
  readonly inputAssessment: Record<string, SdkGuardrailAssessment> | null;
  readonly outputAssessments: Record<string, SdkGuardrailAssessment[]> | null;
};

export type ConverseResult = {
  readonly text: string;
  readonly guardrail: GuardrailAssessmentSummary;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

const SYSTEM_PROMPT =
  'Du bist ein empathischer Finanz-Coach. Antworte wertschätzend in einfacher Sprache. Hilf bei Budgetplanung, Sparen und Schuldenmanagement.';

export const converseWithGuardrails = async (
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
    guardrailConfig: {
      guardrailIdentifier: deps.guardrailId,
      guardrailVersion: deps.guardrailVersion,
      trace: 'enabled',
    },
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

  const stopReason = response.stopReason ?? 'end_turn';
  const guardrailIntervened = stopReason === 'guardrail_intervened';

  const trace = response.trace?.guardrail;
  const inputAssessment = trace?.inputAssessment ?? null;
  const outputAssessments = trace?.outputAssessments ?? null;

  logger.info('Converse call complete', {
    stopReason,
    guardrailIntervened,
    hasInputAssessment: inputAssessment !== null,
    hasOutputAssessments: outputAssessments !== null,
  });

  return {
    text: guardrailIntervened
      ? (outputText ||
        'Darüber kann ich dir leider keine Auskunft geben. Für diese Frage wende dich bitte an einen zugelassenen Finanzberater.')
      : outputText,
    guardrail: {
      action: guardrailIntervened ? 'GUARDRAIL_INTERVENED' : 'NONE',
      inputAssessment,
      outputAssessments,
    },
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
  };
};
