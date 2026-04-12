export type GuardrailsConfig = {
  readonly region: string;
  readonly coachModelId: string;
  readonly guardrailId: string;
  readonly guardrailVersion: string;
};

export const loadConfig = (): GuardrailsConfig => ({
  region: requireEnv('AWS_REGION'),
  coachModelId: requireEnv('COACH_MODEL_ID'),
  guardrailId: requireEnv('GUARDRAIL_ID'),
  guardrailVersion: process.env.GUARDRAIL_VERSION ?? 'DRAFT',
});

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    // eslint-disable-next-line functional/no-throw-statements
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};
