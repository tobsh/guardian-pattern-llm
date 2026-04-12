export type GuardianConfig = {
  readonly region: string;
  readonly guardianModelId: string;
  readonly coachModelId: string;
  readonly constitutionBucket: string;
  readonly constitutionInputKey: string;
  readonly constitutionOutputKey: string;
  readonly forceFailClosed: boolean;
};

export const loadConfig = (): GuardianConfig => ({
  region: requireEnv('AWS_REGION'),
  guardianModelId: requireEnv('GUARDIAN_MODEL_ID'),
  coachModelId: requireEnv('COACH_MODEL_ID'),
  constitutionBucket: requireEnv('CONSTITUTION_BUCKET'),
  constitutionInputKey: process.env.CONSTITUTION_INPUT_KEY ?? 'constitution.input.yaml',
  constitutionOutputKey: process.env.CONSTITUTION_OUTPUT_KEY ?? 'constitution.output.yaml',
  forceFailClosed: process.env.FORCE_FAIL_CLOSED === 'true',
});

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    // eslint-disable-next-line functional/no-throw-statements -- config boot-time validation
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};
