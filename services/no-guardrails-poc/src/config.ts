export type NoGuardrailsConfig = {
  readonly region: string;
  readonly coachModelId: string;
};

export const loadConfig = (): NoGuardrailsConfig => ({
  region: requireEnv('AWS_REGION'),
  coachModelId: requireEnv('COACH_MODEL_ID'),
});

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};
