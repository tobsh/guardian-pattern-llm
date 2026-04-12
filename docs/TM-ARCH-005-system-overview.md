# guardian-demo Cardio Coach — System Overview
## Gesamtarchitektur, Personas & Workflows

> Dieses Dokument ist die **integrierte Draufsicht** auf den guardian-demo Cardio Coach. Es zeigt, wie Referenzarchitektur ([TM-ARCH-001](./TM-ARCH-001-architecture.md)), AWS-Umsetzung ([TM-ARCH-002](./TM-ARCH-002-aws-bedrock.md)), Guardian & Persona ([TM-ARCH-003](./TM-ARCH-003-guardian-and-persona.md)) und Content Governance & MLOps ([TM-ARCH-004](./TM-ARCH-004-mlops-content-governance.md)) als *ein* System zusammenspielen, und wie die zentralen Personas damit arbeiten.
>
> Wenn du nur *ein* Architektur-Dokument liest, lies dieses. Details stehen in den vier referenzierten Deep-Dives.

---

## 1. Warum dieses Dokument?

Die bisherigen Architektur-Dokumente sind absichtlich thematisch geschnitten — Referenzarchitektur, Cloud-Umsetzung, Guardian, Governance. Das hilft beim Review einzelner Aspekte, lässt aber die Frage *„Wie hängt das alles zusammen, und was heißt das für mich in meiner Rolle?"* offen.

Dieses Dokument schließt diese Lücke. Es bleibt bewusst **auf Block-Ebene**: keine Felder, keine API-Signaturen, keine Retention-Pflichten im Detail. Alles, was unter der Block-Ebene liegt, gehört in die Deep-Dives und wird von dort aus gepflegt.

---

## 2. Gesamtsystem — High-Level Blockdiagramm

```
                                     ┌──────────────────────────────┐
                                     │          Patient:in          │
                                     │  (Web / App · Voice später)  │
                                     └───────────────┬──────────────┘
                                                     │
                                     ┌───────────────▼──────────────┐
                                     │       Edge / API Gateway     │
                                     │   AuthN, Rate-Limit, PII-cut │
                                     └───────────────┬──────────────┘
                                                     │
        ┌────────────────────────────────────────────▼───────────────────────────────────────────┐
        │                               COACH RUNTIME PLANE                                     │
        │                                                                                         │
        │   ┌──────────────┐   ┌────────────────┐   ┌──────────────┐   ┌────────────────────┐    │
        │   │ Setup Agent  │   │ Guardian (in)  │   │ Coach LLM    │   │ Guardian (out)     │    │
        │   │ (Persona)    │──▶│ Classifier +   │──▶│ (Bedrock,    │──▶│ Classifier +       │──▶ │
        │   │ Interview    │   │ Denylist       │   │  grounded)   │   │ Fact/Red-Line Chk  │    │
        │   └──────┬───────┘   └───────┬────────┘   └──────┬───────┘   └─────────┬──────────┘    │
        │          │                   │                   │                     │               │
        │          ▼                   ▼                   ▼                     ▼               │
        │   ┌────────────────────────────────────────────────────────────────────────────┐      │
        │   │                     User Context · KB (RAG) · Rule Engine                   │      │
        │   │   (Profil, Ziele, History)    (Leitlinien, Snippets)   (If-Then, Red Lines) │      │
        │   └────────────────────────────────────────────────────────────────────────────┘      │
        │                                                                                         │
        └─────────────────────────────┬───────────────────┬──────────────────────────────────────┘
                                      │                   │
                ┌─────────────────────▼──┐        ┌───────▼──────────────┐
                │   Observability Plane  │        │  Circuit Breaker     │
                │   Metrics · Logs · Tr. │        │  (feature-flag halt) │
                │   PII-redacted         │        └──────────────────────┘
                └─────────────────────┬──┘
                                      │
        ┌─────────────────────────────▼───────────────────────────────────────────┐
        │                          CONTENT & MLOPS PLANE                          │
        │                                                                          │
        │   ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐  │
        │   │ Content         │   │ 4-Eyes Review   │   │ Eval & Red-Team      │  │
        │   │ Workbench       │──▶│ (Author/Doctor) │──▶│ Harness (Gates)      │  │
        │   │ (Ärzt:innen)    │   │                 │   │                      │  │
        │   └─────────────────┘   └─────────────────┘   └──────────┬───────────┘  │
        │                                                           │              │
        │   ┌─────────────────┐   ┌─────────────────┐   ┌──────────▼───────────┐  │
        │   │ Prompt / Model  │   │ CI/CD Pipeline  │   │ Feature Flags +      │  │
        │   │ Registry        │──▶│ (build, sign)   │──▶│ Canary Rollout       │  │
        │   └─────────────────┘   └─────────────────┘   └──────────────────────┘  │
        │                                                                          │
        └──────────────────────────────────────────────────────────────────────────┘

                               ┌──────────────────────────┐
                               │   AWS Control Plane      │
                               │  (VPC, KMS, IAM, Logs,   │
                               │  Bedrock, S3, DynamoDB)  │
                               └──────────────────────────┘
```

Drei Planes, eine Durchlauf-Richtung:

- **Runtime Plane** — alles, was einen Nutzer-Turn verarbeitet. Strikt in-line, mit Guardian davor und dahinter.
- **Content & MLOps Plane** — alles, was *Änderungen* ins Runtime-Plane bringt: neue Inhalte, neue Prompts, neue Modelle, neue Guardian-Regeln. Niemals direkt, immer über 4-Augen + Evals + Flags.
- **AWS Control Plane** — die gemeinsame Basis (Netzwerk, Keys, Identitäten, Audit-Logs). Details in TM-ARCH-002.

---

## 3. Komponenten auf Block-Ebene

| Block | Verantwortung | Deep-Dive |
|---|---|---|
| **Edge / API Gateway** | TLS, AuthN/AuthZ, Rate-Limit, grobe PII-Erkennung | TM-ARCH-002 §3 |
| **Setup Agent** | Onboarding-Interview, Persona-Kalibrierung, Consent-Einholung | TM-ARCH-003 §2 |
| **Guardian (in)** | Prompt-Injection, Jailbreak, Denylist, Red-Flag-Detection | TM-ARCH-003 §1 |
| **Coach LLM** | Grounded Rendering, kein Oracle-Verhalten | TM-ARCH-001 §3 |
| **Guardian (out)** | Faktentreue-Check, Red-Lines, Zitierbarkeit, Output-Shape | TM-ARCH-003 §1.3 |
| **User Context** | Profil, Ziele, History, Einwilligungen | TM-ARCH-001 §6 |
| **KB / RAG** | Versionierte Leitlinien-Snippets, vektor- + keyword-indiziert | TM-ARCH-001 §7 |
| **Rule Engine** | Deterministische Antworten für alles, was nicht Sprachfluss ist | TM-ARCH-001 §8 |
| **Observability Plane** | Metriken, strukturierte Logs, Traces — alle PII-redacted | TM-ARCH-013 |
| **Circuit Breaker** | Automatisches oder manuelles Abschalten einzelner Capabilities | TM-ARCH-004 §7 |
| **Content Workbench** | Editor für Ärzt:innen zum Schreiben/Reviewen von Inhalten | TM-ARCH-004 §4 |
| **4-Eyes Review** | Workflow mit Autor ≠ Reviewer, Sign-off | TM-ARCH-004 §3 |
| **Eval & Red-Team Harness** | Golden Sets, Adversarial-Suites, Gates vor Rollout | TM-ARCH-011 |
| **Prompt / Model Registry** | Versionierte, signierte Artefakte (Prompts, Modelle, Guardian-Policies) | TM-ARCH-004 §5 |
| **CI/CD Pipeline** | Build, Sign, Provenance, Deploy | TM-ARCH-004 §9 |
| **Feature Flags / Canary** | Kontrollierter Rollout, Rollback in Sekunden | TM-ARCH-004 §6 |
| **AWS Control Plane** | VPC, KMS, IAM, CloudTrail, Bedrock, S3, DynamoDB | TM-ARCH-002 §4 |

---

## 4. Personas — wer arbeitet wie mit dem System

Fünf Hauptrollen interagieren mit dem Coach. Jede Rolle sieht eine *andere* Oberfläche des Systems; keine Rolle braucht den gesamten Stack zu verstehen.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Patient:in      │     │  Ärzt:in /       │     │  ML / Platform   │
│  (End-User)      │     │  Reviewer:in     │     │  Admin           │
└────────┬─────────┘     └─────────┬────────┘     └────────┬─────────┘
         │                         │                       │
         ▼                         ▼                       ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Coach App       │     │  Content         │     │  CI/CD · Flags · │
│  (Chat UI)       │     │  Workbench       │     │  Registry · Obs. │
└──────────────────┘     └──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│  Compliance /    │     │  On-Call         │
│  Auditor         │     │  Engineer        │
└────────┬─────────┘     └─────────┬────────┘
         │                         │
         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│  Audit Trail,    │     │  Dashboards,     │
│  Reports, DPIA   │     │  Pager, Breaker  │
└──────────────────┘     └──────────────────┘
```

---

## 5. Workflows — pro Persona

### 5.1 Patient:in

#### Workflow P-1: Onboarding & Persona-Interview

```
[Patient] ──▶ [Coach App] ──▶ [Setup Agent]
                                   │
                                   ├─▶ Consent & DSGVO-Hinweis
                                   ├─▶ Kurz-Anamnese (pseudonymisiert)
                                   ├─▶ Ziel-Auswahl (Bewegung / Ernährung / Rauchfrei)
                                   ├─▶ Tonalitäts-Kalibrierung (formal / locker)
                                   └─▶ Assistenten-Name (optional)
                                   │
                                   ▼
                          [User Context Write]
                                   │
                                   ▼
                          [Erste geguarde Turn]
```

- Dauer: ≤ 3 Minuten.
- Kein medizinischer Inhalt, kein Coach LLM — reiner Setup-Agent.
- Ausstieg jederzeit möglich; ohne Consent keine Persistierung über Session hinaus.
- Ergebnis: User-Context-Record + Session-Token.

Deep-Dive: TM-ARCH-003 §2.

#### Workflow P-2: Täglicher geguarder Turn

```
[Patient-Input]
      │
      ▼
[Edge / API GW] ──(rate-limited, authed)──▶ [Guardian in]
                                                 │
                            ┌────────────────────┼───────────────────┐
                            │ Prompt Injection?  │ Red Flag?         │
                            └────────┬───────────┴──────┬────────────┘
                                     │                  │
                         block/fallback              [Emergency Route]
                                     │                  │
                                     ▼                  ▼
                            [Coach LLM (grounded)]   [Notruf-Hinweis]
                                     │
                                     ▼
                            [Guardian out — Faktencheck, Red Lines, Shape]
                                     │
                          ┌──────────┴──────────┐
                          │ PASS                │ FAIL
                          ▼                     ▼
                   [Antwort an User]     [Fallback-Antwort +
                                          Eskalations-Entry]
```

- Jede Nachricht läuft durch beide Guardian-Stufen.
- Antworten sind nur zulässig, wenn (a) ein KB-Snippet zitiert, (b) eine Rule matcht oder (c) als „Small Talk" getaggt.
- Jede Turn wird strukturiert geloggt (redacted) — siehe TM-ARCH-013.

Deep-Dive: TM-ARCH-001 §3, TM-ARCH-003 §1.

#### Workflow P-3: Red-Line / Eskalation

```
[Guardian detektiert Red Flag or Fail]
      │
      ▼
[Standardisierte Fallback-Antwort]  ──▶  [Eskalations-Queue (Arzt-Inbox)]
      │                                          │
      ▼                                          ▼
[User sieht: "Bitte sprich mit…"]        [Ärzt:in sieht den Case in P-3b]
```

- Beispiele: Brustschmerz-Schilderung, Suizidalität, Medikations-Frage.
- Kein LLM-Versuch, kreativ zu antworten — hart kodierter Fallback-Text.
- Patient wird nicht allein gelassen: Hinweis + Kontaktweg + (wenn kritisch) Notruf-Button.

Deep-Dive: TM-ARCH-010 (Red Lines), TM-ARCH-014 §3 (Runbook Eskalation).

---

### 5.2 Ärzt:in / Klinischer Reviewer

#### Workflow D-1: Content draften (Workbench)

```
[Ärzt:in] ──▶ [Content Workbench]
                    │
                    ├─▶ Markdown-Editor mit Snippets-Tree
                    ├─▶ Quellenfeld (Leitlinien-Ref Pflicht)
                    ├─▶ Metadaten (Zielgruppe, Altersband, Kontraind.)
                    └─▶ Preview mit Guardian-Dry-Run
                    │
                    ▼
             [Draft gespeichert in Registry (Status: DRAFT)]
```

- Jeder Inhalt braucht mindestens *eine* verifizierbare Quelle.
- Preview läuft durch dieselbe Guardian-Kette wie Produktion — Ärzt:in sieht sofort, ob der Draft passieren würde.

Deep-Dive: TM-ARCH-004 §4.

#### Workflow D-2: 4-Augen-Review

```
[Draft] ──▶ [Review-Request an zweite Ärzt:in (Autor ≠ Reviewer)]
                    │
                    ├─▶ Kommentare, Change-Requests
                    ├─▶ Sign-off mit persönlichem Token
                    │
                    ▼
            [Status: APPROVED, signed]
                    │
                    ▼
           [Eval-Gate ——► Feature-Flag ——► Rollout]
```

- System erzwingt: gleicher Account kann nicht Autor *und* Reviewer sein.
- Sign-off wird kryptographisch an Artefakt gebunden → Provenance.
- Approval ohne durchgelaufenes Eval-Gate kommt nicht in Produktion.

Deep-Dive: TM-ARCH-004 §3.

#### Workflow D-3: Eskalations-Inbox

```
[Guardian-Eskalations-Queue]
                    │
                    ▼
            [Arzt-Inbox UI]
                    │
    ┌───────────────┼────────────────┐
    │               │                │
    ▼               ▼                ▼
[Case ansehen]  [An Kollegin]   [Als Policy-Lücke taggen]
    │               │                │
    ▼               ▼                ▼
[Antwort an       [Reassign]     [Feed in → Guardian
 Patient via                       Policy Review]
 abgesicherten
 Kanal]
```

- Ärzt:in sieht *nicht* den Klartext, sondern eine redactede Zusammenfassung, bis sie den Case bewusst öffnet (DSGVO-Minimierung).
- „Policy-Lücke"-Tag fließt in TM-ARCH-011 Red-Team-Feedback zurück.

Deep-Dive: TM-ARCH-010, TM-ARCH-014 §3.

---

### 5.3 ML / Platform Admin

#### Workflow A-1: Modell- oder Prompt-Update

```
[Commit in Prompt/Model-Repo]
        │
        ▼
[CI: Lint, Unit, Secret-Scan, SBOM]
        │
        ▼
[Eval-Harness Gate]  ─── fail ───▶ [Block, Report an Author]
        │
      pass
        │
        ▼
[Red-Team Suite]    ─── fail ───▶ [Block]
        │
      pass
        │
        ▼
[Signed Artefact in Registry]
        │
        ▼
[Deploy into Staging (Canary 1%)]
        │
        ▼
[Metrik-Gate: FP-Rate, Latenz, Guardian-Block-Rate]
        │
      pass
        │
        ▼
[Progressive Rollout 10% → 50% → 100%]
```

Deep-Dive: TM-ARCH-004 §9, TM-ARCH-011.

#### Workflow A-2: Feature-Flag Rollout / Canary

- Flags sind die *einzige* Hebel, mit der Admins Runtime-Verhalten kurzfristig ändern dürfen.
- Jede Flag-Änderung ist audit-geloggt, an einen Ticket-ID gebunden und erfordert 2-Personen-Approval für Produktions-Flags mit Patient-Impact.

Deep-Dive: TM-ARCH-004 §6.

#### Workflow A-3: Circuit Breaker / Rollback

```
[Trigger: Alarm · manuelle Eskalation · Eval-Regression in Prod]
        │
        ▼
[Breaker tripped ──▶ Flags auf "safe mode"]
        │
        ▼
[Coach-LLM deaktiviert · Nur Rule-Engine + Fallbacks]
        │
        ▼
[Root-Cause-Analyse · Fix · Re-Roll-Forward]
        │
        ▼
[Postmortem (TM-ARCH-014 §5)]
```

Deep-Dive: TM-ARCH-004 §7, TM-ARCH-012, TM-ARCH-014.

---

### 5.4 Compliance / Auditor

#### Workflow C-1: Audit-Trail Lookup

- Jede Nutzer-Antwort ist auf genau eine Artefakt-Version rückverfolgbar: `(kb_snippet_id, prompt_version, model_version, guardian_policy_version)`.
- Zugriff nur mit separater Audit-Rolle; jeder Lookup wird selbst geloggt (Watchdog).

Deep-Dive: TM-ARCH-002 §5, TM-ARCH-013.

#### Workflow C-2: DSGVO-Request (Auskunft / Löschung)

```
[Request eingehen (Kontaktkanal)]
        │
        ▼
[Identität bestätigen]
        │
        ▼
[Daten-Inventory (TM-ARCH-008) konsultieren]
        │
        ▼
[Alle Stores abfragen · Export / Löschung triggern]
        │
        ▼
[Bestätigung an Betroffene + Audit-Eintrag]
```

Deep-Dive: TM-ARCH-007 (DPIA), TM-ARCH-008 (Data Inventory).

#### Workflow C-3: Quarterly Review Pack

- Automatisch generierter Bericht: Guardian-Block-Rate, Eskalationen, Changes pro Dokument, offene Risiken, DPIA-Drift, SLO-Erfüllung.
- Wird dem Compliance-Lead und der Klinik-Lead quartalsweise zugestellt.

Deep-Dive: TM-ARCH-011, TM-ARCH-012.

---

### 5.5 On-Call Engineer

#### Workflow E-1: Incident-Triage

```
[Alert]
   │
   ▼
[Dashboard-Link im Pager] ──▶ [Symptom klassifizieren]
   │
   ▼
[Playbook (TM-ARCH-014)]
   │
   ├─▶ Guardian-FP-Spike     ──▶ Flag auf "stricter logging"
   ├─▶ Latenz-Spike          ──▶ Bedrock region fallback
   ├─▶ Eval-Regression       ──▶ Automatischer Circuit Breaker
   └─▶ Security-Signal       ──▶ Eskalation an Security Lead
```

#### Workflow E-2: Circuit Breaker manuell

- Jederzeit verfügbar, durch 2-Personen-Approval in Prod geschützt.
- Auslösen wird dem Klinik-Lead in Echtzeit gemeldet.

#### Workflow E-3: Postmortem

- Blameless, innerhalb 5 Werktagen, mit Action-Items und Datum.
- Findings fließen in Red-Team-Set (TM-ARCH-011) und Runbook (TM-ARCH-014).

---

## 6. Wie Daten durch das System fließen (vereinfacht)

```
 Patient-Input ─▶ Guardian-in ─▶ Orchestrator ─▶ Coach LLM ─▶ Guardian-out ─▶ Patient
                     │              │               │              │
                     ▼              ▼               ▼              ▼
                Log (redact.)   KB / Rules      Prompt/Model  Fact-check ref
                     │              │               │              │
                     └──────────────┴───────┬───────┴──────────────┘
                                            ▼
                                    Observability Plane
                                            │
                                            ▼
                                  Audit-Trail (append-only)
```

Jede Etappe produziert einen Log-Record mit einem gemeinsamen `turn_id`. Daraus ergibt sich die audit-fähige Kette, auf die sich TM-ARCH-002 §5 und TM-ARCH-013 beziehen.

---

## 7. Was dieses Dokument *nicht* ist

- **Kein Bauplan.** Die konkreten Services, Subnetze, IAM-Policies stehen in TM-ARCH-002.
- **Kein Content-Regelwerk.** Was der Coach *sagen darf* und was nicht, steht in TM-ARCH-010 (Red Lines).
- **Kein Governance-Dokument.** Die Regeln für Review, Rollout, Rollback stehen in TM-ARCH-004.
- **Kein Datenschutz-Dokument.** DPIA und Retention stehen in TM-ARCH-007 und TM-ARCH-008.

Wenn du beim Lesen eine dieser Fragen bekommst → Deep-Dive öffnen.

---

## 8. Offene Punkte / Nächste Schritte

1. **Voice-Channel** ist als Block eingezeichnet, aber noch nicht ausmodelliert — Entscheidung offen (Bedrock Voice vs. eigener STT/TTS-Stack).
2. **Multi-Tenant-Variante** (mehrere Kliniken auf einer Instanz) ist nicht Bestandteil dieses MVP; es wird in einer späteren Iteration eigenständig betrachtet.
3. **Offline-/Degraded-Mode** für den Coach (z. B. Bedrock nicht erreichbar) ist in TM-ARCH-014 §4 skizziert, aber noch nicht umgesetzt.

Diese Punkte werden in TM-ARCH-017 (ADRs) als offene Entscheidungen geführt.
