import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock aws-amplify/auth before importing the module under test
const fetchAuthSessionMock = vi.fn();
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: () => fetchAuthSessionMock(),
}));

// Mock config — must be set before importing api.ts
vi.mock('./config', () => ({
  config: {
    apiUrl: 'https://api.test.local',
    chatUrl: 'https://chat.test.local',
    cognito: {
      region: 'eu-central-1',
      userPoolId: 'pool',
      userPoolClientId: 'client',
      domain: 'domain',
    },
  },
}));

const { sendTurn, UnauthenticatedError } = await import('./api');

describe('sendTurn', () => {
  beforeEach(() => {
    fetchAuthSessionMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws UnauthenticatedError when the session has no access token', async () => {
    fetchAuthSessionMock.mockResolvedValue({ tokens: {} });
    await expect(sendTurn('hi')).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('attaches Authorization header and posts to /turn', async () => {
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'tok-abc' } },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: 'ok',
        inputVerdict: { verdict: 'pass' },
        outputVerdict: { verdict: 'pass' },
        failedClosed: false,
        cost: { totalUsd: 0.0142, inputTokens: 1700, outputTokens: 580, breakdown: [] },
      }),
    });

    const result = await sendTurn('Hallo');
    expect(result.response).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.local/turn',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer tok-abc',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({ message: 'Hallo' }),
      })
    );
  });

  it('throws UnauthenticatedError on 401 response', async () => {
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'tok' } },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
    });
    await expect(sendTurn('hi')).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws a generic error on 500', async () => {
    fetchAuthSessionMock.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'tok' } },
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });
    await expect(sendTurn('hi')).rejects.toThrow('Guardian API error: 500');
  });
});
