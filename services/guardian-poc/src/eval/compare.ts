/**
 * Three-way eval harness — runs every case in cases.ts against all three
 * deployed Lambdas (no-guardrails, bedrock-guardrails, guardian-pattern)
 * and reports verdict accuracy, latency, and USD cost side by side.
 *
 * Auth: uses the CliClientId Cognito client with USERNAME/PASSWORD flow.
 *
 * Required env vars:
 *   AWS_REGION                 default eu-central-1
 *   COGNITO_USERNAME           Cognito user (created via admin-create-user)
 *   COGNITO_PASSWORD           that user's permanent password
 *
 * Optional env vars (auto-fetched from CloudFormation if unset):
 *   API_URL                    Guardian API Gateway base URL
 *   COGNITO_USER_POOL_ID
 *   COGNITO_CLI_CLIENT_ID
 *
 * Output:
 *   eval-comparison-<timestamp>.json
 *   eval-comparison-<timestamp>.md
 *
 * Usage:
 *   COGNITO_USERNAME=you@example.com \
 *   COGNITO_PASSWORD='YourPass123!' \
 *   pnpm guardian:eval:compare
 */

import { writeFileSync } from 'node:fs';
import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output,
} from '@aws-sdk/client-cloudformation';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { EVAL_CASES, type EvalCase } from './cases.js';
import type { GuardianVerdict } from '../schema.js';

type Approach = 'no-guardrails' | 'bedrock-guardrails' | 'guardian';

type CallResult = {
  readonly approach: Approach;
  readonly caseId: string;
  readonly category: string;
  readonly expected: GuardianVerdict;
  readonly actual: string;
  readonly latencyMs: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly response: string;
  readonly error: string | null;
};

type Settings = {
  readonly region: string;
  readonly apiUrl: string;
  readonly userPoolId: string;
  readonly cliClientId: string;
  readonly username: string;
  readonly password: string;
};

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
};

const getStackOutput = async (
  cfn: CloudFormationClient,
  stackName: string,
  key: string
): Promise<string> => {
  const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs: Output[] = result.Stacks?.[0]?.Outputs ?? [];
  const found = outputs.find((o) => o.OutputKey === key);
  if (!found?.OutputValue) {
    throw new Error(`Stack ${stackName} has no output named ${key}`);
  }
  return found.OutputValue;
};

const loadSettings = async (): Promise<Settings> => {
  const region = process.env.AWS_REGION ?? 'eu-central-1';
  const username = requireEnv('COGNITO_USERNAME');
  const password = requireEnv('COGNITO_PASSWORD');

  let apiUrl = process.env.API_URL;
  let userPoolId = process.env.COGNITO_USER_POOL_ID;
  let cliClientId = process.env.COGNITO_CLI_CLIENT_ID;

  if (!apiUrl || !userPoolId || !cliClientId) {
    console.log('Fetching missing values from CloudFormation outputs...');
    const cfn = new CloudFormationClient({ region });
    if (!apiUrl) {
      apiUrl = await getStackOutput(cfn, 'GuardianDemoGuardianPocStack', 'ApiUrl');
    }
    if (!userPoolId) {
      userPoolId = await getStackOutput(cfn, 'GuardianDemoAuthStack', 'UserPoolId');
    }
    if (!cliClientId) {
      cliClientId = await getStackOutput(cfn, 'GuardianDemoAuthStack', 'CliClientId');
    }
  }

  return { region, apiUrl, userPoolId, cliClientId, username, password };
};

const getAccessToken = async (s: Settings): Promise<string> => {
  const cog = new CognitoIdentityProviderClient({ region: s.region });
  const result = await cog.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: s.cliClientId,
      AuthParameters: { USERNAME: s.username, PASSWORD: s.password },
    })
  );
  const token = result.AuthenticationResult?.AccessToken;
  if (!token) {
    throw new Error('Cognito returned no AccessToken — is the password permanent (not temporary)?');
  }
  return token;
};

type GuardianResponse = {
  response: string;
  inputVerdict: { verdict: GuardianVerdict };
  outputVerdict: { verdict: GuardianVerdict } | null;
  failedClosed: boolean;
  cost: { totalUsd: number; inputTokens: number; outputTokens: number };
};

type BedrockResponse = {
  response: string;
  guardrailAction: 'NONE' | 'GUARDRAIL_INTERVENED';
  failedClosed: boolean;
  cost: { totalUsd: number; inputTokens: number; outputTokens: number };
};

type NoGuardrailsResponse = {
  response: string;
  failedClosed: boolean;
  cost: { totalUsd: number; inputTokens: number; outputTokens: number };
};

// Sonnet 4.6 + Haiku 4.5 pricing (USD per 1M tokens, eu-central-1, April 2026)
const SONNET_INPUT = 3.0;
const SONNET_OUTPUT = 15.0;

const sonnetCost = (input: number, output: number): number =>
  (input * SONNET_INPUT + output * SONNET_OUTPUT) / 1_000_000;

const callTurn = async <T>(url: string, token: string, message: string): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}: ${await res.text()}`);
  return (await res.json()) as T;
};

const runOne = async (
  approach: Approach,
  url: string,
  token: string,
  c: EvalCase
): Promise<CallResult> => {
  const start = Date.now();
  const base: Omit<
    CallResult,
    'actual' | 'latencyMs' | 'costUsd' | 'inputTokens' | 'outputTokens' | 'response' | 'error'
  > = {
    approach,
    caseId: c.id,
    category: c.category,
    expected: c.expectedVerdict,
  };
  try {
    if (approach === 'guardian') {
      const r = await callTurn<GuardianResponse>(url, token, c.message);
      return {
        ...base,
        actual: r.failedClosed ? 'failed_closed' : r.inputVerdict.verdict,
        latencyMs: Date.now() - start,
        costUsd: r.cost.totalUsd,
        inputTokens: r.cost.inputTokens,
        outputTokens: r.cost.outputTokens,
        response: r.response,
        error: null,
      };
    }
    if (approach === 'bedrock-guardrails') {
      const r = await callTurn<BedrockResponse>(url, token, c.message);
      const cost = sonnetCost(r.cost.inputTokens, r.cost.outputTokens);
      return {
        ...base,
        actual: r.guardrailAction === 'GUARDRAIL_INTERVENED' ? 'BLOCKED' : 'PASSED',
        latencyMs: Date.now() - start,
        costUsd: cost,
        inputTokens: r.cost.inputTokens,
        outputTokens: r.cost.outputTokens,
        response: r.response,
        error: null,
      };
    }
    const r = await callTurn<NoGuardrailsResponse>(url, token, c.message);
    const cost = sonnetCost(r.cost.inputTokens, r.cost.outputTokens);
    return {
      ...base,
      actual: 'UNGUARDED',
      latencyMs: Date.now() - start,
      costUsd: cost,
      inputTokens: r.cost.inputTokens,
      outputTokens: r.cost.outputTokens,
      response: r.response,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      actual: 'error',
      latencyMs: Date.now() - start,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      response: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const summarize = (results: readonly CallResult[]) => {
  const byApproach: Record<Approach, CallResult[]> = {
    'no-guardrails': [],
    'bedrock-guardrails': [],
    guardian: [],
  };
  for (const r of results) byApproach[r.approach].push(r);

  const summary: Record<string, unknown> = {};
  for (const [approach, items] of Object.entries(byApproach)) {
    const latencies = [...items.map((i) => i.latencyMs)].sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    summary[approach] = {
      cases: items.length,
      errors: items.filter((i) => i.error !== null).length,
      totalCostUsd: items.reduce((sum, i) => sum + i.costUsd, 0),
      avgCostUsd: items.reduce((sum, i) => sum + i.costUsd, 0) / Math.max(items.length, 1),
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      totalInputTokens: items.reduce((sum, i) => sum + i.inputTokens, 0),
      totalOutputTokens: items.reduce((sum, i) => sum + i.outputTokens, 0),
    };
  }
  return summary;
};

const renderMarkdown = (
  results: readonly CallResult[],
  summary: Record<string, unknown>
): string => {
  const byCase = new Map<string, CallResult[]>();
  for (const r of results) {
    const list = byCase.get(r.caseId) ?? [];
    list.push(r);
    byCase.set(r.caseId, list);
  }

  const fmtCost = (n: number): string => `$${n.toFixed(5)}`;
  const lines: string[] = [];
  lines.push('# Guardian Pattern — three-way comparison');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary per approach');
  lines.push('');
  lines.push('| Approach | Cases | Errors | Total cost | Avg cost | p50 latency | p95 latency |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const approach of ['no-guardrails', 'bedrock-guardrails', 'guardian'] as const) {
    const s = summary[approach] as {
      cases: number;
      errors: number;
      totalCostUsd: number;
      avgCostUsd: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
    };
    lines.push(
      `| ${approach} | ${String(s.cases)} | ${String(s.errors)} | ${fmtCost(s.totalCostUsd)} | ${fmtCost(s.avgCostUsd)} | ${String(s.p50LatencyMs)}ms | ${String(s.p95LatencyMs)}ms |`
    );
  }
  lines.push('');
  lines.push('## Per-case results');
  lines.push('');
  lines.push(
    '| Case | Category | Expected | No-Guardrails (cost / latency) | Bedrock (verdict / cost / latency) | Guardian (verdict / cost / latency) |'
  );
  lines.push('|---|---|---|---|---|---|');
  for (const [caseId, items] of byCase) {
    const exp = items[0]?.expected ?? '';
    const cat = items[0]?.category ?? '';
    const ng = items.find((i) => i.approach === 'no-guardrails');
    const bg = items.find((i) => i.approach === 'bedrock-guardrails');
    const gp = items.find((i) => i.approach === 'guardian');
    const cell = (r: CallResult | undefined): string =>
      r ? `${r.actual} / ${fmtCost(r.costUsd)} / ${String(r.latencyMs)}ms` : '—';
    lines.push(`| ${caseId} | ${cat} | ${exp} | ${cell(ng)} | ${cell(bg)} | ${cell(gp)} |`);
  }
  return lines.join('\n');
};

const main = async (): Promise<void> => {
  const settings = await loadSettings();
  console.log(`API URL: ${settings.apiUrl}`);
  console.log(`User: ${settings.username}`);
  console.log('Authenticating with Cognito...');
  const token = await getAccessToken(settings);
  console.log(`Got access token (${String(token.length)} chars)`);

  const endpoints: Record<Approach, string> = {
    guardian: `${settings.apiUrl}/turn`,
    'bedrock-guardrails': `${settings.apiUrl}/turn-bedrock-guardrails`,
    'no-guardrails': `${settings.apiUrl}/turn-no-guardrails`,
  };

  const concurrency = Number(process.env.EVAL_CONCURRENCY ?? '6');
  console.log(
    `\nRunning ${String(EVAL_CASES.length * 3)} requests (${String(EVAL_CASES.length)} cases × 3 approaches) at concurrency ${String(concurrency)}...\n`
  );

  type Job = { readonly approach: Approach; readonly url: string; readonly c: EvalCase };
  const jobs: Job[] = [];
  for (const c of EVAL_CASES) {
    for (const approach of ['no-guardrails', 'bedrock-guardrails', 'guardian'] as const) {
      jobs.push({ approach, url: endpoints[approach], c });
    }
  }

  const results: CallResult[] = [];
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < jobs.length) {
      const idx = cursor;
      cursor += 1;
      const job = jobs[idx];
      if (!job) return;
      const result = await runOne(job.approach, job.url, token, job.c);
      results.push(result);
      const ok = result.error === null ? '✓' : '✗';
      console.log(
        `${ok} [${result.approach}] ${result.caseId} (${result.category}) → ${result.actual} (${String(result.latencyMs)}ms, $${result.costUsd.toFixed(5)})`
      );
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const summary = summarize(results);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `eval-comparison-${timestamp}.json`;
  const mdPath = `eval-comparison-${timestamp}.md`;

  writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2)
  );
  writeFileSync(mdPath, renderMarkdown(results, summary));

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nReports:\n  ${jsonPath}\n  ${mdPath}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
