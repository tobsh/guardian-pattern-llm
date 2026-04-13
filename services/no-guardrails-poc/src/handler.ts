import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { loadConfig } from './config.js';
import { type ConverseDeps } from './converse.js';
import { processTurn, type ApiGatewayEvent, type HandlerResponse } from './core.js';

const config = loadConfig();
const bedrock = new BedrockRuntimeClient({ region: config.region });
const deps: ConverseDeps = {
  bedrock,
  coachModelId: config.coachModelId,
};

export const handler = async (event: ApiGatewayEvent): Promise<HandlerResponse> =>
  processTurn(deps, event);
