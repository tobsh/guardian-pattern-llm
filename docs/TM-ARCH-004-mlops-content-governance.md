# Content Governance & MLOps
## 4-Augen-Prinzip, Circuit Breaker, Feature Flags & CI/CD

> Ergänzung zur Referenzarchitektur ([`TM-ARCH-001-architecture.md`](./TM-ARCH-001-architecture.md)) und zur AWS-Umsetzung ([`TM-ARCH-002-aws-bedrock.md`](./TM-ARCH-002-aws-bedrock.md)).
>
> Dieses Dokument beschreibt, **wie der guardian-demo Cardio Coach im Betrieb bleibt**: wie medizinische Inhalte von Ärzt:innen autorisiert in die Wissensbasis gelangen, wie neue Versionen kontrolliert ausgerollt werden, wie wir im Fehlerfall schnell und sicher deaktivieren können, und wie das Ganze als auditierbare MLOps-Pipeline automatisiert ist.

---

## 1. Warum ein eigenes Governance-Dokument?

Ein LLM-Coach im klinischen Umfeld unterscheidet sich von klassischer Software: **nicht der Code ist das Risiko, sondern die Inhalte**. Die Wissensbasis, die Regeln, die Persona, die Prompts — jede dieser Komponenten kann zwischen zwei Deployments ohne Code-Änderung den Charakter des Assistenten verändern. Daher brauchen wir für *Inhalte* denselben Rigor wie für Code:

- **4-Augen-Prinzip** bei jeder Änderung (Autor ≠ Reviewer).
- **Versionierte, unveränderliche Artefakte** mit nachvollziehbarer Provenienz.
- **Getrennte Stages** (dev → staging → prod) mit harten Eval-Gates.
- **Schnelle Rückroll-Mechanismen** (Feature Flags + Circuit Breaker).
- **Auditierbarkeit** über Jahre hinweg, konform zu DSGVO und BSI C5.

---

## 2. Inhaltliche Artefakte & ihre Owner

| Artefakt | Was | Owner | Änderungs-Frequenz |
|---|---|---|---|
| **Knowledge Base Chunks** | Bewegungs-, Ernährungs-, Rauchfrei-Inhalte aus guardian-demo Cardio + Leitlinien-Auszüge | Klinisches Content-Team | Wöchentlich |
| **Rule Pack** | If-Then-Regeln, Rote Linien, Eskalations-Kriterien | Klinischer Lead + Compliance | Monatlich |
| **Constitution** | Guardian-Kategorien und Verbots-Listen | Compliance + Klinik | Quartalsweise |
| **Persona-Templates** | Vorgegebene Tonalitäten / Sprachniveaus | UX + Klinik | Quartalsweise |
| **Name-Denylist** | Verbotene Assistenten-/Display-Namen | Compliance | Bei Bedarf |
| **System-Prompts** | Coach-System-Prompt, Setup-Agent-Prompts | ML Engineering + Klinik | Bei Bedarf |
| **Eval-Datasets** | Red-Team + Golden Sets | ML Engineering + Klinik | Kontinuierlich |

Jedes dieser Artefakte hat einen **klaren Owner**, wird in einem **Git-Repo** gepflegt, und durchläuft denselben Governance-Prozess.

---

## 3. Das 4-Augen-Prinzip im Detail

Kein Artefakt erreicht Produktion ohne **zwei unabhängige Freigaben**:

1. **Autor:in** — erstellt / bearbeitet den Inhalt (z.B. Ärztin, Content-Redakteur).
2. **Reviewer:in** — unabhängige zweite Person mit entsprechender Qualifikation (zweite Ärzt:in bei klinischen Inhalten, Compliance bei Red Lines).

**Regeln:**
- Autor ≠ Reviewer — technisch erzwungen über Git-Branch-Protection (CODEOWNERS + `required_reviewers`).
- Bei klinischen Inhalten: mindestens ein:e Reviewer:in mit medizinischer Fachrichtung (Rolle per SSO-Gruppe).
- Bei Red Lines / Constitution: zusätzlich Compliance-Freigabe.
- Bei kritischen Änderungen (z.B. Änderung der Eskalations-Schwellen): **3-Augen-Prinzip** mit Klinik-Lead als drittem Signoff.

**Technische Umsetzung:**
- GitHub Branch Protection auf `main` mit `required_approving_review_count >= 2`.
- CODEOWNERS-Datei pro Verzeichnis mapped auf SSO-Gruppen.
- Signierte Commits (`gpg` / `sigstore`) verpflichtend für Produktions-Artefakte.
- Audit-Log jeder Freigabe landet im separaten Security-Account (unveränderlich, WORM).

---

## 4. Das Content Workbench (UI für Ärzt:innen)

Ärzt:innen sollen **nicht** in Git oder YAML arbeiten müssen. Die Content Workbench ist eine webbasierte UI, die die Komplexität der Pipeline kapselt:

### 4.1 Nutzer-Flows

1. **Entwurf schreiben** — WYSIWYG-Editor mit Struktur-Templates (*"Einsteiger-Bewegung"*, *"Rauchfrei-Trigger"*, etc.). Metadaten-Felder sind Pflicht: Topic, Sprachniveau, Ziel-Zielgruppe, verwandte Videos.
2. **Referenzen hinzufügen** — Upload von Leitlinien-PDFs, Links auf Publikationen. Die UI extrahiert Zitate und verknüpft sie mit dem Chunk.
3. **Freigabe anfordern** — ein Klick löst im Hintergrund einen Pull Request aus (die UI übersetzt zu Git, nicht der Nutzer).
4. **Review empfangen** — die zweite Ärztin sieht eine Review-Ansicht mit Diff, Kommentarfunktion, klinischem Kontext und dem Eval-Ergebnis.
5. **Approve / Request Changes** — mit Signatur (Passkey / WebAuthn, an SSO-Identität gebunden).
6. **Staged Preview** — nach Freigabe läuft der Inhalt in `staging` und ist dort in einer Preview-Umgebung durch den Coach testbar (*"so würde der Coach jetzt antworten"*).
7. **Promotion zu Prod** — expliziter zweiter Klick; danach ist der Inhalt in der produktiven KB.

### 4.2 Design-Prinzipien der UI

- **Klinisches Vokabular, kein Dev-Jargon** — keine Begriffe wie *Commit*, *Branch*, *Deployment*. Stattdessen: *Entwurf*, *Freigabe anfordern*, *Vorschau*, *Veröffentlichen*.
- **Sofortiges Feedback** — jede Änderung wird live gegen den Guardian und ein kleines Coach-Sample gerendert. Ärztin sieht: *"So würde der Coach das gerade sagen."*
- **Compliance-Hinweise inline** — wenn ein Text eine verbotene Kategorie streift (Diagnose, Medikament), markiert die UI das in Echtzeit.
- **Unlock durch Review** — unreviewed Inhalte sind im Editor gelb, reviewed sind grün, in Prod sind blau.
- **Rollback mit einem Klick** — jeder veröffentlichte Stand kann durch Klick zurückgerollt werden (ein Pull Request wird im Hintergrund erzeugt, der Reviewer muss bestätigen).

### 4.3 Technische Umsetzung

- Frontend: React + TypeScript, hinter Cognito-SSO (gleiche Identität wie der Coach).
- Backend: Lambda-APIs, die mit der GitHub-API (über einen dedizierten App-Account) sprechen und die Pipelines triggern.
- Speicher der Drafts: DynamoDB mit Versionierung.
- Signaturen: WebAuthn + Sigstore-Keyless-Signing für Artefakte.
- Jede UI-Aktion wird im Audit-Log mit `subject_id`, `action`, `artifact_id`, `hash_before`, `hash_after` gespeichert.

---

## 5. RAG-Datenbank-Versionierung

Die RAG-Datenbank ist **nicht veränderlich in-place**. Jede Veröffentlichung erzeugt eine **neue, immutable Version**:

```
kb/
├── v2026.04.10-1234abc/
│   ├── chunks.jsonl
│   ├── embeddings.parquet
│   ├── manifest.yaml       # IDs, Hashes, Review-Signaturen
│   └── eval-report.json
├── v2026.04.10-1345def/
└── v2026.04.11-0800ghi/    ← currently active
```

- Alle Versionen bleiben verfügbar (S3 Object Lock, KMS).
- Die "aktive" Version wird durch einen einzigen Zeiger (`active_kb_version` in DynamoDB oder SSM Parameter) bestimmt.
- Rollback = Zeiger ändern, keine Daten kopieren. Sekunden statt Minuten.
- Bedrock Knowledge Base (in der AWS-Implementierung) re-indexiert automatisch auf Zeiger-Wechsel, oder es laufen zwei KBs parallel und der Agent wird umgeschaltet.

---

## 6. Feature Flags für Inhalte

Nicht jede Änderung soll "alles oder nichts" sein. Feature Flags erlauben schrittweises Rollout:

### 6.1 Flag-Typen

| Flag-Typ | Beispiel | Granularität |
|---|---|---|
| **KB-Version-Flag** | `kb.bewegung.use_v2` | Topic-weise |
| **Rule-Flag** | `rules.escalation.stricter_threshold` | Einzelregel |
| **Persona-Flag** | `persona.tone.warm_supportive.v2` | Persona-Variante |
| **Guardian-Flag** | `guardian.prompt_injection_v3` | Klassifikator-Version |
| **Kohorten-Flag** | `user_cohort.beta_testers` | Nutzer-Gruppe |

### 6.2 Rollout-Strategien

- **Dark Launch** — neue KB-Version läuft parallel, Antworten werden verglichen, aber Nutzer sehen nur die alte.
- **Canary** — 1%/5%/25%/50%/100% Stufen, jede Stufe mit definierten Metrik-Gates (False-Refusal-Rate, Guardian-Block-Rate, User-Abbrüche).
- **Kohorten** — bestimmte Nutzergruppen (z.B. interne Klinik-Tester) bekommen die neue Version zuerst.
- **Kill Switch** — jedes Flag hat einen sofortigen Off-Schalter, bedienbar vom On-Call ohne Deployment.

### 6.3 Umsetzung

- **AWS AppConfig** oder **LaunchDarkly** (bei höheren Anforderungen an Klinik-Workflows).
- Flag-Änderungen sind auditiert wie Code-Änderungen (wer, wann, warum).
- Flag-Auswertung happens **im Coach-Orchestrator**, nicht im LLM — damit die Entscheidung deterministisch ist.

---

## 7. Circuit Breaker

Ein Circuit Breaker ist ein **automatischer Not-Aus**, der den Coach in einen sicheren Modus zwingt, wenn ungewöhnliche Signale auftauchen.

### 7.1 Was den Breaker auslöst

| Signal | Schwelle (Beispiel) | Aktion |
|---|---|---|
| Guardian-Block-Rate > Baseline + 3σ | > 15% innerhalb 5min | Soft-Stop: nur Templates, kein LLM |
| LLM-Error-Rate | > 5% innerhalb 2min | Hard-Stop: "Ich bin kurz nicht verfügbar" |
| Ungegroundete Claims durch Output-Validator | > 2% | Soft-Stop + Alert an On-Call |
| Red-Flag-Eskalationen | ungewöhnlicher Spike | Alert + Klinik-Review |
| KB-Retrieval-Score im Schnitt unter Schwelle | Drift-Indikator | Alert, kein Stop |
| Bedrock-API-Latenz p95 | > 3s | Zurück zu Haiku statt Opus |
| Kosten pro 1000 Turns | > 150% Baseline | Alert (Missbrauch oder Bug?) |
| Eval-Regression in CI | jeder Fail | Deployment-Block |

### 7.2 Zustände des Breakers

```
  ┌──────────┐   anomaly detected    ┌──────────┐
  │  CLOSED  │ ────────────────────► │   OPEN   │
  │ (normal) │                       │  (safe)  │
  └────┬─────┘                       └────┬─────┘
       ▲                                  │
       │ stable for N minutes             │ cooldown
       │   + manual ack                   ▼
       │                            ┌──────────┐
       └────────────────────────────┤  HALF-   │
                                    │  OPEN    │
                                    │ (probing)│
                                    └──────────┘
```

- **Closed** — Normalbetrieb.
- **Open** — LLM wird nicht aufgerufen. Nutzer sehen eine ruhige, freundliche Wartemeldung oder deterministische Templates, je nach Art des Ausfalls. Incident-Alert geht raus.
- **Half-Open** — nach Cooldown werden wenige Turns probeweise durch den LLM geleitet. Bleibt alles grün, zurück zu Closed.

### 7.3 Wer kann den Breaker bedienen

- **Automatisch** — CloudWatch Alarms + Lambda, triggert auf die oben genannten Metriken.
- **Manuell** — On-Call per ChatOps (`/guardian circuit-breaker open` in Slack), mit 2-Faktor-Bestätigung. Jede manuelle Aktion ist auditiert.
- **Klinisches Vetorecht** — Klinik-Lead kann jederzeit per Workbench-Button alles anhalten ("klinischer Stop"), ohne On-Call zu brauchen.

---

## 8. Schnelle Updates & Rollback

Zeit ist im klinischen Umfeld kritisch. Zwei Anforderungen:

1. **Rapid update** — eine freigegebene Content-Änderung muss innerhalb von **Minuten** produktiv sein können (z.B. neue Leitlinien-Erkenntnis).
2. **Instant rollback** — ein fehlerhafter Stand muss innerhalb von **Sekunden** zurückrollbar sein.

**Wie wir das erreichen:**

- Alle Inhalte sind **Daten, nicht Code**. Keine Container-Neubauten für Content-Updates.
- **Atomic pointer switch**: `active_kb_version`, `active_rule_pack`, `active_constitution` sind einzelne Parameter. Wechseln bedeutet: Parameter ändern, Cache invalidieren.
- **Pre-warmed Versionen** — neue Version ist in der KB schon indiziert, bevor der Schalter umgelegt wird. Der Switch ist dadurch latenzfrei.
- **Rollback button** im Workbench und via ChatOps — erzeugt einen PR zurück auf die vorherige Version mit automatischer 4-Augen-Freigabe (On-Call + Klinik-Lead).

---

## 9. Die CI/CD-MLOps-Pipeline

Die gesamte Pipeline ist ein gerichteter Graph mit definierten Gates:

```
┌─────────────┐
│  Content    │  Autor:in arbeitet in Workbench
│  Workbench  │
└──────┬──────┘
       │ save → PR
       ▼
┌─────────────┐
│   GitHub    │  2-Reviewer, CODEOWNERS, signed commits
│   (main)    │
└──────┬──────┘
       │ merge
       ▼
┌─────────────┐
│ CodePipeline│
│   STAGE 1   │  Lint + Schema Validation
│             │  • YAML/JSON schema
│             │  • Forbidden-topic lint on KB text
│             │  • Metadata completeness
└──────┬──────┘
       │ pass
       ▼
┌─────────────┐
│   STAGE 2   │  Build Artefakte
│             │  • Chunk + Embed (Bedrock Titan / Cohere)
│             │  • Write to S3 (versioned, hashed)
│             │  • Index into OpenSearch Serverless
│             │  • Generate manifest.yaml
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   STAGE 3   │  Automated Evaluation
│             │  • Red-team dataset (jailbreaks, medical traps)
│             │  • Golden Q→A set
│             │  • Grounding entailment (NLI)
│             │  • Tone / readability
│             │  • Cost & latency benchmark
└──────┬──────┘
       │ pass all gates
       ▼
┌─────────────┐
│   STAGE 4   │  Deploy to staging
│             │  • Pointer swap in staging account
│             │  • Synthetic smoke tests
│             │  • Preview URL in Workbench
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Clinical   │  Klinik-Lead reviewed im Workbench,
│   Signoff   │  bestätigt per WebAuthn-Signatur
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   STAGE 5   │  Canary Rollout zu prod
│             │  1% → 5% → 25% → 50% → 100%
│             │  Metrik-Gates zwischen jeder Stufe
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  PROD LIVE  │  Circuit Breaker aktiv, Observability live
└─────────────┘
```

### 9.1 Gates im Detail

| Gate | Was wird geprüft | Bricht bei |
|---|---|---|
| Schema | YAML valid, alle Felder gesetzt | Fehlendes Feld |
| Forbidden-topic lint | KB-Texte enthalten keine Diagnose-/Drug-Sprache | Treffer |
| Red-team | Jailbreaks, Medical-Traps, Emotional-Attacks | < 99% Block-Rate |
| Golden Q→A | Bekannte gute Fragen liefern gute Antworten | Regression > ε |
| Grounding NLI | Jede Antwort ist durch Quelle entailed | < 95% |
| Latenz | p95 Turn-Zeit | > 2× Baseline |
| Kosten | Kosten pro 1000 Turns | > 120% Baseline |
| Klinik-Signoff | WebAuthn-Signatur vom Klinik-Lead | fehlt |

Jedes Gate kann im Notfall per explizitem Override (dokumentiert, signiert) gebrochen werden — das Override landet ebenfalls im Audit-Log.

### 9.2 AWS-Mapping

| Pipeline-Schritt | AWS Service |
|---|---|
| Source | **GitHub** (App-Integration) oder **CodeCommit** |
| Orchestrierung | **AWS CodePipeline** |
| Build | **CodeBuild** (Container mit `promptfoo`, `pandoc`, Embedding-CLI) |
| Artefakt-Storage | **S3** (versioned, Object Lock, KMS) |
| Eval Execution | **Step Functions** + **Lambda** + **Bedrock** |
| Staging-Deployment | **Bedrock Knowledge Bases**, Staging-Account |
| Pointer Switch | **SSM Parameter Store** oder **AppConfig** |
| Canary Control | **AppConfig** mit Rollout-Strategy |
| Manual Signoff | **CodePipeline Manual Approval** + Workbench-Callback |
| Secrets | **Secrets Manager** |
| Metrics | **CloudWatch** + **X-Ray** |
| Alerts | **EventBridge** → **SNS** → **PagerDuty/Slack** |
| Audit | **CloudTrail** + dedicated **Log-Archive-Account** |

### 9.3 Environments

```
           Content Workbench
                 │
                 ▼
            [ sandbox ]        ← Autor:in probiert, keine Eval
                 │
                 ▼
              [ dev ]          ← synth. Daten, schnelle Evals
                 │
                 ▼
           [ staging ]         ← Klinik-Preview, vollständige Evals
                 │
                 ▼
             [ prod ]          ← Canary, Circuit Breaker, Live-Metriken
```

Separate AWS-Accounts pro Stage über **AWS Organizations**, mit dediziertem `log-archive` und `security` Account.

---

## 10. Beobachtbarkeit

Jeder Turn im Coach wird zu einem strukturierten Event:

```json
{
  "request_id": "...",
  "subject_id_hash": "...",
  "kb_version": "v2026.04.11-0800ghi",
  "rule_pack_version": "v2026.04.01",
  "constitution_version": "v2026.03",
  "persona_version": "v1",
  "guardian_input_verdict": "pass",
  "rag_snippets_used": ["kb_bewegung_einsteiger_03"],
  "llm_model": "claude-opus-4-6",
  "llm_tokens": {"in": 1843, "out": 287},
  "guardian_output_verdict": "pass",
  "final_source": "llm",
  "latency_ms": 412,
  "circuit_breaker_state": "closed",
  "feature_flags": ["kb.bewegung.use_v2"]
}
```

Daraus entstehen Live-Dashboards für:
- Klinik: Anzahl Turns, Eskalations-Rate, Themenverteilung (bewegung/ernährung/rauchfrei), Persona-Verteilung.
- Engineering: Latenz, Kosten, Guardian-Block-Rate, KB-Retrieval-Scores.
- Compliance: Eskalationen, Guardian-Treffer, Auditpfade pro Nutzer.
- Produkt: Nutzer-Engagement, Abbruchraten, A/B-Ergebnisse von Feature Flags.

---

## 11. Sicherheits-Aspekte der Pipeline

- **Keine Produktions-Credentials im Autor:innen-Pfad.** Die Workbench sieht nie den KMS-Key oder den Bedrock-Endpunkt.
- **Service-Account-Isolation**: Build-Pipeline hat IAM-Rollen pro Stage, jeweils nur mit den minimal notwendigen Rechten.
- **Signierte Artefakte**: KB-Versionen werden vor Deployment signiert (Sigstore/Cosign); Coach verifiziert Signatur beim Laden.
- **Supply-Chain-Härtung**: SBOM für jeden Build, Image-Scanning, Abhängigkeiten gepinnt.
- **Segregation of Duties**: wer Code schreibt ≠ wer deployed; wer Inhalte schreibt ≠ wer Freigaben erteilt.

---

## 12. Offene Fragen

1. **Workbench v1 Scope** — nur KB-Chunks, oder auch Rules/Persona/Constitution im ersten Release?
2. **Feature-Flag-Tool** — AWS AppConfig reicht, oder lohnt sich LaunchDarkly für Kohorten-Targeting und Audit?
3. **Klinisches SSO** — Anbindung an bestehendes Uniklinik-Freiburg-Identity-System oder eigenes Cognito-Pool?
4. **Eval-Dataset Ownership** — welche Rolle pflegt die Red-Team + Golden Sets? Vorschlag: ML Engineering + Klinik gemeinsam, wöchentliches Review.
5. **Rollback-Fenster** — wie lange halten wir alte KB-Versionen vor? Vorschlag: 12 Monate online, danach Glacier, 7 Jahre Retention für Audit.
6. **Blast-Radius bei Multi-Tenant** — Circuit Breaker pro Gesamtsystem oder pro Nutzergruppe?
7. **Klinisches Vetorecht per Mobile** — soll der "klinischer Stop"-Button auch als mobile App verfügbar sein (Klinik-Lead unterwegs)?

---

## 13. Zusammenspiel mit den anderen Dokumenten

| Dokument | Liefert | Nutzt von hier |
|---|---|---|
| [`TM-ARCH-001-architecture.md`](./TM-ARCH-001-architecture.md) (Referenz) | Komponenten-Struktur | Versions-Modell, Feature Flags |
| [`TM-ARCH-002-aws-bedrock.md`](./TM-ARCH-002-aws-bedrock.md) (AWS) | Service-Mapping | CodePipeline-Stages, AppConfig, Circuit Breaker Lambdas |
| [`TM-ARCH-003-guardian-and-persona.md`](./TM-ARCH-003-guardian-and-persona.md) (Guardian) | Constitution, Persona-Slots | Constitution-Versionierung, Persona-Templates-Rollout |
| **Dieses Dokument** | Governance + MLOps | — |

Die Referenz-, AWS- und Guardian-Dokumente beschreiben **was das System ist**. Dieses Dokument beschreibt, **wie es sicher lebt und atmet**.
