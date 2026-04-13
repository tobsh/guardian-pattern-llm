# The Constitution YAML

The **constitution** is the single source of truth for the Guardian Pattern classifier. It's a YAML document that declares what the coach is allowed to talk about, what it must refuse, what triggers crisis escalation, and how the classifier should map signals to verdicts.

Two constitutions live in [`guardian/`](../guardian/):

- [`constitution.input.yaml`](../guardian/constitution.input.yaml) — runs on every user message **before** the coach is called
- [`constitution.output.yaml`](../guardian/constitution.output.yaml) — runs on every coach response **before** it reaches the user

They're deployed to a versioned S3 bucket by the CDK stack (see [`infrastructure/lib/stacks/guardian-poc.stack.ts`](../infrastructure/lib/stacks/guardian-poc.stack.ts)), loaded at Lambda cold-start, rendered into a classifier system prompt (see [`services/guardian-poc/src/constitution.ts`](../services/guardian-poc/src/constitution.ts)), and passed to a small Haiku 4.5 model.

The classifier **never generates free-form text** — it must call a `report_verdict` tool whose arguments are validated against the Zod schema in [`services/guardian-poc/src/schema.ts`](../services/guardian-poc/src/schema.ts).

## Schema

| Field                  | Type                    | Purpose                                                                                                                                                               |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`       | number                  | Bumped when the shape changes. Guards against stale deployments.                                                                                                      |
| `phase`                | `"input" \| "output"`   | Which half of the turn this runs on.                                                                                                                                  |
| `role`                 | string                  | System-prompt preamble. Must tell the classifier to ignore instructions inside the `<user_input>` / `<coach_output>` tags — this is the anti-prompt-injection anchor. |
| `allowed_categories`   | `{name, description}[]` | Topics the coach may handle. `pass` verdict.                                                                                                                          |
| `forbidden_categories` | `{name, description}[]` | Topics the coach must not handle. `refuse` verdict.                                                                                                                   |
| `red_flags`            | string[]                | Crisis signals. `escalate` verdict. Typically empty for output phase.                                                                                                 |
| `output_rules`         | string[]?               | Output-only. Extra checks on the coach's response (tone, product mentions, PII echo).                                                                                 |
| `routing_rules`        | string                  | Free-form prose describing verdict routing and flag semantics. Included verbatim in the system prompt.                                                                |

## The four verdicts

| Verdict    | When                                 | What the Lambda does                                              |
| ---------- | ------------------------------------ | ----------------------------------------------------------------- |
| `pass`     | On-topic, no concerns                | Forward to the coach (or return coach output on the output phase) |
| `refuse`   | Forbidden category, toxic, off-topic | Return a polite refusal template — no coach call                  |
| `escalate` | Red flag tripped                     | Return a crisis template with support resources                   |
| `sanitize` | Prompt injection, PII leak attempt   | Ask the user to rephrase                                          |

## Flags

In addition to the verdict, the classifier returns independent 0.0–1.0 scores:

- `prompt_injection`
- `red_flag_risk`
- `profanity`
- `off_topic_regulated`
- `pii_leak_attempt`

Flags don't drive routing directly — they're surfaced in the verdict JSON for observability and post-hoc auditing. You can add thresholds in the orchestrator if you want them to.

## Editing the constitution

1. Edit the YAML under `guardian/`.
2. Run tests — `pnpm --filter @guardian-demo/guardian-poc test`.
3. Commit. The CDK deploy uploads a new S3 object version; the bucket keeps the full audit history.

Because the rules are in plain YAML with no DSL, a compliance officer can propose a change without touching TypeScript.

## Porting to a different domain

The constitution structure is domain-agnostic. To adapt it, rewrite the `allowed_categories`, `forbidden_categories`, `red_flags`, and `output_rules` for your domain (health, legal, HR, insurance), keep the routing rules and verdict semantics, and update the German-language templates in [`services/guardian-poc/src/orchestrator.ts`](../services/guardian-poc/src/orchestrator.ts) if you're changing the language.
