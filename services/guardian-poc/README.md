# Guardian PoC

Proof-of-concept for the **Guardian Layer** described in [TM-ARCH-003](../../docs/pdf/TM-ARCH-003-guardian-and-persona.pdf). Implements a small constitutional classifier (Haiku 4.5) that gates user input and coach output, with fail-closed fallback behavior.

Tracking issue: [#1](https://github.com/tobsh/guardian-demo/issues/1)

## Models (EU-pinned)

| Role            | Model               | Region         |
| --------------- | ------------------- | -------------- |
| Guardian In/Out | `claude-haiku-4-5`  | `eu-central-1` |
| Coach (stub)    | `claude-sonnet-4-6` | `eu-central-1` |

All Bedrock calls use EU inference profiles — no cross-region routing.

## Architecture

```
User → Lambda → Guardian-In (Haiku) → Coach (Sonnet, stub) → Guardian-Out (Haiku) → User
                     │                                              │
                     └── refuse / escalate / sanitize               └── refuse / sanitize
                                         │
                                         ▼
                         deterministic template / fail-closed
```

Constitutions live in a versioned S3 bucket (`guardian/constitution.{input,output}.yaml`). Every change goes through PR review → deploy → new S3 object version.

## Local dev

```bash
pnpm install
pnpm guardian:lint
pnpm guardian:typecheck
pnpm guardian:test:coverage
```

## Eval

Requires deployed stack and AWS credentials.

```bash
AWS_REGION=eu-central-1 \
GUARDIAN_MODEL_ID=eu.anthropic.claude-haiku-4-5-20251001-v1:0 \
COACH_MODEL_ID=eu.anthropic.claude-sonnet-4-6 \
CONSTITUTION_BUCKET=guardian-demo-guardian-constitution-<account-id> \
pnpm guardian:eval
```

Emits `eval-report-<timestamp>.json` with attack-catch rate, false-refusal rate, p50 latency per TM-ARCH-003 §1.7 KPIs.

## Deploy

CI auto-deploys on push to `main` via GitHub OIDC. For manual local deploy:

```bash
pnpm infra:synth
pnpm infra:deploy
```

## Fail-closed

Set `FORCE_FAIL_CLOSED=true` on the Lambda to simulate Guardian-down and verify the template response. Any Bedrock/S3 error also triggers fail-closed automatically.

## Authentication — the API is private

The `/turn` endpoint is gated by a Cognito JWT authorizer. There is **no public path**. Every request must carry a valid access token from the `GuardianDemoAuthStack` Cognito User Pool, issued to one of the allowed app clients (Web, MCP, CLI).

Tracking issue: [#2](https://github.com/tobsh/guardian-demo/issues/2)

### Create a test user (one-time)

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --region eu-central-1 --stack-name GuardianDemoAuthStack \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

aws cognito-idp admin-create-user \
  --region eu-central-1 \
  --user-pool-id "$USER_POOL_ID" \
  --username you@example.com \
  --temporary-password 'TempPass123!$' \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
```

On first login Cognito forces a password change. For a CLI-based first login:

```bash
CLI_CLIENT_ID=$(aws cloudformation describe-stacks \
  --region eu-central-1 --stack-name GuardianDemoAuthStack \
  --query "Stacks[0].Outputs[?OutputKey=='CliClientId'].OutputValue" --output text)

# 1. Initiate auth (returns a session token for the forced password change)
aws cognito-idp initiate-auth --region eu-central-1 \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLI_CLIENT_ID" \
  --auth-parameters USERNAME=you@example.com,PASSWORD='TempPass123!$'

# 2. Respond to NEW_PASSWORD_REQUIRED with a real password
aws cognito-idp respond-to-auth-challenge --region eu-central-1 \
  --client-id "$CLI_CLIENT_ID" \
  --challenge-name NEW_PASSWORD_REQUIRED \
  --session '<session-from-step-1>' \
  --challenge-responses USERNAME=you@example.com,NEW_PASSWORD='YourRealPassword123!$'
```

### Call `/turn` with a valid JWT

```bash
ACCESS_TOKEN=$(aws cognito-idp initiate-auth --region eu-central-1 \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLI_CLIENT_ID" \
  --auth-parameters USERNAME=you@example.com,PASSWORD='YourRealPassword123!$' \
  --query 'AuthenticationResult.AccessToken' --output text)

API_URL=$(aws cloudformation describe-stacks \
  --region eu-central-1 --stack-name GuardianDemoGuardianPocStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)

curl -X POST "$API_URL/turn" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Ich will mit leichtem Gehen anfangen."}'
```

Without the `Authorization` header (or with an expired/invalid token), the API returns **401 Unauthorized** before the Lambda is ever invoked.
