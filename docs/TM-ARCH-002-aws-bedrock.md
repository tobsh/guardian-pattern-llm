# guardian-demo Cardio Coach — Concrete AWS Architecture
## Bedrock AgentCore + Bedrock, Compliance & Security by Design

> Concrete realization of [`TM-ARCH-001-architecture.md`](./TM-ARCH-001-architecture.md) on AWS, using
> **Amazon Bedrock** (Claude models) and **Bedrock AgentCore** (managed agent
> runtime, memory, gateway, identity, observability) — designed against
> GDPR, BSI C5, and ISO 27001 expectations for a German clinical-adjacent
> coaching product.

---

## 0. TL;DR

- **Bedrock AgentCore Runtime** hosts the orchestrator agent (serverless, session-isolated).
- **Bedrock Knowledge Bases** = the curated Layer-1 KB, backed by **OpenSearch Serverless** (vector) + **S3** (source documents).
- **Bedrock Guardrails** = first line of input/output filtering (PII, denied topics, contextual grounding).
- **AgentCore Gateway** wraps tools (Rule Engine, User Context, Escalation) as MCP endpoints with IAM-scoped access.
- **AgentCore Identity + Cognito** handle end-user auth and per-session credential isolation.
- **AgentCore Memory** holds short-term conversation state; long-term clinical state lives in **Aurora PostgreSQL (pgvector optional, KMS-encrypted)**.
- **EU-only**: every component pinned to `eu-central-1` (Frankfurt), with Bedrock cross-region inference disabled or scoped to EU.
- **Defense in depth**: VPC isolation, PrivateLink to Bedrock, KMS CMKs, CloudTrail + GuardDuty + Security Hub, Config conformance pack for HIPAA/C5.

---

## 1. Logical → AWS Mapping

| Logical component (from `TM-ARCH-001-architecture.md`) | AWS service |
|---|---|
| API Gateway / BFF | **API Gateway (HTTP API)** + **Lambda authorizer** + **Cognito User Pool** |
| Input guardrails | **Bedrock Guardrails** (PII, denied topics, prompt-attack) + custom Lambda for red-flag/symptom detection |
| Coach Orchestrator (state machine) | **Bedrock AgentCore Runtime** running a Strands/LangGraph agent in a container |
| Rule Engine | **Lambda** (TS) exposed as a tool via **AgentCore Gateway** (MCP) |
| User Context Service | **Lambda** + **Aurora PostgreSQL Serverless v2** (KMS-encrypted), exposed via Gateway |
| Knowledge Base + RAG | **Bedrock Knowledge Bases** → **OpenSearch Serverless (vector)** ← **S3 (KB sources, versioned, Object Lock)** |
| Grounded LLM call | **Bedrock InvokeModel** — `anthropic.claude-opus-4-6` (quality) / `anthropic.claude-haiku-4-5` (cheap), EU inference profile |
| Output guardrails | **Bedrock Guardrails contextual grounding** + custom Lambda validators (schema, NLI, tone) |
| Response Assembler | Agent post-processing step in AgentCore Runtime |
| Audit Log | **CloudWatch Logs** (KMS) + **S3 (Object Lock, WORM)** via **Kinesis Firehose** |
| Eval Harness | **Bedrock Model Evaluation** + **CodeBuild** + **promptfoo** in CI |
| Observability | **AgentCore Observability** → **CloudWatch** + **X-Ray** + **OpenTelemetry** |
| Secrets | **Secrets Manager** + **KMS CMK** |
| Network | **VPC** + **PrivateLink** endpoints for Bedrock, S3, Secrets Manager, CloudWatch |

---

## 2. Concrete Topology

```
                          ┌──────────────────────────┐
                          │  User (Web / Mobile App) │
                          └─────────────┬────────────┘
                                        │ HTTPS (TLS 1.3)
                                        ▼
                          ┌──────────────────────────┐
                          │  CloudFront + WAF        │  ── AWS Managed Rules
                          │  (rate-limit, geo, OWASP)│     + Bot Control
                          └─────────────┬────────────┘
                                        │
                          ┌─────────────▼────────────┐
                          │  API Gateway (HTTP API)  │
                          │  + Cognito JWT authorizer│
                          └─────────────┬────────────┘
                                        │
                          ┌─────────────▼────────────┐
                          │ Lambda: BFF / Edge        │
                          │  • PII pre-scrub          │
                          │  • Session resolve        │
                          │  • Idempotency keys       │
                          └─────────────┬────────────┘
                                        │ invoke (sync)
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │              Bedrock AgentCore Runtime                    │
        │  ┌─────────────────────────────────────────────────────┐  │
        │  │  Coach Agent (Strands / LangGraph in container)     │  │
        │  │   1. Apply Bedrock Guardrail (input)                │  │
        │  │   2. Red-flag Lambda tool  ──► escalation branch    │  │
        │  │   3. State machine step                             │  │
        │  │   4. Rule Engine tool (via Gateway/MCP)             │  │
        │  │   5. Retrieve from Bedrock Knowledge Base           │  │
        │  │   6. InvokeModel (Claude, low temp, JSON schema)    │  │
        │  │   7. Apply Bedrock Guardrail (output, grounding)    │  │
        │  │   8. Custom output validators (Lambda)              │  │
        │  │   9. Assemble response + ui_hints                   │  │
        │  └─────────────────────────────────────────────────────┘  │
        │   AgentCore Memory (short-term) │ AgentCore Identity      │
        │   AgentCore Observability  ─────┴─► CloudWatch + X-Ray    │
        └───────────────┬───────────────────────────────┬───────────┘
                        │                               │
            ┌───────────▼────────────┐     ┌────────────▼─────────────┐
            │  AgentCore Gateway     │     │  Bedrock Knowledge Bases │
            │  (MCP tool endpoints)  │     │   ├─ S3 (KB sources,     │
            │   • rule_engine        │     │   │   Object Lock, KMS)  │
            │   • user_context       │     │   └─ OpenSearch          │
            │   • escalation_router  │     │       Serverless (vec)   │
            │   • content_lookup     │     └──────────────────────────┘
            └───────────┬────────────┘
                        │ IAM-scoped invoke
        ┌───────────────┼─────────────────┬──────────────────┐
        ▼               ▼                 ▼                  ▼
  ┌──────────┐    ┌──────────┐     ┌────────────┐    ┌────────────────┐
  │ Lambda:  │    │ Lambda:  │     │ Lambda:    │    │ Lambda:        │
  │ Rule     │    │ User     │     │ Escalation │    │ Content        │
  │ Engine   │    │ Context  │     │ Router     │    │ Lookup         │
  └────┬─────┘    └────┬─────┘     └────┬───────┘    └───┬────────────┘
       │               │                │                 │
       ▼               ▼                ▼                 ▼
  ┌──────────┐    ┌────────────────────────────┐    ┌────────────┐
  │ S3 rules │    │ Aurora PostgreSQL          │    │ S3 media   │
  │ (versn'd)│    │ Serverless v2 (KMS, VPC)   │    │ metadata   │
  └──────────┘    │ • profiles, goals, streaks │    └────────────┘
                  │ • clinical flags (Arzt-set)│
                  │ • audit references         │
                  └────────────────────────────┘

  ───── All inter-service traffic: VPC + PrivateLink, no public egress ─────
```

---

## 3. Component Detail

### 3.1 Edge & Auth
- **CloudFront + AWS WAF**: managed rule groups (Core, KnownBadInputs, AnonIPList), Bot Control, rate-based rules, geo allow-list (DE/EU).
- **API Gateway HTTP API**: TLS 1.3 only, custom domain via ACM cert (EU region).
- **Amazon Cognito User Pool**: passwordless / OIDC; MFA optional for clinicians, mandatory for admin.
- **Lambda authorizer**: validates JWT, injects `subject_id`, enforces tenant scoping.

### 3.2 BFF Lambda
- Strips obvious PII before anything is logged (regex + Comprehend PII detect for DE).
- Generates idempotency key, opens X-Ray segment, calls AgentCore Runtime via VPC endpoint.
- Never logs raw user text outside the audit pipeline.

### 3.3 Bedrock AgentCore Runtime
- Hosts the **Coach Agent** as a container (Strands SDK or LangGraph), one session per user turn — AgentCore guarantees **session isolation in microVMs**.
- Configured with:
  - **AgentCore Identity** for per-session AWS credentials → tools see only that user's data.
  - **AgentCore Memory** for short-term conversational context (cleared on session end). Long-term state is *not* in AgentCore Memory; it lives in Aurora behind the User Context tool, so PII boundaries are explicit.
  - **AgentCore Observability**: traces, metrics, and tool-call spans exported to CloudWatch + X-Ray with OTel.
- Cold-start mitigated by provisioned concurrency on the underlying runtime.

### 3.4 Bedrock Guardrails (input + output)
Two separate Guardrail configurations:

**Input guardrail** (applied to user message before agent reasoning):
- **Denied topics**: `Diagnose stellen`, `Medikamente empfehlen`, `Dosierung`, `Laborwert-Interpretation`, `Notfall-Selbstbehandlung`.
- **Sensitive information filters**: PII (NAME, EMAIL, PHONE, ADDRESS) → ANONYMIZE.
- **Prompt attack filter**: HIGH.
- **Word filters**: profanity, competitor names.

**Output guardrail** (applied to model response):
- **Contextual grounding check**: enforces the model's answer is grounded in retrieved KB passages; fail threshold tuned to be conservative.
- **Relevance check**: response must answer the user's actual question.
- **Same denied-topic filters**: belt-and-braces.

Guardrail violations are first-class events: logged, surfaced as a metric, and trigger the deterministic fallback template.

### 3.5 Custom Red-Flag Detector (Lambda tool)
- Bedrock Guardrails do not understand cardiology — a small Lambda runs a domain classifier (rules + small fine-tuned model) for symptoms like *Brustschmerz, Atemnot, Synkope*.
- On hit → AgentCore agent jumps directly to the **Escalation Router** tool, skipping the LLM entirely. Response is a deterministic German template that points to Arzt/Notruf.

### 3.6 Rule Engine (Lambda + S3)
- Rules in YAML in a versioned S3 bucket (Object Lock + KMS), promoted via CI after clinical review.
- Lambda loads + caches the active version, evaluates against the user-context projection, returns a structured *intent*.
- The agent **must** call this tool before any LLM rendering for coaching turns.

### 3.7 User Context Service (Lambda + Aurora)
- Aurora PostgreSQL Serverless v2 in private subnets, KMS CMK, IAM auth.
- Schema: `users`, `goals`, `streaks`, `clinical_flags`, `consents`, `audit_refs`.
- The Lambda only ever returns the **whitelisted projection** the agent is allowed to see — never raw rows.
- Row-level isolation enforced by `subject_id` from AgentCore Identity.

### 3.8 Bedrock Knowledge Bases
- **Source bucket**: S3, versioned, Object Lock (governance), KMS CMK, access logging.
- **Ingestion pipeline**: clinical owner approves a new doc → CodePipeline runs ingestion → Bedrock KB re-indexes → eval suite runs → promotion gate.
- **Vector store**: OpenSearch Serverless (collection in EU), encrypted at rest, no public access.
- **Chunking**: semantic chunking, multilingual embeddings (`cohere.embed-multilingual-v3` via Bedrock or `amazon.titan-embed-text-v2`).
- **Metadata filters**: `language`, `topic` (`bewegung|ernaehrung|rauchfrei`), `level`, `clinical_review_date`, `version`.
- The agent passes filters at retrieve-time, e.g. `language=de AND topic=bewegung AND clinical_review_date >= 2025-01-01`.

### 3.9 Bedrock Model Invocation
- Models pinned to **EU inference profile** (Frankfurt + Paris/Ireland), cross-region inference disabled outside EU.
- `anthropic.claude-opus-4-6` for nuanced coaching turns; `anthropic.claude-haiku-4-5` for cheap classification/short replies.
- `temperature=0.3`, `max_tokens` tightly bounded, **JSON output schema enforced** via Bedrock's tool-use / response-format.
- **Model invocation logging** enabled → S3 (KMS, Object Lock) — required for auditability.

### 3.10 Custom Output Validators (Lambda)
After Bedrock Guardrail output check, an additional Lambda runs:
- JSON schema validation,
- citation presence (every claim → `cited_snippet_id`),
- optional NLI entailment via a small Bedrock model call,
- tone/readability heuristics,
- profile-leakage check.

On failure → one regenerate attempt with a stricter prompt → else deterministic template fallback.

### 3.11 Audit Log
- Every turn emits a structured event: `{request_id, subject_id_hash, state, rules_fired, kb_snippet_ids, guardrail_verdicts, model_id, latency_ms, final_template_or_llm}`.
- Path: Lambda → **Kinesis Firehose** → **S3 (Object Lock, WORM, KMS)**, retention per DSGVO + medical-device guidance.
- Mirrored to **CloudWatch Logs** for live ops; Logs are KMS-encrypted with a dedicated CMK.

### 3.12 Eval Harness
- **Bedrock Model Evaluation** for built-in metrics + a custom dataset.
- **promptfoo** in CodeBuild for red-team + golden sets, gated on PRs that touch prompts/KB.
- Drift monitor: weekly scheduled run, results to CloudWatch dashboard, regressions page on-call.

---

## 4. Security by Design

### 4.1 Network
- All Lambdas in **private subnets**; no NAT for AI path.
- **VPC Interface Endpoints (PrivateLink)** for: `bedrock-runtime`, `bedrock-agentcore`, `bedrock-agent-runtime`, `s3`, `secretsmanager`, `kms`, `logs`, `xray`, `sts`.
- Outbound to internet **denied** for all AI-path components; egress only via explicit allow-list NAT for non-AI services if any.
- Aurora and OpenSearch Serverless reachable only via VPC endpoints + SG.

### 4.2 Identity & Access
- **Least privilege IAM** per Lambda; no `*` actions, resource ARNs scoped.
- **AgentCore Identity** issues per-session credentials so a tool call can only touch the calling user's data (`subject_id` claim required).
- Cognito advanced security on; admin console behind SSO + MFA + IP allow-list.
- Break-glass role separated, MFA-gated, monitored by EventBridge → SNS.

### 4.3 Encryption
- **KMS CMKs per data domain**: `kb`, `user_data`, `audit`, `secrets`. Key policies restrict by role and source VPC endpoint.
- TLS 1.3 enforced everywhere; HSTS at CloudFront.
- Aurora: encrypted at rest, in transit, automated backups encrypted, performance insights encrypted.
- S3: SSE-KMS, bucket policies deny non-TLS, deny non-KMS PutObject, block public access.

### 4.4 Secrets
- No secrets in env vars beyond ARNs.
- Secrets Manager with automatic rotation; access via VPC endpoint + IAM.

### 4.5 Threat detection & response
- **GuardDuty** (incl. Malware Protection for Lambda, S3), **Security Hub** with CIS / AWS Foundational / NIST 800-53 standards, **AWS Config** with conformance pack for HIPAA / BSI C5 mappings.
- **CloudTrail** org-wide, log-file validation, KMS-encrypted, separate log-archive account.
- **Detective** for incident triage (optional).
- EventBridge rules → SNS → on-call for critical findings.

### 4.6 Application security
- WAF managed rules + custom rate-limit on chat endpoint.
- Input length cap, request timeout, idempotency keys to prevent replay.
- Dependency scanning (CodeArtifact + Inspector), SAST in CI, container scanning for AgentCore image.
- Prompt-injection filter via Bedrock Guardrails *plus* a deny-list in the Lambda BFF.

---

## 5. Compliance by Design

### 5.1 GDPR / DSGVO
- **Data residency**: every service pinned to `eu-central-1` (with eligible failover only inside EU). Bedrock cross-region inference restricted to EU profiles.
- **Lawful basis & consent** captured at onboarding, stored in `consents` table, version-pinned.
- **Data minimization**: only the whitelisted projection reaches the LLM; raw PII never leaves the user-context boundary.
- **Right to access / erasure**: a Step Functions workflow purges across Aurora, S3 (with Object Lock governance bypass via dual-control), audit log (hash-only for the affected subject), and Bedrock KB (only if user content was ever ingested — by design it isn't).
- **DPA** with AWS in place; AWS is processor, guardian-demo is controller.
- **DPIA** required given health-adjacent context — template included in `/docs/dpia/` (next step).

### 5.2 BSI C5 / ISO 27001 alignment
- Config conformance pack mapped to C5 controls; deviations tracked in Security Hub.
- Quarterly access reviews (IAM Access Analyzer + manual sign-off).
- Change management via CodePipeline with mandatory approvals on prod stage.
- Backup & DR: Aurora PITR, S3 cross-AZ, runbooks tested quarterly.

### 5.3 Medical device / MDR considerations
- The system is **explicitly positioned as a coaching/lifestyle tool, not a medical device**. The architecture's hard refusals (no diagnosis, no drugs, no lab interpretation) are part of the regulatory boundary.
- If scope ever shifts toward diagnosis/treatment support, the architecture would need MDR Class IIa assessment — flagged in risk register.

### 5.4 Auditability
- Every user-visible message has a deterministic trail: `request_id → guardrail verdicts → tool calls → kb snippet ids → model invocation log → final response`.
- Bedrock model invocation logging + AgentCore Observability + Firehose-to-S3 audit gives 3 independent records.

---

## 6. Environments & Delivery

| Env | Purpose | Notes |
|---|---|---|
| `dev` | Engineering | Synthetic data only, separate AWS account |
| `staging` | Clinical review + eval | Anonymized realistic data, full guardrails on |
| `prod` | Live | Manual approval gate, change-freeze windows |

- **AWS Organizations** with separate accounts per env + dedicated `log-archive` and `security` accounts.
- **CDK (TypeScript)** for all infra; one stack per bounded context (`network`, `data`, `agent`, `kb`, `observability`, `security`).
- **CodePipeline + CodeBuild**; PRs run unit tests, SAST, prompt-eval; main branch deploys to `dev` automatically, `staging` on tag, `prod` on manual approval.

---

## 7. Cost Levers

- Use **Haiku** for cheap turns (classification, small talk acks); **Opus** only for nuanced coaching renders.
- **Provisioned concurrency** only on the hot Lambda paths.
- **OpenSearch Serverless OCU** sized to KB size; scale to zero out of hours on dev.
- **S3 Intelligent-Tiering** for KB sources and audit archive.
- **Bedrock Knowledge Bases** charged per ingestion + retrieval — keep chunks lean.
- **Aurora Serverless v2** min ACU low; scale on demand.

---

## 8. Failure Modes & Fallbacks

| Failure | Detection | Fallback |
|---|---|---|
| Bedrock model error / throttling | Bedrock SDK error | Retry w/ backoff → switch to Haiku → deterministic template |
| Guardrail blocks output | Guardrail verdict | Regenerate once → template |
| KB retrieval below threshold | Retriever score | "Ich weiß es nicht, frag bitte deine Ärztin" template |
| Tool (Rule Engine) failure | Lambda error | Safe default intent + degraded experience banner |
| Aurora unavailable | Health check | Read-only mode, no profile personalization, generic content |
| AgentCore Runtime cold start spike | CloudWatch latency | Provisioned concurrency + warmers |
| Suspected prompt injection | Guardrail + custom filter | Strip + log + safe template, no model call |

---

## 9. Open Decisions Before Build

1. **Bedrock model availability in `eu-central-1`** for the chosen Claude version — confirm at build time; otherwise pin to nearest EU region with DPA coverage.
2. **AgentCore GA status & EU region availability** — if not yet GA in `eu-central-1`, fall back to a self-hosted agent on Fargate behind the same Gateway/Guardrails contract.
3. **Voice channel** (ElevenLabs vs Amazon Connect + Polly + Lex) — if voice is in scope, prefer keeping it inside AWS for data residency; otherwise ElevenLabs must call the same API Gateway endpoint and is treated as an untrusted client.
4. **Clinical content licensing** for Leitlinien excerpts — needed before KB ingestion.
5. **Long-term memory**: keep entirely in Aurora (recommended) or use AgentCore Memory long-term store with extra DPIA scope.
6. **DPIA & C5 attestation timeline** — block prod launch on completion.

---

## 10. Next Steps

1. CDK skeleton: `network`, `security`, `data`, `kb`, `agent`, `observability` stacks.
2. KB ingestion pipeline + first clinically-reviewed seed corpus.
3. Rule engine YAML schema + first 20 rules + red-flag classifier.
4. Coach agent (Strands) with 3 states: `daily_checkin`, `micro_intervention`, `escalation`.
5. Eval harness with red-team + golden datasets.
6. DPIA draft + C5 control mapping in `/docs/compliance/`.
