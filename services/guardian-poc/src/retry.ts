import { logger } from './logger.js';

const THROTTLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'ServiceQuotaExceededException',
  'RequestLimitExceeded',
  'TimeoutError',
]);

const isRetryable = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (THROTTLE_ERROR_NAMES.has(error.name)) return true;
  const sdkErr = error as { readonly $retryable?: { readonly throttling?: boolean } };
  return sdkErr.$retryable?.throttling === true;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const computeDelay = (attempt: number, baseDelayMs: number): number => {
  const exp = Math.min(baseDelayMs * 2 ** (attempt - 1), 8000);
  // eslint-disable-next-line sonarjs/pseudo-random -- jitter for backoff dispersion, not a security primitive
  return Math.floor(Math.random() * exp);
};

const attemptOnce = async <T>(
  label: string,
  fn: () => Promise<T>,
  attempt: number,
  maxAttempts: number,
  baseDelayMs: number
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (!isRetryable(error) || attempt >= maxAttempts) {
      // eslint-disable-next-line functional/no-throw-statements -- bubble unrecoverable error
      throw error;
    }
    const delay = computeDelay(attempt, baseDelayMs);
    logger.warn('Retryable Bedrock error, backing off', {
      label,
      attempt,
      nextDelayMs: delay,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    await sleep(delay);
    return attemptOnce(label, fn, attempt + 1, maxAttempts, baseDelayMs);
  }
};

/**
 * Wraps an async call with bounded exponential backoff + jitter.
 * Retries only on Bedrock throttle errors — other failures bubble up
 * immediately so fail-closed behavior in the orchestrator is preserved.
 */
export const withRetry = async <T>(
  label: string,
  fn: () => Promise<T>,
  options: { readonly maxAttempts?: number; readonly baseDelayMs?: number } = {}
): Promise<T> => attemptOnce(label, fn, 1, options.maxAttempts ?? 4, options.baseDelayMs ?? 500);
