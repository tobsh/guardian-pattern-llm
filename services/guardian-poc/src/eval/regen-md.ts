/**
 * Regenerate the markdown comparison report from an existing JSON file.
 * Useful after the markdown template changes — avoids re-running the eval
 * (which costs money and tokens).
 *
 * Usage:
 *   tsx src/eval/regen-md.ts <path-to-eval-comparison-*.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { EVAL_CASES } from './cases.js';

type Result = {
  approach: 'no-guardrails' | 'bedrock-guardrails' | 'guardian';
  caseId: string;
  category: string;
  expected: string;
  actual: string;
  latencyMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  response: string;
  error: string | null;
};

type Report = {
  generatedAt: string;
  summary: Record<string, unknown>;
  results: Result[];
};

const main = (): void => {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: tsx src/eval/regen-md.ts <path-to-eval-comparison.json>');
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(inputPath, 'utf8')) as Report;

  const fmtCost = (n: number): string => `$${n.toFixed(5)}`;
  const truncate = (s: string, max = 1500): string =>
    s.length > max ? `${s.slice(0, max)}\n\n_…truncated (${String(s.length)} chars total)_` : s;

  const byCase = new Map<string, Result[]>();
  for (const r of report.results) {
    const list = byCase.get(r.caseId) ?? [];
    list.push(r);
    byCase.set(r.caseId, list);
  }

  const lines: string[] = [];
  lines.push('# Guardian Pattern — three-way comparison');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary per approach');
  lines.push('');
  lines.push('| Approach | Cases | Errors | Total cost | Avg cost | p50 latency | p95 latency |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const approach of ['no-guardrails', 'bedrock-guardrails', 'guardian'] as const) {
    const s = report.summary[approach] as {
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
  lines.push('| Case | Category | Expected | No-Guardrails | Bedrock | Guardian |');
  lines.push('|---|---|---|---|---|---|');
  for (const [caseId, items] of byCase) {
    const exp = items[0]?.expected ?? '';
    const cat = items[0]?.category ?? '';
    const cell = (a: Result['approach']): string => {
      const r = items.find((i) => i.approach === a);
      return r ? `${r.actual} / ${fmtCost(r.costUsd)} / ${String(r.latencyMs)}ms` : '—';
    };
    lines.push(
      `| ${caseId} | ${cat} | ${exp} | ${cell('no-guardrails')} | ${cell('bedrock-guardrails')} | ${cell('guardian')} |`
    );
  }

  lines.push('');
  lines.push('## Full responses per case');
  lines.push('');
  for (const [caseId, items] of byCase) {
    const prompt = EVAL_CASES.find((c) => c.id === caseId)?.message ?? '';
    const exp = items[0]?.expected ?? '';
    lines.push(`### \`${caseId}\` — expected: \`${exp}\``);
    lines.push('');
    lines.push('**Prompt:**');
    lines.push('');
    lines.push(`> ${prompt}`);
    lines.push('');
    for (const approach of ['no-guardrails', 'bedrock-guardrails', 'guardian'] as const) {
      const r = items.find((i) => i.approach === approach);
      if (!r) continue;
      lines.push(
        `**${approach}** → \`${r.actual}\` · ${fmtCost(r.costUsd)} · ${String(r.latencyMs)}ms`
      );
      lines.push('');
      if (r.error !== null) {
        lines.push(`> ⚠️ error: ${r.error}`);
      } else if (r.response.length > 0) {
        lines.push('```');
        lines.push(truncate(r.response));
        lines.push('```');
      } else {
        lines.push('_(empty response)_');
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  const outputPath = inputPath.replace(/\.json$/, '.md');
  writeFileSync(outputPath, lines.join('\n'));
  console.log(`Wrote ${outputPath}`);
};

main();
