# Observability Plan
## guardian-demo Cardio Coach

> Wie wir sehen, was das System tut — ohne das, was Patient:innen uns anvertrauen, zu exponieren. Dieses Dokument definiert Metriken, Logs, Traces, Dashboards, Alerts und die **PII-Redaction-Regeln**, die sich aus [TM-ARCH-007](./TM-ARCH-007-dpia.md) und [TM-ARCH-008](./TM-ARCH-008-data-inventory.md) ergeben.

**Stand:** 0.1 — Draft · **Owner:** ML/Platform Admin + DPO · **Review-Zyklus:** pro Major-Release + monatlich.

---

## 1. Prinzipien

1. **Jede Turn hat eine `turn_id`**, die über alle Schichten (Gateway, Guardian, LLM, Store, Metrik) konsistent ist. Tracing ist deterministisch — wer eine `turn_id` hat, kann vom Log den kompletten Fluss rekonstruieren.
2. **Kein Klartext** in Logs. Redacted-only.
3. **Logs, die PII enthalten können, werden als solche klassifiziert** und mit strengeren Zugriffsregeln belegt. Siehe §4.
4. **Metriken sind k-anonym** (k ≥ 50). Cohorten darunter entstehen nicht.
5. **Alles hat eine Retention**. Ohne Retention kein Log, keine Metrik. Defaults in §6.
6. **Alerts führen zu Runbook-Einträgen**. Alert ohne Runbook ist verboten (siehe TM-ARCH-014).

---

## 2. Signale — was wir sammeln

### 2.1 Logs

**Strukturiert, JSON**, in CloudWatch Logs (und gespiegelt in S3 für Langzeit-Kühl-Lagerung).

Drei Log-Klassen:

| Klasse | Enthält | Beispiel | Retention | Access |
|---|---|---|---|---|
| **app** | technische Events ohne Inhalt | `request_received`, `guardian_passed`, `llm_call_started` | 14 d hot + 60 d cold | Engineering |
| **audit** | Admin- und Governance-Aktionen | `flag_toggled`, `content_published`, `case_opened_klartext` | 24 m append-only | Audit + DPO |
| **turn** | Pro-Turn-Summary, redacted | `turn.completed` mit Scores, Refs | 30 d default, opt-in 12 m | Engineering (eingeschränkt), Analyse |

### 2.2 Metriken

- **Latenzen** p50/p95/p99 pro Etappe
- **Zählwerte**: Turns/Minute, Errors, Guardian-Blocks (pro Kategorie)
- **Gauges**: aktive Sessions, Bedrock-Concurrency
- **Quality-Scores**: rollende Groundedness, Helpfulness, Escalation-Rate
- **Cost-Metriken** (siehe TM-ARCH-015)

### 2.3 Traces

- OpenTelemetry-basiert, Exporter → CloudWatch/X-Ray
- Spannen pro Etappe: Gateway → Guardian-in → Retriever → LLM-Call → Guardian-out → Response
- Trace-Attribute sind **nie** Inhalt, immer nur IDs und Längen

### 2.4 Synthetische Monitore

- Alle 60 s: Dummy-Nutzer mit festen Prompts pro Topic
- Alle 5 min: Red-Line-Smoke (dass die Denylist greift)
- Täglich: End-to-End durch Workbench-Flow (Draft → Review → Publish → live abrufbar)

---

## 3. PII-Redaction für Logs

Kein User-Input und kein Coach-Output gelangt in seiner Rohform in Logs. Die Pipeline aus TM-ARCH-008 §4 ist die einzige zulässige Quelle. Für Observability gilt zusätzlich:

- **Hash für Korrelation**: wenn wir pseudonym korrelieren müssen (*„wurde derselbe User mehrfach geblockt?"*), verwenden wir einen **HMAC** mit einem täglich rotierenden Key. Der Key liegt in KMS und ist nur dem HMAC-Worker zugänglich; Engineering sieht nur den Hash, nicht den Ursprungs-User.
- **Scrubber vor Shipping**: ein zusätzlicher Schutz-Layer am Log-Collector: Regex-basierte Entfernung von E-Mails, Telefonnummern, IBAN.
- **Fail-closed**: wenn der Scrubber nicht läuft, werden keine Logs geschrieben — nicht ungeschützt persistiert.

---

## 4. Zugriffskontrolle auf Observability-Daten

| Rolle | App-Logs | Turn-Logs (redacted) | Audit-Logs | Metriken | Traces |
|---|---|---|---|---|---|
| Engineering / On-Call | ja | ja (read) | metadata | ja | ja |
| ML / Data | aggregate | sample (opt-in) | nein | ja | ja |
| Klinik-Lead | nein | nein | ja (eigene Aktionen) | dashboard | nein |
| Compliance / DPO | nein | auf Anfrage | ja | dashboard | nein |
| Content-Autor | nein | nein | eigene | nein | nein |

Jeder Zugriff auf Turn-Logs außerhalb der dashboard-aggregierten Sicht wird selbst als Audit-Event geloggt.

---

## 5. Dashboards

### 5.1 Service-Health

- Uptime (Synthetic + Live)
- Latency-Heatmap
- Error-Rate
- Bedrock-Abhängigkeit (Concurrency, Throttles)

### 5.2 Safety & Quality

- Guardian-Blocks pro Kategorie (Red Line, Jailbreak, PII, Denylist)
- Escalation-Rate (Red-Flag-Route)
- Groundedness-Score (Judge, rolling)
- Helpfulness-Score
- Content-Freshness (ältester aktiv ausgelieferter Snippet)

### 5.3 Business / Usage

- Aktive Nutzer:innen (aggregate, k-anonym)
- Turns / Tag
- Retention-Segmentation

### 5.4 MLOps / Release-Health

- Aktuelle Versionen (Prompt, Model, Guardian-Policy, Content-Set)
- Canary-Status
- Rollout-Prozent pro Feature-Flag

### 5.5 Cost

- Siehe TM-ARCH-015: Bedrock-$, Retrieval-$, Storage-$, Egress-$

---

## 6. Retention

| Signal | Hot | Cold | Audit |
|---|---|---|---|
| app-logs | 14 d | 60 d | — |
| turn-logs (redacted) | 30 d (default) | opt-in 12 m | — |
| audit-logs | 30 d | — | 24 m (append-only) |
| metrics (1-min) | 30 d | — | — |
| metrics (5-min rollup) | 6 m | — | — |
| metrics (1-h rollup) | 24 m | — | — |
| traces | 7 d | — | — |
| synthetic-monitor-results | 30 d | — | — |

---

## 7. Alerts (Übersicht)

Jeder Alert ist im Runbook (TM-ARCH-014) mit klarem Handlungspfad hinterlegt.

| Alert | Severity | Trigger | Runbook |
|---|---|---|---|
| Coach-Unavailable | Sev-1 | synthetic probe fail ≥ 2 min | TM-ARCH-014 §2.1 |
| Latency p95 > 2,5 s | Sev-2 | 5 min sustained | §2.2 |
| Error-Rate > 0,5 % | Sev-2 | 5 min sustained | §2.3 |
| Guardian-FP-Spike | Sev-2 | Block-Rate > 3× Baseline, 15 min | §3.1 |
| Guardian-FN-Signal | Sev-1 | Red-Line-Snippet in Output detected (scan) | §3.2 |
| Escalation-Failure | **Sev-1** | Escalation-Suite-Case in Prod not triggered | §3.3 |
| PII-Leak-Detection | **Sev-1** | PII-Scanner hit in logs | §3.4 |
| Judge-Drift | Sev-2 | Groundedness-Score Δ > 5 Pt / 24 h | §3.5 |
| Bedrock-Throttle | Sev-2 | > 5 % requests throttled | §4.1 |
| Freshness-Expired | Sev-3 | ≥ 1 aktiv ausgelieferter Snippet > 12 m | §4.2 |
| Budget-Burn | Sev-3 | Monats-Error-Budget > 50 % in 7 d | TM-ARCH-012 §6 |

---

## 8. Traces — End-to-End-Beispiel

```
turn.1234
├── gateway.request            12 ms
├── auth.validate              8 ms
├── redaction.scrub            22 ms
├── guardian.in
│   ├── classifier.injection   31 ms
│   ├── classifier.redline     28 ms
│   └── denylist.match         4 ms
├── orchestrator.decide        5 ms
├── retriever.query            68 ms
├── llm.call                   1,340 ms   ← Bedrock
├── guardian.out
│   ├── factcheck              45 ms
│   ├── shape.validate         3 ms
│   └── redline.output         12 ms
├── log.persist                15 ms
└── response.send              4 ms
-----
total                          1,600 ms
```

Dashboard zeigt Perzentile pro Span. Ein plötzlicher Anstieg einer einzelnen Span ist der direkteste Hinweis auf ein Regression-Problem.

---

## 9. Incident-Forensik

Für jeden Incident (TM-ARCH-014 §5):

- Vollständige Trace-Rekonstruktion aus `turn_id`-Sammlung
- Liste der betroffenen Versionen (Prompt, Model, Policy, Content)
- Zugriffs-Log für den Zeitraum
- Korrelations-Hashes, um zu sehen, ob der gleiche Nutzer mehrfach betroffen war

Forensik-Zugriff ist selbst ein **audit-geloggter** Vorgang und wird vom DPO oder einem designierten Incident-Commander genehmigt.

---

## 10. Offene Punkte

- Langzeit-Cold-Storage (S3 Glacier?) für Audit-Logs evaluieren.
- OpenTelemetry-Semconv für LLM-Spans ist noch nicht stabil — wir pinnen auf eine eigene Semantic Convention vorerst.
- Dashboards als Code (Grafana-as-Code) ist angestrebt, im MVP aber noch nicht umgesetzt.
