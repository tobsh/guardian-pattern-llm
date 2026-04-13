import { Logger } from '@aws-lambda-powertools/logger';

export const logger = new Logger({
  serviceName: 'no-guardrails-poc',
  logLevel: (process.env.LOG_LEVEL ?? 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
});
