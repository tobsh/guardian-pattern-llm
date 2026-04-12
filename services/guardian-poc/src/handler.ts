import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from './config.js';
import { loadConstitution } from './constitution.js';
import { handleTurn, type OrchestratorDeps } from './orchestrator.js';
import { logger } from './logger.js';

const config = loadConfig();
const bedrock = new BedrockRuntimeClient({ region: config.region });
const s3 = new S3Client({ region: config.region });

// eslint-disable-next-line functional/prefer-readonly-type -- single-slot memoization cache, intentionally mutable
const depsCache: { value: OrchestratorDeps | null } = { value: null };

const getDeps = async (): Promise<OrchestratorDeps> => {
  if (depsCache.value !== null) return depsCache.value;
  const [inputConstitution, outputConstitution] = await Promise.all([
    loadConstitution(s3, config.constitutionBucket, config.constitutionInputKey),
    loadConstitution(s3, config.constitutionBucket, config.constitutionOutputKey),
  ]);
  const built: OrchestratorDeps = {
    guardian: { bedrock, modelId: config.guardianModelId },
    coach: { bedrock, modelId: config.coachModelId },
    inputConstitution,
    outputConstitution,
    forceFailClosed: config.forceFailClosed,
  };
  // eslint-disable-next-line functional/immutable-data -- single-slot memoization cache, intentional
  depsCache.value = built;
  return built;
};

type ApiGatewayEvent = {
  readonly body?: string;
  readonly requestContext?: { readonly http?: { readonly method?: string } };
};

type AgentCoreToolEvent = {
  readonly name?: string;
  readonly arguments?: { readonly message?: string };
  readonly toolName?: string;
  readonly toolInput?: { readonly message?: string };
};

type HandlerEvent = ApiGatewayEvent & AgentCoreToolEvent & Record<string, unknown>;

/**
 * Extract the user message from either an API Gateway v2 HTTP event (web
 * chat path via /turn) or a Bedrock AgentCore Gateway Lambda tool
 * invocation (MCP path). AgentCore has shipped a few event shapes during
 * preview — we check `toolName`/`toolInput` and `name`/`arguments` to
 * cover both variants seen in the wild.
 */
const extractMessage = (event: HandlerEvent): string | null => {
  // API Gateway v2 HTTP event
  if (typeof event.body === 'string' && event.body.length > 0) {
    try {
      const parsed = JSON.parse(event.body) as { readonly message?: string };
      return typeof parsed.message === 'string' ? parsed.message : null;
    } catch {
      return null;
    }
  }

  // AgentCore Lambda tool invocation — variant A
  if (typeof event.toolInput?.message === 'string') return event.toolInput.message;
  // AgentCore Lambda tool invocation — variant B
  if (typeof event.arguments?.message === 'string') return event.arguments.message;

  return null;
};

const isAgentCoreInvocation = (event: HandlerEvent): boolean =>
  typeof event.body !== 'string' &&
  (typeof event.toolName === 'string' || typeof event.name === 'string');

const wrap = (isMcp: boolean, statusCode: number, body: unknown): unknown =>
  isMcp ? body : { statusCode, body: JSON.stringify(body) };

const processTurn = async (isMcp: boolean, message: string): Promise<unknown> => {
  try {
    const deps = await getDeps();
    const result = await handleTurn(deps, message);
    logger.info('Turn complete', {
      path: isMcp ? 'mcp' : 'api',
      inputVerdict: result.inputVerdict.verdict,
      outputVerdict: result.outputVerdict?.verdict ?? null,
      failedClosed: result.failedClosed,
    });
    return wrap(isMcp, 200, result);
  } catch (error) {
    logger.error('Unhandled error — failing closed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return wrap(isMcp, 200, {
      response: 'Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut.',
      failedClosed: true,
    });
  }
};

export const handler = async (event: HandlerEvent): Promise<unknown> => {
  const isMcp = isAgentCoreInvocation(event);
  const message = extractMessage(event);

  logger.info('Incoming invocation', {
    path: isMcp ? 'mcp' : 'api',
    hasMessage: message !== null,
  });

  if (message === null) return wrap(isMcp, 400, { error: 'message is required' });

  return await processTurn(isMcp, message);
};
