import { type BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import { GuardianOutput, type GuardianOutput as GuardianOutputT } from './schema.js';
import { type Constitution, renderSystemPrompt } from './constitution.js';
import type { TokenUsage } from './cost.js';
import { logger } from './logger.js';

export type GuardianDeps = {
  readonly bedrock: BedrockRuntimeClient;
  readonly modelId: string;
};

export type GuardianInput = {
  readonly constitution: Constitution;
  readonly content: string;
  readonly phase: 'input' | 'output';
};

/**
 * Anthropic tool schema for the Guardian verdict. Forcing a tool call via
 * tool_choice guarantees the model returns JSON matching this schema —
 * no free-text parsing, no regex extraction, no ambiguity.
 */
const VERDICT_TOOL = {
  name: 'report_verdict',
  description: 'Report the Guardian classification verdict for the input. Call exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['pass', 'refuse', 'escalate', 'sanitize'],
        description: 'Routing decision per the constitution routing rules.',
      },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Matched category names from allowed/forbidden lists.',
      },
      flags: {
        type: 'object',
        properties: {
          prompt_injection: { type: 'number', minimum: 0, maximum: 1 },
          red_flag_risk: { type: 'number', minimum: 0, maximum: 1 },
          profanity: { type: 'number', minimum: 0, maximum: 1 },
          off_topic_regulated: { type: 'number', minimum: 0, maximum: 1 },
          pii_leak_attempt: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'prompt_injection',
          'red_flag_risk',
          'profanity',
          'off_topic_regulated',
          'pii_leak_attempt',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string' },
    },
    required: ['verdict', 'categories', 'flags', 'confidence', 'notes'],
  },
} as const;

type ContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly name: string; readonly input: unknown };

type BedrockResponse = {
  readonly content: readonly ContentBlock[];
  readonly stop_reason?: string;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
};

export type GuardianCallResult = {
  readonly verdict: GuardianOutputT;
  readonly usage: TokenUsage;
};

export const classify = async (
  deps: GuardianDeps,
  input: GuardianInput
): Promise<GuardianCallResult> => {
  const body = buildRequestBody(input);
  const command = new InvokeModelCommand({
    modelId: deps.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await deps.bedrock.send(command);
  const raw = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(raw) as BedrockResponse;

  const toolUse = parsed.content.find(
    (c): c is Extract<ContentBlock, { readonly type: 'tool_use' }> =>
      c.type === 'tool_use' && c.name === VERDICT_TOOL.name
  );

  if (toolUse === undefined) {
    logger.error('Guardian did not invoke report_verdict tool', {
      stopReason: parsed.stop_reason,
      contentTypes: parsed.content.map((c) => c.type),
    });
    // eslint-disable-next-line functional/no-throw-statements -- Guardian protocol violation, fail closed upstream
    throw new Error('Guardian did not invoke report_verdict tool');
  }

  const result = GuardianOutput.safeParse(toolUse.input);
  if (!result.success) {
    logger.error('Guardian tool input failed schema validation', {
      input: toolUse.input,
      errors: z.treeifyError(result.error),
    });
    // eslint-disable-next-line functional/no-throw-statements -- schema violation, fail closed upstream
    throw new Error('Guardian tool input schema validation failed');
  }
  return {
    verdict: result.data,
    usage: {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    },
  };
};

const buildRequestBody = (input: GuardianInput): Record<string, unknown> => {
  const tag = input.phase === 'input' ? 'user_input' : 'coach_output';
  return {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 512,
    // Bedrock rejects specifying both temperature and top_p — temperature: 0
    // alone gives deterministic classification output.
    temperature: 0,
    system: renderSystemPrompt(input.constitution),
    tools: [VERDICT_TOOL],
    tool_choice: { type: 'tool', name: VERDICT_TOOL.name },
    messages: [
      {
        role: 'user',
        content: `<${tag}>\n${input.content}\n</${tag}>`,
      },
    ],
  };
};
