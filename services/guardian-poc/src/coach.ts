import { type BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import type { TokenUsage } from './cost.js';
import { withRetry } from './retry.js';

export type CoachDeps = {
  readonly bedrock: BedrockRuntimeClient;
  readonly modelId: string;
};

export type CoachResult = {
  readonly text: string;
  readonly usage: TokenUsage;
};

export const callCoach = async (deps: CoachDeps, userMessage: string): Promise<CoachResult> => {
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    system:
      'Du bist ein empathischer Finanz-Coach. Antworte wertschätzend in einfacher Sprache. Keine konkreten Anlageempfehlungen, keine Steuerberatung, keine Produktnennungen. (PoC-Stub.)',
    messages: [{ role: 'user', content: userMessage }],
  };

  const response = await withRetry('coach', () =>
    deps.bedrock.send(
      new InvokeModelCommand({
        modelId: deps.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      })
    )
  );
  const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
    readonly content: readonly { readonly text: string }[];
    readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
  };
  return {
    text: parsed.content[0]?.text ?? '',
    usage: {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
    },
  };
};
