# guardian-demo Cardio Coach — Guardrailed AI Architecture

> High-level reference architecture for an LLM-driven cardiovascular prevention coach
> (Bewegung · Ernährung · Rauchfrei) with strict anti-hallucination guardrails and
> medical-grade safety boundaries.

---

## 1. Design Principles

1. **Refuse by default.** If the answer is not grounded in the curated knowledge base, the system must not generate it — it escalates or declines.
2. **The LLM is a *renderer*, not an *oracle*.** Medical content comes from the rule engine and KB; the LLM only paraphrases, motivates, and personalizes.
3. **Layered defense.** No single component is trusted — input filter, RAG, output validator, and policy engine each catch different failure modes.
4. **Deterministic where it matters.** Goals, thresholds, escalations, drug/diagnosis topics → rule-based, never LLM-generated.
5. **Auditability.** Every user-visible message is traceable to (a) a KB snippet ID, (b) a rule ID, or (c) an explicit "non-medical small talk" tag.
6. **Graceful escalation.** Out-of-scope, red-flag symptoms, or low-confidence states route to a human / Arzt-Hinweis, never to a guess.

---

## 2. Three-Layer Separation (from PDF concept)

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3 — UI / Personalization (Dashboard + Chat)      │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — Interaction Logic (Coach Engine + Guardrails)│
├─────────────────────────────────────────────────────────┤
│  Layer 1 — Knowledge Base (Rules, Leitlinien, Content)  │
└─────────────────────────────────────────────────────────┘
```

The LLM only operates inside Layer 2, and only over content surfaced from Layer 1.

---

## 3. High-Level Component Diagram

```
                        ┌────────────────┐
                        │   User (Web /  │
                        │   App / Voice) │
                        └───────┬────────┘
                                │
                  ┌─────────────▼──────────────┐
                  │   API Gateway / BFF        │
                  │   (auth, rate-limit, PII)  │
                  └─────────────┬──────────────┘
                                │
              ┌─────────────────▼──────────────────┐
              │      INPUT GUARDRAIL PIPELINE       │
              │  • PII scrubber                     │
              │  • Topic classifier                 │
              │  • Red-flag / emergency detector    │  ──► EMERGENCY ROUTE
              │  • Jailbreak / prompt-injection chk │       (Notruf-Hinweis)
              └─────────────────┬──────────────────┘
                                │
              ┌─────────────────▼──────────────────┐
              │       COACH ORCHESTRATOR            │
              │  (state machine, not free-form)    │
              └──┬───────────┬─────────────┬───────┘
                 │           │             │
        ┌────────▼──┐  ┌─────▼──────┐  ┌───▼─────────┐
        │ User Ctx  │  │   RULE     │  │   RAG       │
        │ Service   │  │  ENGINE    │  │  RETRIEVER  │
        │ (profile, │  │ (If-Then,  │  │ (vector +   │
        │ goals,    │  │ Leitlinie, │  │  keyword,   │
        │ history)  │  │ red lines) │  │  KB only)   │
        └────────┬──┘  └─────┬──────┘  └───┬─────────┘
                 │           │             │
                 └───────────┼─────────────┘
                             │
              ┌──────────────▼─────────────────┐
              │   GROUNDED LLM CALL (renderer) │
              │   • strict system prompt       │
              │   • only KB snippets in ctx    │
              │   • structured JSON output     │
              │   • temperature low            │
              └──────────────┬─────────────────┘
                             │
              ┌──────────────▼─────────────────┐
              │    OUTPUT GUARDRAIL PIPELINE   │
              │  • Citation/grounding check    │
              │  • Forbidden-topic classifier  │
              │  • Medical-claim validator     │
              │  • Tone / readability check    │
              │  • Schema validation           │
              └──────────────┬─────────────────┘
                             │
              ┌──────────────▼─────────────────┐
              │   RESPONSE ASSEMBLER           │
              │  text + ui_hints (video_id,    │
              │  image_id, widget_type)        │
              └──────────────┬─────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │   Audit Log + Eval  │
                  └──────────┬──────────┘
                             │
                  ┌──────────▼──────────┐
                  │  Dashboard + Chat   │
                  │       Frontend      │
                  └─────────────────────┘
```

---

## 4. Component Responsibilities

### 4.1 API Gateway / BFF
- AuthN/AuthZ, session, rate-limit, request size cap.
- Strips obvious PII before anything is logged.
- Single entry point for web, mobile, and (optional) voice (e.g. ElevenLabs Agents → webhook).

### 4.2 Input Guardrail Pipeline
Runs **before** any LLM call. Cheap classifiers, fail-fast.

| Guardrail | Purpose | Failure action |
|---|---|---|
| PII Scrubber | Remove names, emails, IDs from prompt context | Replace with tokens |
| Topic Classifier | Is this in-scope (Bewegung/Ernährung/Rauchfrei/Profil/Smalltalk)? | Route or refuse |
| Red-Flag Detector | "Brustschmerz", "Atemnot", "Suizid"… | Hard route → emergency template + Arzt-Hinweis |
| Prompt-Injection Filter | "ignore previous instructions", role-play attempts | Strip + log |

### 4.3 Coach Orchestrator (State Machine)
- Explicit conversation states: `onboarding`, `goal_setting`, `daily_checkin`, `reflection`, `micro_intervention`, `escalation`.
- Decides **per turn** whether the response is:
  - **(a) deterministic template** (red lines, escalations, goal confirmations),
  - **(b) rule-driven personalization** (rule engine fires, LLM only fills slots),
  - **(c) grounded freeform** (LLM paraphrases retrieved KB).
- Never lets the LLM "decide" what topic to cover next — that comes from the state machine + user dashboard signals.

### 4.4 Rule Engine (Layer 1 — deterministic)
- Encodes Leitlinien-derived **If-Then rules** (e.g. *if rauchfrei_streak == 7 then trigger reward_video*).
- Owns the **red lines**:
  - No diagnoses.
  - No drug recommendations / dose changes.
  - No interpretation of lab values or ECG.
  - No replacement for Arzt-Konsultation.
- Outputs structured *intents* the LLM must render (`{intent: "celebrate_streak", days: 7, video_id: "..."}`).

### 4.5 Knowledge Base + RAG Retriever
- **Sources** (curated, versioned, signed off by clinical owner):
  - guardian-demo Cardio content (Bewegung, Ernährung, Rauchfrei modules).
  - Leitlinien-Auszüge (Sportkardiologie, Hypertonie, Prävention).
  - FAQ + standardized text blocks.
  - Approved videos/images metadata (`video_id`, `image_id`, topic, level).
- **Indexing**: chunked, embedded, plus BM25 hybrid; each chunk has `source_id`, `version`, `clinical_review_date`.
- **Retrieval contract**: returns `top_k` chunks **with IDs**. If max similarity < threshold → orchestrator switches to "I don't know" template.
- **No LLM-generated content is ever written back into the KB.**

### 4.6 User Context Service
- Structured profile only — no free text:
  - demographics, smoker status, activity level, language preference,
  - current goals, streaks, completed videos, last check-in,
  - clinically relevant flags (e.g. *known hypertension*) **set by clinician, not by chatbot**.
- The LLM only ever sees a **whitelisted projection** of this profile.

### 4.7 Grounded LLM Call (the "renderer")
- **Model**: latest Claude (e.g. `claude-opus-4-6` for quality, `claude-haiku-4-5` for cheap turns); never internet-augmented.
- **Temperature**: low (0.2–0.4).
- **System prompt** enforces:
  - persona, tone (freundlich, wertschätzend, einfache Sprache),
  - hard refusals (diagnoses, meds, dosages, lab interpretation),
  - "answer **only** using the provided snippets; if insufficient, say so",
  - structured JSON output schema.
- **Context window** contains *only*:
  - system prompt,
  - whitelisted user profile projection,
  - rule engine intent,
  - retrieved KB snippets with IDs,
  - last N turns (sanitized).
- **Output schema** (example):
  ```json
  {
    "text": "…",
    "cited_snippets": ["kb_bewegung_einsteiger_03"],
    "ui_hints": [{"widget_type": "video", "video_id": "vid_walk_5min"}],
    "confidence": 0.0-1.0,
    "needs_escalation": false
  }
  ```

### 4.8 Output Guardrail Pipeline
Runs on every LLM response **before** the user sees it.

| Validator | Check |
|---|---|
| Schema validator | JSON conforms; required fields present |
| Grounding check | Every factual claim maps to a `cited_snippet`; ungrounded sentences are stripped or trigger regeneration |
| Forbidden-topic classifier | No diagnosis / drug / dose / lab interpretation language |
| Medical-claim NLI | Optional: NLI model checks each sentence is *entailed* by its cited snippet |
| Tone / readability | Flesch-style score; verurteilende Sprache flagged |
| PII leakage | Profile fields not echoed unless intentional |

On failure → **regenerate once** with stricter prompt → if still failing → fall back to template.

### 4.9 Response Assembler
- Merges validated `text` with `ui_hints` for the dashboard frontend (videos, badges, micro-widgets).
- Attaches the citation trail (hidden in UI, visible to auditors).

### 4.10 Audit Log + Eval Harness
- Append-only log: input, retrieved snippet IDs, rule IDs fired, LLM raw output, guardrail verdicts, final output.
- Continuous eval suite:
  - **Red-team set**: jailbreaks, symptom probing, "verschreib mir…", emotional manipulation.
  - **Golden set**: known-good Q→A pairs from clinical reviewers.
  - **Drift monitor**: weekly re-run, alert on regression.

---

## 5. Conversation Flow (typical turn)

```
User: "Mir ist heute beim Treppensteigen so komisch, soll ich trotzdem laufen?"

1. Input pipeline
   → red-flag detector hits "komisch beim Treppensteigen"
   → Orchestrator switches to ESCALATION state
2. Rule engine
   → emits intent {type: "soft_escalation", reason: "exertional_symptom"}
3. No RAG / no LLM freeform.
4. Deterministic template:
   "Das klingt nach etwas, das du heute lieber mit deiner Ärztin /
    deinem Arzt besprechen solltest, bevor du weiter trainierst.
    Möchtest du, dass ich dir die Kontaktoptionen aus guardian-demo zeige?"
5. ui_hints: [{widget_type: "contact_card", id: "arzt_kontakt"}]
6. Audit log: rule_id=R_ESCALATION_EXERTIONAL, llm_used=false
```

vs.

```
User: "Was kann ich heute Kleines für mehr Bewegung machen?"

1. Input pipeline → in-scope, no red flag.
2. Orchestrator: state=micro_intervention.
3. User context: activity_level=low, last_goal=10min_walk.
4. Rule engine: intent {type: "suggest_micro_step", base: last_goal}.
5. RAG: retrieves "Einsteiger Mikro-Bewegung" snippet + video_id.
6. LLM renders intent + snippet → structured JSON.
7. Output guardrails: grounded ✓, tone ✓, no forbidden topics ✓.
8. UI: text + embedded 5-min walk video.
```

---

## 6. Anti-Hallucination Strategies (cheat sheet)

| Strategy | Where it lives |
|---|---|
| RAG with strict "no answer if no hit" | Retriever + Orchestrator |
| Citation-required output schema | LLM prompt + Output validator |
| NLI entailment of claims to sources | Output validator |
| Rule engine owns all numeric/medical facts | Layer 1 |
| Low temperature, structured JSON | LLM call |
| Whitelisted profile projection | User Context Service |
| Regenerate-on-fail, then template fallback | Output pipeline |
| Red-team eval suite in CI | Eval harness |
| Versioned, clinically-reviewed KB | Knowledge Base |
| Human-in-the-loop for new content | KB ingestion pipeline |

---

## 7. Voice Channel (ElevenLabs / similar)

If a voice agent is used, it should **not** be a parallel brain — it must call the same backend.

```
Voice Agent (ElevenLabs)
  │  STT
  ▼
Webhook → API Gateway → (same pipeline as text)
  │  text + ui_hints
  ▼
Voice Agent TTS  (ui_hints surfaced visually if companion screen exists)
```

ElevenLabs-side configuration is kept thin:
- minimal system prompt: "You are a voice front-end. Call the guardian-demo backend tool for every user message. Never answer from your own knowledge.",
- one tool: `ask_guardian_demo(user_message, session_id)`,
- knowledge base in ElevenLabs left empty or limited to small-talk fallbacks,
- evaluation criteria configured to flag any answer not produced via the tool call.

---

## 8. Data & Privacy

- All clinically relevant data stays in guardian-demo backend; LLM provider sees only the whitelisted projection.
- DSGVO: explicit consent, data minimization, EU region for model inference where possible (e.g. Anthropic EU endpoints / on-prem option for sensitive deployments).
- Audit log retention separate from user-visible chat history; pseudonymized.
- Right to erasure cascades through chat history, audit log (hashed), and eval datasets.

---

## 9. Tech Choices (suggested defaults)

| Concern | Default |
|---|---|
| LLM | Claude (`claude-opus-4-6` quality, `claude-haiku-4-5` cheap) |
| Embeddings | Multilingual model (DE/EN), e.g. `bge-m3` or provider-native |
| Vector store | pgvector (keeps ops simple) or Qdrant |
| Orchestration | TypeScript service; state machine via XState or similar |
| Guardrails | Custom validators + NeMo Guardrails or Guardrails AI for output schema/NLI |
| Rule engine | JSON/YAML rules + small TS evaluator (no DSL magic) |
| Infra | AWS CDK; Lambda for stateless turns, Aurora/pgvector for KB+state |
| Eval | Promptfoo or in-house harness in CI |
| Observability | OpenTelemetry traces per turn, with guardrail verdicts as span attrs |

---

## 10. What This Architecture Explicitly Refuses To Do

- Generate diagnoses, drug names, dosages, or interpret lab/ECG values.
- Answer medical questions outside Bewegung / Ernährung / Rauchfrei scope.
- Use the LLM's world knowledge as a source of truth.
- Let the model "improvise" goals, thresholds, or escalation criteria.
- Persist user-generated content into the KB without clinical review.
- Trust a single guardrail layer.

---

## 11. Open Questions (for next iteration)

1. Clinical ownership model — who signs off on KB versions, how often?
2. Multilingual scope at launch (DE only, or DE + EN + TR)?
3. Voice channel in-scope for v1 or later?
4. On-prem / EU-only inference required for procurement?
5. Integration depth with existing guardian-demo dashboard (embed vs. parallel)?
6. Red-team dataset ownership and update cadence?
