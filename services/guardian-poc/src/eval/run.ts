import { writeFileSync } from 'node:fs';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../config.js';
import { loadConstitution } from '../constitution.js';
import { handleTurn, type OrchestratorDeps } from '../orchestrator.js';
import { EVAL_CASES, type EvalCase } from './cases.js';
import type { GuardianVerdict } from '../schema.js';

type CaseResult = {
  readonly id: string;
  readonly category: string;
  readonly expected: GuardianVerdict;
  readonly actual: GuardianVerdict | 'error';
  readonly match: boolean;
  readonly latencyMs: number;
};

type EvalReport = {
  readonly timestamp: string;
  readonly region: string;
  readonly guardianModelId: string;
  readonly coachModelId: string;
  readonly totalCases: number;
  readonly passed: number;
  readonly failed: number;
  readonly attackCatchRate: number;
  readonly falseRefusalRate: number;
  readonly p50LatencyMs: number;
  readonly results: readonly CaseResult[];
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const bedrock = new BedrockRuntimeClient({ region: config.region });
  const s3 = new S3Client({ region: config.region });

  const [inputConstitution, outputConstitution] = await Promise.all([
    loadConstitution(s3, config.constitutionBucket, config.constitutionInputKey),
    loadConstitution(s3, config.constitutionBucket, config.constitutionOutputKey),
  ]);

  const deps: OrchestratorDeps = {
    guardian: { bedrock, modelId: config.guardianModelId },
    coach: { bedrock, modelId: config.coachModelId },
    inputConstitution,
    outputConstitution,
    forceFailClosed: false,
  };

  console.log(`Running ${String(EVAL_CASES.length)} eval cases...`);
  const results = await Promise.all(EVAL_CASES.map((c) => runCase(deps, c)));

  const report = buildReport(config, results);
  const outPath = `eval-report-${new Date().toISOString()}.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outPath}`);
  console.log(`Passed: ${report.passed.toString()}/${report.totalCases.toString()}`);
  console.log(`Attack-catch rate: ${report.attackCatchRate.toFixed(2)}`);
  console.log(`False-refusal rate: ${report.falseRefusalRate.toFixed(2)}`);
  console.log(`p50 latency: ${report.p50LatencyMs.toString()}ms`);
};

const runCase = async (deps: OrchestratorDeps, c: EvalCase): Promise<CaseResult> => {
  const start = Date.now();
  try {
    const result = await handleTurn(deps, c.message);
    const actual = result.inputVerdict.verdict;
    return {
      id: c.id,
      category: c.category,
      expected: c.expectedVerdict,
      actual,
      match: actual === c.expectedVerdict,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    console.error(`Case ${c.id} errored:`, error);
    return {
      id: c.id,
      category: c.category,
      expected: c.expectedVerdict,
      actual: 'error',
      match: false,
      latencyMs: Date.now() - start,
    };
  }
};

const buildReport = (
  config: ReturnType<typeof loadConfig>,
  results: readonly CaseResult[]
): EvalReport => {
  const passed = results.filter((r) => r.match).length;
  const attacks = results.filter((r) => r.expected !== 'pass');
  const attackCaught = attacks.filter((r) => r.match).length;
  const harmless = results.filter((r) => r.expected === 'pass');
  const falseRefusals = harmless.filter((r) => r.actual !== 'pass').length;
  const latencies = [...results.map((r) => r.latencyMs)].sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;

  return {
    timestamp: new Date().toISOString(),
    region: config.region,
    guardianModelId: config.guardianModelId,
    coachModelId: config.coachModelId,
    totalCases: results.length,
    passed,
    failed: results.length - passed,
    attackCatchRate: attacks.length > 0 ? attackCaught / attacks.length : 0,
    falseRefusalRate: harmless.length > 0 ? falseRefusals / harmless.length : 0,
    p50LatencyMs: p50,
    results,
  };
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
