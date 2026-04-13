import { fetchAuthSession } from 'aws-amplify/auth';
import { config } from './config';

export type GuardianFlags = {
  prompt_injection: number;
  red_flag_risk: number;
  profanity: number;
  off_topic_regulated: number;
  pii_leak_attempt: number;
};

export type GuardianOutput = {
  verdict: 'pass' | 'refuse' | 'escalate' | 'sanitize';
  categories: string[];
  flags: GuardianFlags;
  confidence: number;
  notes: string;
};

export type CallCost = {
  label: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type TurnCost = {
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  breakdown: CallCost[];
};

export type TurnResponse = {
  response: string;
  inputVerdict: GuardianOutput;
  outputVerdict: GuardianOutput | null;
  failedClosed: boolean;
  cost: TurnCost;
};

// --- Bedrock Guardrails types ---

export type GuardrailTrace = {
  inputAssessment: Record<string, unknown> | null;
  outputAssessments: Record<string, unknown> | null;
};

export type BedrockGuardrailsTurnResponse = {
  response: string;
  guardrailAction: 'NONE' | 'GUARDRAIL_INTERVENED';
  guardrailTrace: GuardrailTrace;
  failedClosed: boolean;
  cost: TurnCost;
};

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthenticatedError';
  }
}

async function getAuthToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new UnauthenticatedError();
  return token;
}

async function authFetch(path: string, message: string): Promise<Response> {
  const token = await getAuthToken();
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    throw new Error(`API error: ${String(response.status)}`);
  }
  return response;
}

/**
 * Guardian Pattern endpoint — POST /turn
 */
export async function sendTurn(message: string): Promise<TurnResponse> {
  const response = await authFetch('/turn', message);
  return (await response.json()) as TurnResponse;
}

/**
 * Bedrock Guardrails endpoint — POST /turn-bedrock-guardrails
 */
export async function sendTurnBedrockGuardrails(
  message: string
): Promise<BedrockGuardrailsTurnResponse> {
  const response = await authFetch('/turn-bedrock-guardrails', message);
  return (await response.json()) as BedrockGuardrailsTurnResponse;
}

// --- No-guardrails types ---

export type NoGuardrailsTurnResponse = {
  response: string;
  failedClosed: boolean;
  cost: TurnCost;
};

/**
 * No-guardrails endpoint — POST /turn-no-guardrails
 */
export async function sendTurnNoGuardrails(message: string): Promise<NoGuardrailsTurnResponse> {
  const response = await authFetch('/turn-no-guardrails', message);
  return (await response.json()) as NoGuardrailsTurnResponse;
}
