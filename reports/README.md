# Reports

Generated artifacts from the three-way comparison eval. These are committed snapshots — the local generator (`pnpm guardian:eval:compare`) emits fresh files in `services/guardian-poc/` on every run; only the curated PDFs land here.

## Available reports

| File                                                                 | Date       | Cases | Approaches                                  |
| -------------------------------------------------------------------- | ---------- | ----: | ------------------------------------------- |
| [`eval-comparison-2026-04-13.pdf`](./eval-comparison-2026-04-13.pdf) | 2026-04-13 |    17 | no-guardrails, bedrock-guardrails, guardian |

## How a report is produced

```bash
COGNITO_USERNAME=you@example.com \
COGNITO_PASSWORD='your-permanent-password' \
pnpm guardian:eval:compare
```

The script:

1. Auto-discovers `API_URL`, `COGNITO_USER_POOL_ID`, and `COGNITO_CLI_CLIENT_ID` from the deployed CloudFormation stacks.
2. Authenticates with Cognito (`USER_PASSWORD_AUTH`).
3. Fires every case in [`services/guardian-poc/src/eval/cases.ts`](../services/guardian-poc/src/eval/cases.ts) against all three deployed Lambdas via API Gateway, paced by a bounded worker pool (`EVAL_CONCURRENCY`, default 6).
4. Writes `eval-comparison-<timestamp>.{json,md}` in `services/guardian-poc/`.

To rebuild the markdown from the JSON without re-running the eval:

```bash
cd services/guardian-poc
pnpm exec tsx src/eval/regen-md.ts eval-comparison-<timestamp>.json
```

To convert markdown to PDF (requires `pandoc` and Google Chrome):

```bash
cd services/guardian-poc
pandoc -f gfm -t html5 --standalone --embed-resources \
  --metadata title="Guardian Pattern — Three-Way Comparison" \
  eval-comparison-<timestamp>.md \
  -o /tmp/eval.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=eval-comparison-<timestamp>.pdf \
  file:///tmp/eval.html
```
