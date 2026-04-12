# Guardian Layer & Persona Setup
## Ergänzung zur Referenzarchitektur

> Dieses Dokument erweitert [`TM-ARCH-001-architecture.md`](./TM-ARCH-001-architecture.md) um zwei Bausteine, die zentral für sichere, personalisierte Konversationen im guardian-demo Cardio Coach sind:
>
> 1. **Guardian Layer** — ein kleines, schnelles Wächter-Modell, das *vor* dem eigentlichen Coaching-LLM läuft und Angriffe, Missbrauch und Fehlverhalten herausfiltert.
> 2. **Persona Setup Agent** — ein kurzes Onboarding-Interview (3–5 Fragen), das Sprache, Tonalität und Assistenten-Namen an den Nutzer anpasst — inklusive harter Blacklists für Schimpfwörter und unangemessene Namen.

---

## 1. Guardian Layer

### 1.1 Was ist der Guardian?

Der Guardian ist ein **separates, kleines Sprachmodell** (z.B. `claude-haiku-4-5`), das *jedes* Nutzer-Input und *jedes* Modell-Output klassifiziert, bevor es weiterläuft. Er ist nicht Teil des "Gedankenprozesses" des Coaches — er ist ein unbestechlicher Türsteher.

Anthropic beschreibt dieses Pattern unter dem Namen **Constitutional Classifiers**: Ein kleiner Klassifikator wird auf synthetischen Daten trainiert, die aus einer expliziten "Verfassung" (Liste erlaubter / verbotener Kategorien) generiert werden. In Anthropics eigenen Tests hielt dieses Setup tausende Stunden Red-Team-Angriffe gegen Claude 3.5 Haiku stand, bei minimalen False-Refusals und vernachlässigbarem Compute-Overhead. Neuere Varianten (*Next-generation Constitutional Classifiers*, *Cost-Effective Classifiers via Representation Re-use*) zeigen, dass sogar lineare Probes auf einem Bruchteil der Modellgröße vergleichbare Erkennungsraten erreichen — d.h. der Schutz ist extrem günstig im Betrieb.

Für guardian-demo übernehmen wir dieses Pattern als **eigenständige Guardian-Komponente**, die von der Haupt-LLM-Kette entkoppelt ist und unabhängig versioniert, evaluiert und ausgetauscht werden kann.

### 1.2 Warum ein eigenes Modell statt "nur Prompts"?

- **Unbeeinflussbar vom Nutzer.** Der Guardian sieht die Nachricht als Klassifikationsaufgabe, nicht als Dialog. Prompt-Injections wie *"ignore previous instructions"* wirken auf ihn nicht, weil er keine Instruktionen aus dem Input übernimmt.
- **Schnell und billig.** Haiku-Klasse Modelle laufen in Millisekunden und kosten einen Bruchteil des Haupt-Calls.
- **Eigene Evaluation.** Guardian und Coach werden *getrennt* evaluiert. Regression im Coach bricht den Guardian nicht — und umgekehrt.
- **Explizite Policy.** Die "Verfassung" ist ein lesbares Dokument (kuratiert mit Klinik- und Compliance-Team), kein versteckter System-Prompt.

### 1.3 Position im Datenfluss

```
User-Nachricht
       │
       ▼
┌──────────────────────────┐
│  GUARDIAN (Input)        │   ←  kleines Modell, Haiku-Klasse
│  • on-topic?             │      Output: strukturiertes JSON
│  • Prompt-Injection?     │      { verdict, categories[], confidence }
│  • Red-Flag / Notfall?   │
│  • Schimpfworte / Toxic? │
│  • PII-Leak-Versuch?     │
│  • Off-label medizinisch?│
└───────┬──────────────────┘
        │
   ┌────┴─────┐
   │          │
 pass      block/route
   │          │
   │          └──► deterministische Vorlage / Eskalation / Refusal
   ▼
┌──────────────────────────┐
│  COACH-LLM (Opus-Klasse) │   ← nur RAG-gegroundete Antworten
└───────┬──────────────────┘
        ▼
┌──────────────────────────┐
│  GUARDIAN (Output)       │   ← gleiches kleines Modell, andere "Verfassung"
│  • Diagnose / Medikament?│
│  • Grounding korrekt?    │
│  • Tonalität / Tabu?     │
│  • Schema / JSON valide? │
└───────┬──────────────────┘
        │
     pass ──► Response Assembler ──► Nutzer
        │
     fail ──► regenerate (1x) ──► sonst Template-Fallback
```

Beide Guardian-Instanzen sind **derselbe Modell-Typ**, aber mit **unterschiedlichen Prompts/Constitutions** — einer für Input-Klassifikation, einer für Output-Validierung.

### 1.4 Die Verfassung (Constitution) — was drin steht

Die Verfassung ist ein versioniertes Markdown-/YAML-Dokument, das vom klinischen Owner + Compliance-Lead unterschrieben wird. Sie enthält:

**Erlaubte Kategorien (Input):**
- Bewegung (Alltag, Einsteiger, Steigerung)
- Ernährung (Alltag, Portionen, Einkauf)
- Rauchfrei (Motivation, Trigger, Rückfall-Prävention)
- Profil-/Zielgespräch
- Smalltalk (begrenzt)
- Technische Fragen zur App

**Verbotene Kategorien (Input & Output):**
- Diagnosen stellen oder bestätigen
- Medikamenten-Empfehlungen oder Dosisänderungen
- Interpretation von Laborwerten, EKG, bildgebenden Befunden
- Notfall-Selbstbehandlung
- Ersatz für Arzt-Konsultation
- Emotionaler / therapeutischer Grenzbereich (Depression, Suizidalität → hart eskalieren)
- Out-of-scope medizinische Themen (Gynäkologie, Pädiatrie, etc.)

**Red Flags (harte Eskalation):**
- Brustschmerz, akute Atemnot, Synkope, neurologische Ausfälle
- Suizid-Äußerungen, Selbst-/Fremdgefährdung
- Akute Schmerzen mit Belastung

**Output-spezifische Regeln:**
- Jede Tatsachen-Aussage muss auf eine KB-Quelle verweisen (`cited_snippet_id`)
- Keine numerischen Schwellenwerte, die nicht aus dem Rule Engine kommen
- Tonalität: wertschätzend, einfache Sprache, keine Schuldzuweisung
- Keine Schimpfwörter, keine diskriminierende Sprache
- Kein Echo von PII aus dem Nutzerprofil, sofern nicht absichtlich

### 1.5 Guardian-Output-Schema (Beispiel)

```json
{
  "verdict": "pass" | "refuse" | "escalate" | "sanitize",
  "categories": ["bewegung", "ontopic"],
  "flags": {
    "prompt_injection": 0.02,
    "red_flag_medical": 0.00,
    "profanity": 0.00,
    "off_topic_medical": 0.00,
    "pii_leak_attempt": 0.00
  },
  "confidence": 0.97,
  "notes": "standard coaching turn"
}
```

Die Orchestrierung entscheidet *deterministisch* anhand dieses Schemas, wohin der Turn geroutet wird — der Coach-LLM sieht den Nutzer-Input nur, wenn `verdict == "pass"`.

### 1.6 Fehlermodi & Fallbacks

| Situation | Guardian-Verdict | Aktion |
|---|---|---|
| Harmloser Coaching-Turn | `pass` | Normaler RAG + Coach-Call |
| Prompt-Injection erkannt | `sanitize` | Input wird gestrippt, Coach sieht nur die sanitisierte Version, Vorfall wird geloggt |
| Red Flag (Brustschmerz o.ä.) | `escalate` | Kein LLM-Call, deterministische Eskalations-Vorlage + Arzt-Kontaktkarte |
| Off-Topic medizinisch | `refuse` | Freundliche Ablehnung + Hinweis auf Arzt |
| Schimpfwort / Toxic | `refuse` | Freundliche Deeskalation, Bitte um respektvolle Formulierung |
| Guardian-Modell selbst down | n/a | **Fail closed**: Vorlage "Ich bin gerade kurz nicht verfügbar, bitte versuche es in einem Moment erneut." Kein Coach-Call ohne Guardian. |

**Wichtig:** Der Guardian ist ein **Hard Dependency**. Fällt er aus, fällt der gesamte AI-Path in den sicheren Modus. Das ist bewusst so — lieber kurz keine Antwort als eine ungefilterte.

### 1.7 Evaluierung

- Eigener Red-Team-Datensatz für den Guardian (DE + EN Jailbreaks, Medical-Traps, Emotional-Manipulation).
- Goldener Datensatz mit bekannten harmlosen Coaching-Fragen — für False-Refusal-Monitoring.
- Kontinuierlicher Drift-Monitor: wöchentlicher Run, Alerting bei Regression.
- KPI: Attack-Catch-Rate, False-Refusal-Rate, p50-Latenz, Kosten pro 1k Turns.

---

## 2. Persona Setup Agent

### 2.1 Motivation

guardian-demo adressiert eine breite Nutzergruppe — vom IT-affinen Techniker bis zur Rentnerin, die zum ersten Mal einen Gesundheits-Chatbot nutzt. Ein einheitlicher Tonfall passt nicht: der eine will kurze, präzise Anweisungen, die andere eine warme, erklärende Begleitung. Zusätzlich kann der Nutzer dem Assistenten einen Namen geben, was erwiesenermaßen die Bindung und Adhärenz erhöht.

Der **Persona Setup Agent** führt beim Onboarding ein kurzes Interview (3–5 Fragen), erzeugt daraus eine **Persona-Datei** (angelehnt an das `soul.md`-Pattern, das AI-Agent-Identität als versioniertes Markdown beschreibt) und speichert diese im Nutzer-Profil. Der Coach-LLM lädt sie bei jedem Turn als Teil seines Kontexts.

### 2.2 Das Interview (3–5 Fragen)

Die Fragen sind **fix und kuratiert** — nicht vom LLM generiert. Der Setup-Agent stellt sie deterministisch, das LLM interpretiert nur die freien Antworten und extrahiert strukturierte Attribute.

1. **Sprache & Ansprache** — *"Wie möchtest du angesprochen werden? Per Du, per Sie, oder mit einem anderen Namen?"*
   → extrahiert: `form_of_address` (du/sie), `display_name`.

2. **Tonalität** — *"Magst du es lieber locker und motivierend, oder ruhig und sachlich?"*
   → extrahiert: `tone` (`casual_motivating` / `calm_factual` / `warm_supportive`).

3. **Sprachniveau** — *"Soll ich einfache Alltagssprache benutzen, oder darf ich auch medizinische Begriffe verwenden, die du erklärt bekommst?"*
   → extrahiert: `language_level` (`plain` / `explained_medical` / `professional`).

4. **Assistenten-Name** *(optional)* — *"Möchtest du mir einen Namen geben? Ich heiße standardmäßig 'Coach'. Du kannst auch etwas anderes wählen."*
   → extrahiert: `assistant_name`. **Blacklist-geprüft** (siehe 2.4).

5. **Vorerfahrung** — *"Hast du schon mal mit einem Gesundheits-Coach oder einer App für Bewegung/Ernährung gearbeitet?"*
   → extrahiert: `prior_experience` (`none` / `some` / `experienced`).

Das sind **5 Fragen maximal**, alle überspringbar → sichere Defaults greifen.

### 2.3 Was die Persona-Datei enthält

Strukturiert als YAML (nicht Freitext!), versioniert pro Nutzer, clinical-ownable. Inspiriert vom `soul.md`-Pattern, aber mit klar abgegrenzten Slots statt Prosa — weil Freitext in einem medizinischen Kontext das Output-Guardrail umgehen könnte.

```yaml
# persona/<subject_id_hash>.yaml
schema_version: 1
assistant_name: "Coach"            # validiert gegen Blacklist
form_of_address: "du"             # du | sie
display_name: "Lisa"              # validiert gegen Blacklist
tone: "warm_supportive"           # casual_motivating | calm_factual | warm_supportive
language_level: "plain"           # plain | explained_medical | professional
prior_experience: "some"
jargon_hints:                     # max 5, whitelist-geprüft
  - "Spaziergang statt 'moderate Intensität'"
locale: "de-DE"
created_at: "2026-04-11T10:00:00Z"
created_by: "persona_setup_agent_v1"
reviewed: false                   # true wenn Klinik-Review erfolgt
```

### 2.4 Blacklist & Naming-Regeln

**Zwei Blacklist-Stufen** für `assistant_name` und `display_name`:

1. **Harte Denylist** (regex + wordlist, mehrsprachig):
   - Schimpfwörter, sexuelle Begriffe, diskriminierende Sprache
   - Namen geschützter Marken / medizinischer Institutionen
   - Geschlechts-/Rassen-/Religions-Slurs
   - Reservierte System-Namen (`admin`, `arzt`, `doctor`, `notarzt`, `guardian-demo`, …)
2. **LLM-Classifier-Check** (Guardian im "Naming-Mode"):
   - Prüft auf subtile Umgehungen (l33t-Speak, Leetspeak, Anagramme)
   - Prüft auf "suggestive" Namen, die den medizinischen Kontext untergraben
   - Prüft auf Namen, die als echte Ärzte gelesen werden könnten

**Wenn einer der Checks failt:** freundliche Wiederholung — *"Den Namen kann ich leider nicht verwenden. Magst du einen anderen wählen?"* — mit maximal 3 Versuchen, danach Default `"Coach"`.

Die Denylist ist ein **eigenes, versioniertes Artefakt** (`config/name-denylist.yaml`), nicht hartkodiert — damit Compliance / Klinik-Team Änderungen auditierbar vornehmen kann.

### 2.5 Wie der Coach die Persona nutzt

Die Persona-Datei wird **nicht als Freitext** in den System-Prompt gespielt. Stattdessen werden ihre Slots in ein **strukturiertes Persona-Fragment** gerendert, das der Coach-LLM als Teil seines Kontexts erhält:

```
PERSONA:
- Name des Assistenten: Coach
- Ansprache des Nutzers: du, "Lisa"
- Tonalität: warm_supportive (freundlich, wertschätzend, ermutigend)
- Sprachniveau: plain (Alltagssprache, keine Fachbegriffe ohne Erklärung)
- Vorerfahrung Nutzer: some
```

Dazu kommen **statische Stilregeln** aus dem System-Prompt, die der Nutzer **nicht überschreiben kann**:
- Nie verurteilend
- Nie Diagnosen / Medikamente / Dosen
- Nie Schimpfwörter, auch wenn der Nutzer welche benutzt
- Deutsch als Default-Sprache, Fallback auf Englisch nur wenn explizit
- Immer höflich eskalieren bei Red Flags

Die Persona beeinflusst also **wie** der Coach spricht, nicht **was** er darf. Die Red Lines bleiben unverändert.

### 2.6 Architektur-Integration

```
        ┌───────────────────────┐
        │  Onboarding UI        │
        │  (Web / Mobile / Voice)│
        └──────────┬────────────┘
                   │ 3–5 Fragen, deterministisch
                   ▼
        ┌───────────────────────┐
        │  Persona Setup Agent  │
        │  (Lambda / AgentCore) │
        │  1. Fragen stellen    │
        │  2. Antworten parsen  │
        │     (Haiku, JSON-Out) │
        │  3. Blacklist-Check   │
        │  4. Guardian-Name-Check│
        │  5. YAML schreiben    │
        └──────────┬────────────┘
                   │
                   ▼
        ┌───────────────────────┐
        │  User Profile Store   │
        │  (Aurora, KMS)        │
        │  persona.yaml (v1)    │
        └──────────┬────────────┘
                   │ read at turn time
                   ▼
        ┌───────────────────────┐
        │  Coach Orchestrator   │
        │  injects persona      │
        │  fragment into prompt │
        └───────────────────────┘
```

Auf AWS-Seite (siehe [`TM-ARCH-002-aws-bedrock.md`](./TM-ARCH-002-aws-bedrock.md)) läuft der Setup-Agent als separater **Bedrock AgentCore Workflow** mit einem einzigen Tool (`save_persona`), der beim ersten Login einmalig aufgerufen wird. Die Antworten durchlaufen denselben Guardian wie reguläre Turns — plus den zusätzlichen Naming-Check.

### 2.7 Änderungen & Re-Setup

- Nutzer kann die Persona jederzeit im Settings-Screen anpassen.
- Jede Änderung erzeugt eine neue Version; Historie bleibt in Aurora (auditierbar).
- Klinik-Team kann eine Persona als "reviewed" markieren — nur reviewed Personas werden in Studien / Auswertungen mit aufgenommen.
- Beim Zurücksetzen wird der Nutzer erneut durchs Interview geführt.

---

## 3. Zusammenspiel mit bestehender Architektur

Beide Komponenten fügen sich **additiv** in die Referenzarchitektur ein:

| Baustein | Position | Hängt ab von | Wird genutzt von |
|---|---|---|---|
| Guardian (Input) | Vor dem Coach-Orchestrator | — | Orchestrator, Audit Log |
| Guardian (Output) | Nach dem Coach-LLM, vor Output-Validatoren | Constitutional Classifier | Orchestrator, Eval Harness |
| Persona Setup Agent | Einmalig beim Onboarding + bei Re-Setup | Guardian, Blacklist-Service | User Profile, Coach Orchestrator |
| Persona-Datei | User Profile Store | — | Coach-LLM (als Context-Fragment) |
| Name-Denylist | Config-Artefakt | Compliance-Review | Persona Setup Agent |

Die Red Lines aus der bestehenden Rule Engine bleiben die **oberste** Instanz. Guardian und Persona sind *Verstärker* und *Personalisierer*, keine Ersatz-Mechanismen.

---

## 4. Offene Fragen

1. **Haiku-Version des Guardian-Modells pinnen** — welches? (`claude-haiku-4-5` ist aktuell sinnvoll, Regional EU prüfen.)
2. **Constitution-Versionierung** — wer approved? Vorschlag: Klinik-Owner + Compliance-Lead, 4-Augen-Prinzip, Git-basierte Review.
3. **Name-Denylist Sprachabdeckung** — DE/EN initial, später TR/AR?
4. **Setup-Interview per Voice** — soll das Onboarding auch via Voice möglich sein, oder nur Text im ersten Release?
5. **Persona-Drift** — sollen wir nach *n* Wochen re-fragen ("Passt die Ansprache noch?")?
6. **Guardian-Kosten** — Budget-Cap pro Turn; ab welchem Volumen lohnt sich Representation Re-use (lineare Probe auf Haiku-Embeddings statt separatem Call)?

---

## Quellen

- Anthropic — *Constitutional Classifiers: Defending against universal jailbreaks*. https://www.anthropic.com/research/constitutional-classifiers
- Anthropic — *Next-generation Constitutional Classifiers: More efficient protection against universal jailbreaks*. https://www.anthropic.com/research/next-generation-constitutional-classifiers
- Anthropic Alignment — *Cost-Effective Constitutional Classifiers via Representation Re-use*. https://alignment.anthropic.com/2025/cheap-monitors/
- Sharma, Tong et al. (2025) — *Constitutional Classifiers: Defending against Universal Jailbreaks*. https://arxiv.org/pdf/2501.18837
- Anthropic Docs — *Mitigate jailbreaks and prompt injections*. https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
- Anthropic — *Mitigating the risk of prompt injections in browser use*. https://www.anthropic.com/research/prompt-injection-defenses
- Anthropic — *Claude Haiku 4.5 System Card*. https://assets.anthropic.com/m/99128ddd009bdcb/Claude-Haiku-4-5-System-Card.pdf
- aaronjmars — *soul.md: Build a composable AI agent identity*. https://github.com/aaronjmars/soul.md
- SOUL.MD — https://www.soul-md.xyz/
