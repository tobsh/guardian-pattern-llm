# Architektur-Dokumentation — Leseanleitung
## guardian-demo Cardio Coach · Überblick über alle Dokumente

> Dieses Dokument ist der **Einstiegspunkt** für alle Architektur-Unterlagen des guardian-demo Cardio Coaches. Es beschreibt, welche Dokumente es gibt, wofür jedes gedacht ist, und in welcher Reihenfolge welche Person sie lesen sollte.

---

## 1. Die Dokumenten-Familie auf einen Blick

| ID | Dokument | Was es beantwortet | Umfang |
|---|---|---|---|
| **TM-ARCH-000** | Diese Leseanleitung | *"Wo fange ich an, was soll ich lesen?"* | 3 S. |
| **TM-ARCH-001** | [Guardrailed AI Referenzarchitektur](./pdf/TM-ARCH-001-architecture.pdf) | *"Wie ist das System aufgebaut, damit der Coach sicher und ehrlich bleibt?"* | ~15 S. |
| **TM-ARCH-002** | [AWS Bedrock & AgentCore Umsetzung](./pdf/TM-ARCH-002-aws-bedrock.pdf) | *"Wie setzen wir das konkret auf AWS um — compliance- und security-by-design?"* | ~20 S. |
| **TM-ARCH-003** | [Guardian Layer & Persona Setup](./pdf/TM-ARCH-003-guardian-and-persona.pdf) | *"Wie schützt uns ein kleines Wächter-Modell vor Missbrauch, und wie personalisiert der Coach Ton und Namen?"* | ~12 S. |
| **TM-ARCH-004** | [Content Governance & MLOps](./pdf/TM-ARCH-004-mlops-content-governance.pdf) | *"Wie kommen neue Inhalte sicher ins System, wie rollen wir zurück, und wer gibt was frei?"* | ~18 S. |
| **TM-ARCH-005** | [System Overview — Gesamtarchitektur, Personas & Workflows](./pdf/TM-ARCH-005-system-overview.pdf) | *"Wie hängt alles zusammen und was heißt das für mich in meiner Rolle?"* | ~15 S. |
| **TM-ARCH-006** | [Clinical Safety Case & MDR-Einordnung](./pdf/TM-ARCH-006-clinical-safety-mdr.pdf) | *"Ist das ein Medizinprodukt, und welche Scope-Grenzen tragen die Einstufung?"* | ~12 S. |
| **TM-ARCH-007** | [DPIA — Datenschutz-Folgenabschätzung](./pdf/TM-ARCH-007-dpia.pdf) | *"Ist die Verarbeitung DSGVO-konform, und was sind die Maßnahmen?"* | ~14 S. |
| **TM-ARCH-008** | [Data Inventory & PII Classification](./pdf/TM-ARCH-008-data-inventory.pdf) | *"Welches Datum liegt wo, wie lange, wer darf drauf, wie löschen wir es?"* | ~12 S. |
| **TM-ARCH-009** | [Threat Model](./pdf/TM-ARCH-009-threat-model.pdf) | *"Wer greift an, wie, und wie verteidigen wir uns?"* | ~13 S. |
| **TM-ARCH-010** | [Red Lines & Clinical Constitution](./pdf/TM-ARCH-010-red-lines-constitution.pdf) | *"Was darf der Coach nie sagen, und warum nicht?"* | ~12 S. |
| **TM-ARCH-011** | [Evaluation & Red-Teaming](./pdf/TM-ARCH-011-evaluation-red-team.pdf) | *"Wie beweisen wir, dass er funktioniert und sicher ist?"* | ~11 S. |
| **TM-ARCH-012** | [SLOs & Error Budgets](./pdf/TM-ARCH-012-slo-error-budget.pdf) | *"Welche Ziele hat der Betrieb, und was passiert, wenn sie reißen?"* | ~9 S. |
| **TM-ARCH-013** | [Observability Plan](./pdf/TM-ARCH-013-observability.pdf) | *"Was sehen wir vom System — ohne PII zu exponieren?"* | ~11 S. |
| **TM-ARCH-014** | [Runbook & On-Call Playbook](./pdf/TM-ARCH-014-runbook-oncall.pdf) | *"Was tut On-Call, wenn um 3 Uhr morgens etwas brennt?"* | ~10 S. |
| **TM-ARCH-015** | [Cost Model](./pdf/TM-ARCH-015-cost-model.pdf) | *"Was kostet ein Turn, ein Monat, und wo sind die Hebel?"* | ~8 S. |
| **TM-ARCH-016** | [Rollout Plan](./pdf/TM-ARCH-016-rollout-plan.pdf) | *"Wie kommen wir vom Prototyp zu echten Patient:innen — ohne uns zu übernehmen?"* | ~9 S. |
| **TM-ARCH-017** | [Architecture Decision Records](./pdf/TM-ARCH-017-adrs.pdf) | *"Warum haben wir es damals genau so entschieden?"* | wachsend |

Die Markdown-Quellen liegen unter `docs/` (zum Arbeiten), die verteilbaren PDFs unter `docs/pdf/`.

**Wer nur ein Dokument lesen möchte, liest TM-ARCH-005 — das ist die integrierte Draufsicht, die von allen anderen auf Block-Ebene abstrahiert.**

---

## 2. Lesepfade nach Rolle

Nicht jede:r muss alles lesen. Diese Pfade bringen jede Rolle in minimaler Zeit an das relevante Wissen.

### 2.1 Ärzt:innen & klinische Stakeholder

> **Frage, die euch bewegt:** *"Kann dieser Coach meinen Patient:innen schaden? Wer kontrolliert, was er sagt?"*

1. **TM-ARCH-000** (dies hier) — 5 min, für den Rahmen.
2. **TM-ARCH-001 — Kapitel 1, 4, 5, 10** — 15 min, die Kern-Versprechen und roten Linien.
3. **TM-ARCH-003 — Kapitel 1.1–1.4, 2.1–2.4** — 15 min, Guardian-Prinzip und Persona-Interview.
4. **TM-ARCH-004 — Kapitel 3, 4, 7** — 15 min, 4-Augen-Prinzip, Workbench, Circuit Breaker.

Insgesamt ~50 Minuten. Danach könnt ihr kompetent über Inhalte, Eskalationen und Freigabe-Prozess mitentscheiden.

### 2.2 Compliance, Datenschutz & Audit

> **Frage, die euch bewegt:** *"Ist das DSGVO-konform, auditierbar, und nachvollziehbar?"*

1. **TM-ARCH-000** — 5 min.
2. **TM-ARCH-002 — Kapitel 4 (Security), 5 (Compliance), 8 (Failure Modes)** — 20 min.
3. **TM-ARCH-003 — Kapitel 1.4 (Constitution), 2.4 (Denylist)** — 10 min.
4. **TM-ARCH-004 — Kapitel 3, 7, 9, 11** — 25 min, 4-Augen, Circuit Breaker, Pipeline-Gates, Security.

Insgesamt ~60 Minuten. Danach habt ihr die vollständige Audit-Kette vom Commit bis zur Nutzer-Antwort im Kopf.

### 2.3 Engineering & ML-Ops

> **Frage, die euch bewegt:** *"Wie baue ich das, und wie betreibe ich es stabil?"*

1. **TM-ARCH-000** — 5 min.
2. **TM-ARCH-001** — vollständig — 30 min.
3. **TM-ARCH-002** — vollständig — 45 min. Das ist euer Bauplan.
4. **TM-ARCH-003** — vollständig — 25 min. Guardian + Setup-Agent sind eigene Services.
5. **TM-ARCH-004** — vollständig — 40 min. CI/CD, Feature Flags, Circuit Breaker.

Insgesamt ~2,5 h. Danach habt ihr das komplette System-Bild.

### 2.4 Produkt, UX, Content-Owner

> **Frage, die euch bewegt:** *"Wie arbeiten wir im Alltag mit diesem System, und was können Nutzer:innen erwarten?"*

1. **TM-ARCH-000** — 5 min.
2. **TM-ARCH-001 — Kapitel 1, 5** — 15 min, Prinzipien + Beispiel-Turns.
3. **TM-ARCH-003 — Kapitel 2** — 15 min, Persona Setup Flow.
4. **TM-ARCH-004 — Kapitel 4, 6** — 20 min, Content Workbench + Feature Flags.

Insgesamt ~55 Minuten. Danach könnt ihr Content-Workflows planen und Nutzer-Erwartungen setzen.

### 2.5 Leitung & Entscheider:innen

> **Frage, die euch bewegt:** *"Trägt diese Architektur das Produkt, und wo sind die Risiken?"*

1. **TM-ARCH-000** — 5 min.
2. **TM-ARCH-001 — Kapitel 1, 10** — 10 min, Leitplanken und Verweigerungen.
3. **TM-ARCH-002 — Kapitel 0 (TL;DR), 10 (Next Steps)** — 10 min.
4. **TM-ARCH-003 — Einleitung + Kapitel 2.1** — 5 min.
5. **TM-ARCH-004 — Kapitel 1, 7, 9.3** — 15 min, warum Governance, wie Circuit Breaker, Environments.

Insgesamt ~45 Minuten. Genug, um Budget-, Risiko- und Roadmap-Entscheidungen fundiert zu treffen.

---

## 3. Wie die Dokumente logisch zusammenhängen

```
                 ┌─────────────────────────────┐
                 │  TM-ARCH-000                │
                 │  Leseanleitung (dies hier)  │
                 └──────────────┬──────────────┘
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │  TM-ARCH-001                │
                 │  Referenzarchitektur        │
                 │  (vendor-neutral, konzept.) │
                 └──────┬──────────┬───────────┘
                        │          │
                        ▼          ▼
          ┌─────────────────────┐  ┌─────────────────────┐
          │  TM-ARCH-002        │  │  TM-ARCH-003        │
          │  AWS-Umsetzung      │  │  Guardian & Persona │
          │  (Bedrock/AgentCore)│  │  (Addendum)         │
          └──────────┬──────────┘  └──────────┬──────────┘
                     │                        │
                     └───────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  TM-ARCH-004            │
                    │  Content Governance     │
                    │  & MLOps                │
                    │  (Betrieb & Lifecycle)  │
                    └─────────────────────────┘
```

- **TM-ARCH-001** definiert, *was* das System tut und welche Prinzipien gelten.
- **TM-ARCH-002** erklärt, *womit* wir es bauen (AWS-Services, Netzwerk, Compliance).
- **TM-ARCH-003** ergänzt zwei zentrale Sicherheits- und UX-Bausteine, die quer zu beidem liegen.
- **TM-ARCH-004** beschreibt, *wie wir es im Alltag sicher verändern und betreiben*.

Ein neues Architektur-Artefakt wird in der Regel zuerst in TM-ARCH-001 angedacht, dann in TM-ARCH-002 konkret gemacht, und die Regeln für seinen Lifecycle kommen aus TM-ARCH-004.

---

## 4. Wer ist Ansprechpartner:in?

| Thema | Rolle |
|---|---|
| Klinische Inhalte, Leitlinien, Red Lines | Klinischer Lead (guardian-demo Cardio) |
| Compliance, DSGVO, BSI C5, Audit | Datenschutz- / Compliance-Lead |
| Architektur, ML, Infrastruktur, Kosten | ML / Engineering Lead |
| Content-Workbench, UX | Produkt / UX Lead |
| Eskalation im Betrieb (Circuit Breaker) | On-Call Engineering + Klinischer Lead |

Konkrete Namen pflegen wir außerhalb dieses Dokuments (Pflege-Aufwand, Fluktuation) — siehe Runbook im internen Wiki.

---

## 5. Status der Dokumente

Alle vier Dokumente sind derzeit in **Version 0.1 — Draft** und warten auf die erste Runde Stakeholder-Review.

- **Nächster Meilenstein:** Review durch Klinik-Lead und Compliance, dann Freigabe als Version 1.0.
- **Aktualisierungs-Kadenz:** bei Architektur-Änderungen sofort; quartalsweiser Review auch ohne Änderung (haben wir blinde Flecken?).
- **Versionierung:** Semantic Versioning (major.minor) — Major-Bump bei Architektur-Bruch, Minor bei additiver Änderung.

---

## 6. Konventionen in allen Dokumenten

- **Sprache**: Deutsch, Fachbegriffe englisch wenn etabliert (*Guardrail*, *Circuit Breaker*).
- **Zielgruppe**: gemischt klinisch + technisch; Fachbegriffe werden beim ersten Auftreten erklärt.
- **Diagramme**: ASCII / Box-Drawing, damit sie in Git diff-bar bleiben und nicht als Binärdatei verloren gehen.
- **Code-Beispiele**: illustrativ, kein Produktions-Code.
- **Klassifizierung**: *Confidential*, Autor: Tobias Hutzler.
- **Quellen**: wenn wir auf externe Patterns referenzieren (Anthropic Constitutional Classifiers, soul.md, etc.), stehen URLs unten im jeweiligen Dokument.

---

## 7. Feedback & Änderungen

- **Fehler / Unklarheiten**: Issue im Repo mit Label `docs/architecture`.
- **Substantielle Änderungen**: Pull Request mit zweitem Reviewer aus derselben Domäne (siehe TM-ARCH-004, Kapitel 3).
- **Neue Architektur-Themen**: neues Dokument `architecture-<thema>.md` anlegen und in `docs/_build/build-html.py` registrieren.
- **Rebuild PDFs**: `./docs/_build/build.sh`.
