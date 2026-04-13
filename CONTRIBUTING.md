# Contributing

Thanks for your interest. This repo is a **proof of concept**, not a production system. PRs that keep it small, clear, and reproducible are very welcome.

## What kinds of changes fit

- Bug fixes in the Lambda handlers, CDK stacks, or chat UI
- Extra test cases that catch real edge cases
- README / docs clarifications that help first-time deployers
- New example prompts for the `writing/` article (German or English)
- Ports of the constitution to a different regulated domain (health, legal, HR)

## What kinds of changes don't fit

- "Productionizing" it (K8s, Terraform rewrites, multi-region, etc.) — that belongs in a separate repo
- New UI frameworks, CSS overhauls — the UI is intentionally minimal
- Swapping the models for non-Bedrock providers — the comparison with Bedrock Guardrails is the point

## Dev setup

See the [README](./README.md) for full setup. For contributing specifically:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

All three must pass before a PR merges.

## Commit style

Conventional Commits. Keep subjects short (≤ 60 chars), imperative, and specific:

```
feat(guardian): add output-phase red_flag_risk threshold
fix(chat-web): scroll containers broke in 3-column layout
docs(readme): clarify Bedrock model access steps
test(bedrock-guardrails): cover trace surfacing path
```

## Fork and deploy

The infrastructure assumes you're deploying into **your own AWS account**. Set these env vars before `cdk deploy` so GitHub OIDC trust and resource tags point at your fork:

```bash
export GITHUB_ORG=<your-github-org>
export GITHUB_REPO=<your-repo-name>
export OWNER_TAG=<cost-allocation-tag>
```

See [infrastructure/bin/app.ts](./infrastructure/bin/app.ts) for what each one controls.

## Code of conduct

Be kind. Disagree about ideas, not people. If something feels off, open an issue and we'll talk.
