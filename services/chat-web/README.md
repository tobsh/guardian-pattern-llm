# guardian-demo chat web

Minimal ChatGPT-like chat frontend for the guardian-demo Guardian. Next.js 15 App Router, static export, Cognito Hosted UI, talks to the private Guardian API over HTTPS with a Cognito JWT.

## What it does

- Single chat page — greeting + scrolling message thread + input box
- Cognito Hosted UI login on first visit (no custom login form)
- `POST /turn` to the Guardian API with `Authorization: Bearer <access_token>`
- Fail-closed rendering if the Guardian returns `failedClosed: true`
- Prompt-injection responses render the `sanitize` message, not the raw JSON
- Optional Guardian verdict panel under each assistant message (dev mode only, toggled by `NEXT_PUBLIC_SHOW_VERDICT=true`)

## What it does NOT do (out of scope for #3)

- Persist chat history across sessions
- Stream responses (see #3 decision log for why)
- Markdown / code blocks
- Multiple conversations, sidebar, search
- Mobile-native wrapper
- Dark mode, i18n (German only for now)
- Persona Setup Agent — hardcoded `Coach` / `Lisa` until TM-ARCH-003 §2 lands

## Local dev

```bash
cp .env.local.example .env.local
# fill with real values from CloudFormation:
#   aws cloudformation describe-stacks --region eu-central-1 --stack-name GuardianDemoAuthStack
#   aws cloudformation describe-stacks --region eu-central-1 --stack-name GuardianDemoGuardianPocStack
pnpm chat:dev
```

Then visit `http://localhost:3000` — you'll be redirected to Cognito Hosted UI, log in with your test user (create one via the commands in [services/guardian-poc/README.md](../guardian-poc/README.md)), and come back to the chat page.

## Build (static export)

```bash
pnpm chat:build
# produces services/chat-web/out/ — a plain static site ready for S3 + CloudFront
```

The CI deploy workflow does this automatically after the backend stacks deploy, pulling fresh Cognito + API values from CloudFormation outputs.

## Architecture

```
Browser ──▶ CloudFront (HTTPS + TLS 1.2+, OAC) ──▶ S3 (private, versioned, SSE)

Browser ──▶ Cognito Hosted UI (PKCE, code flow) ──▶ gets ID + access tokens

Browser + access token ──▶ Guardian HTTP API (JWT authorizer) ──▶ Lambda ──▶ Bedrock
```

See the repo root README for the full system diagram.
