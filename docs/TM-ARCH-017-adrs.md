# Architecture Decision Records (ADRs)
## guardian-demo Cardio Coach

> ADRs halten fest, **warum** wir uns für bestimmte Architektur-Entscheidungen entschieden haben — nicht **was** der aktuelle Zustand ist (das steht in den anderen TM-ARCH-Dokumenten). Sie sind der billigste Kontext für Re-Reviews in 6 oder 18 Monaten, wenn wir uns fragen *„warum machen wir das eigentlich so?"*.
>
> Format: **Short-Form ADRs** nach Michael Nygard. Jeder Eintrag hat Status, Kontext, Entscheidung, Konsequenzen. Lang genug, um in Zukunft verständlich zu sein, kurz genug, um nicht gepflegt werden zu müssen.

**Stand:** 0.1 — Draft · **Owner:** ML/Platform Admin · **Review-Zyklus:** neue ADRs on-demand; bestehende werden nicht umgeschrieben, nur mit Status-Updates oder Superseded-Links ergänzt.

---

## Konventionen

- ADRs sind **unveränderlich**. Wenn sich eine Entscheidung ändert, wird ein neues ADR angelegt, das das alte `supersedes`.
- Status: `Proposed`, `Accepted`, `Superseded`, `Deprecated`, `Rejected`.
- Nummerierung: `ADR-001` aufsteigend. Keine Lücken.
- Kurz halten: wenn ein ADR länger als 1 Bildschirmseite wird, ist es wahrscheinlich ein Architektur-Dokument und gehört nicht hierhin.

---

## ADR-001 — Guardrailed LLM statt freiem Chat

**Status:** Accepted · **Datum:** 2026-02-15

### Kontext

Das MVP war ursprünglich als "Coach-Chat mit ein paar Regeln davor" gedacht. Erste Red-Team-Versuche haben gezeigt, dass das LLM-Modell ohne harte Strukturen zu leicht aus dem Scope gedrängt werden kann — besonders bei Medikations- und Diagnose-Fragen.

### Entscheidung

Wir setzen konsequent auf das Constitutional-Classifier-Pattern: ein kleiner Guardian davor, ein kleiner Guardian danach, Coach-LLM in der Mitte, und eine deterministische Rule Engine, die alles nicht-kreative Fachliche beantwortet.

### Konsequenzen

- Höhere Kosten pro Turn (zwei zusätzliche LLM-Calls pro Turn).
- Zusätzliche Komplexität im Eval-Harness.
- *Aber:* robustes Sicherheitsverhalten, klar überprüfbar, auditierbar.

**Related:** TM-ARCH-001, TM-ARCH-003, TM-ARCH-010

---

## ADR-002 — AWS Bedrock als LLM-Plattform

**Status:** Accepted · **Datum:** 2026-02-20

### Kontext

Kandidaten: AWS Bedrock, Azure OpenAI, OpenAI direkt, selbst gehostete Open-Weights-Modelle. Kriterien: EU-Region, kein Training auf Nutzerdaten, AVV-Fähigkeit, Skalierbarkeit, Modellqualität, Entwicklungs-Geschwindigkeit.

### Entscheidung

AWS Bedrock in `eu-central-1`. Claude-Familie als Standard (Sonnet für Coach, Haiku für Guardian).

### Konsequenzen

- Ein Provider, ein AVV, eine Kostenstelle.
- Abhängigkeit von AWS-Preisentwicklung und Modellverfügbarkeit.
- Exit-Pfad: die Architektur ist in TM-ARCH-001 vendor-neutral; ein Wechsel auf einen anderen Provider ist mit Aufwand, aber ohne Architektur-Bruch machbar.

**Related:** TM-ARCH-002, TM-ARCH-015

---

## ADR-003 — Keine autonomen Tools für das Coach-LLM im MVP

**Status:** Accepted · **Datum:** 2026-02-22

### Kontext

Bedrock AgentCore bietet Tool-Use-Fähigkeiten (Funktionen, externe APIs). Das wäre verlockend für personalisierte Features (Termin-Reminder, Aktivitäts-Reminder). Threat-Model-Review hat gezeigt, dass damit neue Angriffsflächen entstehen (Excessive Agency, Data Exfiltration über Tool-Call-Argumente).

### Entscheidung

Im MVP keine freien Tools. Jede Aktion, die das System nach außen wirkt, läuft durch den Orchestrator und ist deterministisch.

### Konsequenzen

- Weniger Wow-Effekt im ersten Release.
- Klar abgrenzbares Verhalten, viel einfacheres Threat Model.
- Wird in ADR-xxx später re-visited, wenn der Stack stabil ist und wir klare Tool-Use-Governance haben.

**Related:** TM-ARCH-009

---

## ADR-004 — Markdown-first für Architektur-Dokumente, PDF aus Build

**Status:** Accepted · **Datum:** 2026-03-02

### Kontext

Architektur-Dokumente müssen von Klinik, Compliance, Engineering und Produkt gleichermaßen gelesen werden — aber gleichzeitig git-basiert versioniert und diff-bar sein. PDF-only funktioniert für den ersten Fall, nicht für den zweiten. Word-Dokumente funktionieren für keinen von beiden gut.

### Entscheidung

Quelle sind `.md`-Dateien in `docs/`. Ein Build-Skript (`docs/_build/build.sh`) erzeugt styled HTML + PDF aus den Markdowns. PDFs liegen in `docs/pdf/` und sind die Verteil-Artefakte.

### Konsequenzen

- Diagramme sind ASCII-Boxen, weil sie diff-bar sein sollen — manchmal etwas sperrig.
- Build-Pipeline ist eine Komponente, die gepflegt werden muss.
- Reviewer können Einzelzeilen kommentieren, und Stakeholder bekommen trotzdem schöne PDFs.

**Related:** `docs/_build/README.md`, README.md

---

## ADR-005 — Nicht-MDR-Scope im MVP

**Status:** Accepted · **Datum:** 2026-03-05

### Kontext

Siehe TM-ARCH-006. Die Frage, ob der Coach ein Medizinprodukt nach MDR ist, entscheidet über Aufwand, Zeitplan und ob ein Benannte-Stelle-Prozess notwendig ist.

### Entscheidung

Produkt-Scope wird so eng gehalten (keine Diagnose, keine Medikation, keine Vitalwerte, keine Notfall-Triage), dass es als Lifestyle-/Wellness-Tool bleibt. Jede Scope-Ausweitung triggert eine Re-Klassifikation.

### Konsequenzen

- Kein CE-Zertifizierungs-Prozess im MVP.
- Scope-Grenzen müssen im Guardian und in der Content Constitution (TM-ARCH-010) hart durchgesetzt werden.
- Jede Feature-Idee, die diese Grenzen anfasst, ist eine regulatorische Entscheidung.

**Related:** TM-ARCH-006, TM-ARCH-010

---

## ADR-006 — DynamoDB statt relationaler DB für User-Daten

**Status:** Accepted · **Datum:** 2026-03-10

### Kontext

Anforderungen: Low-Touch-Betrieb, EU-Region, KMS-CMK, schnelle Item-Lookups, einfache Löschkaskade. RDS wäre ein vertrauter Griff, bringt aber Instanz-Pflege und Patching. Aurora Serverless v2 ist eine Option, aber teurer und komplexer zu segmentieren.

### Entscheidung

DynamoDB mit einem klaren Single-Table-Design, on-demand Billing. Pro-User-Partition-Key, einfaches GSI für Audit-Queries.

### Konsequenzen

- Migrations und Schema-Änderungen müssen diszipliniert erfolgen.
- Analytische Queries laufen nicht direkt — werden über den Observability-Path (TM-ARCH-013) aggregiert.
- Für den MVP-Scope passt das.

**Related:** TM-ARCH-008

---

## ADR-007 — Judge-LLM getrennt vom Coach-LLM

**Status:** Accepted · **Datum:** 2026-03-14

### Kontext

Um Groundedness und Helpfulness objektiv zu messen (TM-ARCH-011), brauchen wir einen „Richter". Option A: das Coach-LLM prüft sich selbst. Option B: ein separates LLM mit eigener Version und Meta-Eval.

### Entscheidung

Option B. Judge-LLM ist ein eigenständiges Registry-Artefakt, eigene Version, eigenes Meta-Eval gegen menschlich gelabeltes Set.

### Konsequenzen

- Zusätzliche Kosten (wird in TM-ARCH-015 eingerechnet).
- Verhindert systematische Selbst-Beruhigung („der Coach hält sich selbst für gut").

**Related:** TM-ARCH-011

---

## ADR-008 — Fail-closed für Guardian

**Status:** Accepted · **Datum:** 2026-03-18

### Kontext

Wenn der Guardian nicht verfügbar ist, gibt es zwei Optionen: (a) Requests durchlassen (fail-open), (b) Requests blockieren (fail-closed). Option (a) ist für Verfügbarkeit besser, für Sicherheit schlechter.

### Entscheidung

Fail-closed. Wenn der Guardian nicht antwortet, antwortet der Coach nicht. Stattdessen wird der Degraded-Mode aktiviert (TM-ARCH-014 §4).

### Konsequenzen

- SLO-seitig: Guardian-Downtime ist 1:1 Coach-Downtime.
- Erfordert robusten Guardian-Betrieb und Multi-Region-Fallback.
- Dafür: kein Risiko, dass ein Downtime-Fenster ein Sicherheits-Schlupfloch öffnet.

**Related:** TM-ARCH-003, TM-ARCH-012

---

## ADR-009 — Keine Nutzerdaten für Modell-Training

**Status:** Accepted · **Datum:** 2026-03-20

### Kontext

Verlockend: aus echten Konversationen lernen und den Coach besser machen. Problem: DSGVO, Vertraulichkeit, Bias-Risiken, und Provider-Policy.

### Entscheidung

**Keine** Nutzung von Konversationsdaten für Modell-Training, weder Fine-Tuning noch Embedding-Training. Alle Modell-Parameter bleiben statisch; Iterationen passieren auf Prompts, Content und Guardian-Policies.

### Konsequenzen

- Qualitätsverbesserung erfolgt *auf anderen Wegen* (bessere Content-Kuration, bessere Prompts, besseres Retrieval).
- DSGVO-Bild bleibt sauber.
- Ausnahme-Prozess für anonymisierte Aggregate-Insights ist erlaubt, aber erfordert DPO-Freigabe.

**Related:** TM-ARCH-007, TM-ARCH-008

---

## ADR-010 — ASCII-Diagramme statt Draw.io/Mermaid

**Status:** Accepted · **Datum:** 2026-03-25

### Kontext

Diagramme sind wichtig für Architektur-Docs, müssen aber in git diff-bar bleiben, ohne externe Tools zu erzwingen. Mermaid wäre eine Option (textlich, aber angewiesen auf Renderer). ASCII ist maximal portabel, aber weniger schön.

### Entscheidung

ASCII / Box-Drawing als Standard. Mermaid erlaubt für Sequenz-Diagramme, wenn ASCII zu eng wird. Keine Binär-Bilder im Architektur-Pfad.

### Konsequenzen

- Diagramme sind nie visuell perfekt — aber immer diff-bar.
- Manche Details gehen in Prosa statt ins Bild. Das ist okay.

**Related:** ADR-004

---

## Offene / geplante Entscheidungen (Proposed)

Die folgenden Themen brauchen eigene ADRs, sobald wir sie entscheiden. Sie sind hier gelistet, damit niemand denkt, sie seien vergessen.

- **ADR-011 (Proposed):** Voice-Channel — Bedrock Voice, eigener STT/TTS-Stack, oder Dritt-Anbieter? Siehe TM-ARCH-005 §8.
- **ADR-012 (Proposed):** Multi-Tenant-Variante (mehrere Kliniken) — Isolation-Modell und Daten-Architektur.
- **ADR-013 (Proposed):** Pager-System-Auswahl (PagerDuty vs. Grafana OnCall).
- **ADR-014 (Proposed):** Incident-Management-Tool (incident.io vs. FireHydrant).
- **ADR-015 (Proposed):** Produktiv-Org-Struktur — juristische Entität, Rollen, Verträge vor GA.
- **ADR-016 (Proposed):** Prompt-Caching-Strategie, sobald Bedrock das stabil unterstützt.
