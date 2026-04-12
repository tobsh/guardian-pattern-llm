import { type GuardianOutput, FAIL_CLOSED, FAIL_CLOSED_TEMPLATE } from './schema.js';
import {
  classify as defaultClassify,
  type GuardianCallResult,
  type GuardianDeps,
  type GuardianInput,
} from './guardian.js';
import { callCoach as defaultCallCoach, type CoachDeps, type CoachResult } from './coach.js';
import type { Constitution } from './constitution.js';
import {
  aggregateTurnCost,
  computeCallCost,
  type CallCost,
  type TurnCost,
  ZERO_TURN_COST,
} from './cost.js';
import { logger } from './logger.js';

export type ClassifyFn = (deps: GuardianDeps, input: GuardianInput) => Promise<GuardianCallResult>;
export type CoachFn = (deps: CoachDeps, userMessage: string) => Promise<CoachResult>;

export type OrchestratorDeps = {
  readonly guardian: GuardianDeps;
  readonly coach: CoachDeps;
  readonly inputConstitution: Constitution;
  readonly outputConstitution: Constitution;
  readonly forceFailClosed: boolean;
  readonly classifyFn?: ClassifyFn;
  readonly coachFn?: CoachFn;
};

export type TurnResult = {
  readonly response: string;
  readonly inputVerdict: GuardianOutput;
  readonly outputVerdict: GuardianOutput | null;
  readonly failedClosed: boolean;
  readonly cost: TurnCost;
};

export const handleTurn = async (
  deps: OrchestratorDeps,
  userMessage: string
): Promise<TurnResult> => {
  if (deps.forceFailClosed) {
    logger.warn('FORCE_FAIL_CLOSED enabled — returning template');
    return failClosed([]);
  }

  // eslint-disable-next-line functional/prefer-readonly-type -- accumulator for per-turn cost breakdown
  const calls: CallCost[] = [];

  const inputResult = await safeClassify(deps, userMessage, 'input');
  if (inputResult === null) return failClosed(calls);
  // eslint-disable-next-line functional/immutable-data -- accumulator push
  calls.push(computeCallCost('guardian_in', deps.guardian.modelId, inputResult.usage));

  if (inputResult.verdict.verdict !== 'pass') {
    return {
      response: renderRefusal(inputResult.verdict),
      inputVerdict: inputResult.verdict,
      outputVerdict: null,
      failedClosed: false,
      cost: aggregateTurnCost(calls),
    };
  }

  const coach = await (deps.coachFn ?? defaultCallCoach)(deps.coach, userMessage);
  // eslint-disable-next-line functional/immutable-data -- accumulator push
  calls.push(computeCallCost('coach', deps.coach.modelId, coach.usage));

  const outputResult = await safeClassify(deps, coach.text, 'output');
  if (outputResult === null) return failClosed(calls);
  // eslint-disable-next-line functional/immutable-data -- accumulator push
  calls.push(computeCallCost('guardian_out', deps.guardian.modelId, outputResult.usage));

  if (outputResult.verdict.verdict !== 'pass') {
    return {
      response: renderRefusal(outputResult.verdict),
      inputVerdict: inputResult.verdict,
      outputVerdict: outputResult.verdict,
      failedClosed: false,
      cost: aggregateTurnCost(calls),
    };
  }

  return {
    response: coach.text,
    inputVerdict: inputResult.verdict,
    outputVerdict: outputResult.verdict,
    failedClosed: false,
    cost: aggregateTurnCost(calls),
  };
};

const safeClassify = async (
  deps: OrchestratorDeps,
  content: string,
  phase: 'input' | 'output'
): Promise<GuardianCallResult | null> => {
  const classifyFn = deps.classifyFn ?? defaultClassify;
  try {
    return await classifyFn(deps.guardian, {
      constitution: phase === 'input' ? deps.inputConstitution : deps.outputConstitution,
      content,
      phase,
    });
  } catch (error) {
    logger.error('Guardian call failed — failing closed', {
      phase,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const failClosed = (calls: readonly CallCost[]): TurnResult => ({
  response: FAIL_CLOSED_TEMPLATE,
  inputVerdict: FAIL_CLOSED,
  outputVerdict: null,
  failedClosed: true,
  cost: calls.length === 0 ? ZERO_TURN_COST : aggregateTurnCost(calls),
});

const renderRefusal = (verdict: GuardianOutput): string => {
  switch (verdict.verdict) {
    case 'escalate':
      return 'Das klingt nach einer ernsten Situation. Bitte wende dich an eine Schuldnerberatung oder die Telefonseelsorge (0800 111 0 111). Du bist nicht allein.';
    case 'refuse':
      return 'Darüber kann ich dir leider keine Auskunft geben. Für diese Frage wende dich bitte an einen zugelassenen Finanzberater oder Steuerberater.';
    case 'sanitize':
      return 'Ich habe deine Nachricht nicht ganz verstanden — magst du sie noch einmal in eigenen Worten stellen?';
    case 'pass':
      return '';
  }
};
