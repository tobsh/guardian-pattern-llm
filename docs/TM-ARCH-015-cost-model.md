# Cost Model
## guardian-demo Cardio Coach

> Was kostet der guardian-demo Cardio Coach pro Turn, pro aktivem Nutzer, pro Monat — und wo sind die Hebel, wenn wir optimieren müssen? Dieses Dokument ist die **FinOps-Sicht** auf die Architektur. Die Zahlen sind Modellrechnungen auf Basis aktueller AWS-Preise (Stand 04/2026, `eu-central-1`); sie werden in der Cost-Metrik ([TM-ARCH-013 §5.5](./TM-ARCH-013-observability.md)) laufend gegen die Realität kalibriert.

**Stand:** 0.1 — Draft · **Owner:** ML/Platform Admin + Produkt-Lead · **Review-Zyklus:** monatlich; bei Preis-Änderungen des Providers außerordentlich.

---

## 1. Warum Cost Model

Ein Guardrailed-LLM-Stack kann pro Turn unauffällig teuer werden: zwei Guardian-Calls, ein großer Coach-LLM-Call, Retrieval, Embedding, Logs. Ohne klares Modell bekommt man eine Rechnung, die pro Nutzer skaliert und keine klaren Angriffspunkte zum Optimieren hat.

Dieses Dokument:

1. Zerlegt die Kosten pro Turn in ihre Bausteine.
2. Rechnet typische Nutzungsprofile auf Monatsbudgets hoch.
3. Nennt die **drei** wirksamsten Hebel.
4. Definiert einen **Cost-SLO** und ein Alarmsystem für Kostenausreißer.

---

## 2. Bausteine pro Turn

Ein Turn = *eine* Nutzer-Nachricht + *eine* Coach-Antwort.

| Schritt | Technik | Rechen-Basis |
|---|---|---|
| Gateway + Auth | API Gateway | pro Request |
| Redaction | Lambda (kleines NER-Modell) | ~50 ms, kleine Lambda |
| Guardian-in | Bedrock, kleineres Modell (Haiku-Klasse) | ~400–800 input tokens, ~50 output |
| Retriever | OpenSearch Serverless oder DynamoDB + Titan Embeddings | 1 Embedding-Query, ~3–5 Vector-Lookups |
| Coach-LLM | Bedrock, Sonnet-Klasse | ~1,5 k input (inkl. System-Prompt + KB-Snippets), ~200 output |
| Guardian-out | Bedrock, Haiku-Klasse | ~500 input, ~50 output |
| Log Write | S3 + CloudWatch | ~2 kB redacted payload |
| Metric Emit | CloudWatch | ~1 Metrik |

Nicht jeder Turn zieht alle Schritte — Guardian-in kann z. B. bei Block vor dem Coach-LLM stoppen. Durchschnittlich aber ja.

---

## 3. Preis-Schätzung pro Turn

Die Zahlen sind **Modell-Annahmen**. Aktuelle Bedrock-Preise (04/2026) grob (USD, pro 1k tokens):

| Modell | Input | Output |
|---|---|---|
| Claude Haiku 4.5 | 0,001 | 0,005 |
| Claude Sonnet 4.6 | 0,003 | 0,015 |
| Claude Opus 4.6 | 0,015 | 0,075 |
| Titan Embeddings v2 | 0,0001 | — |

> **Hinweis:** Preise ändern sich. Das Cost-Dashboard (TM-ARCH-013 §5.5) zieht die *echten* Kosten aus Cost Explorer; diese Tabelle ist die Modell-Annahme für Planung.

### 3.1 Guardian-in (Haiku)

- input: 0,8 k → ≈ 0,0008 USD
- output: 0,05 k → ≈ 0,00025 USD
- **Summe:** ≈ 0,00105 USD / Turn

### 3.2 Retriever (Titan + kleiner Store)

- Embedding der Query: 0,1 k → ≈ 0,00001 USD
- Vector-Lookup: ≈ 0,00005 USD
- **Summe:** ≈ 0,00006 USD / Turn

### 3.3 Coach-LLM (Sonnet)

- input: 1,5 k → ≈ 0,0045 USD
- output: 0,2 k → ≈ 0,003 USD
- **Summe:** ≈ 0,0075 USD / Turn

### 3.4 Guardian-out (Haiku)

- input: 0,5 k → ≈ 0,0005 USD
- output: 0,05 k → ≈ 0,00025 USD
- **Summe:** ≈ 0,00075 USD / Turn

### 3.5 Infrastruktur-Kosten (Lambda, Gateway, Logs)

- Lambda (100 ms avg, 1 GB): ≈ 0,00002 USD / Invocation
- API Gateway: ≈ 0,0000035 USD / Request
- CloudWatch Log Ingest: ≈ 0,0001 USD / Turn (bei 2 kB)
- **Summe:** ≈ 0,00013 USD / Turn

### 3.6 Modell-Turn Gesamt

| Block | USD |
|---|---|
| Guardian-in (Haiku) | 0,00105 |
| Retriever | 0,00006 |
| Coach-LLM (Sonnet) | 0,0075 |
| Guardian-out (Haiku) | 0,00075 |
| Infra | 0,00013 |
| **Summe** | **≈ 0,00949 USD / Turn** |

Zur Vereinfachung: **~1 Cent pro Turn**.

Fehler-Margin ± 30 % je nach Input-Länge und Tonalität der Nutzer-Antwort.

---

## 4. Monatsbudget-Hochrechnung

| Profil | Turns / Nutzer / Tag | Aktive Nutzer | Turns / Monat | Kosten / Monat |
|---|---|---|---|---|
| Shadow-Pilot | 2 | 20 | 1.200 | ≈ 12 USD |
| Pilot | 5 | 200 | 30.000 | ≈ 285 USD |
| Kleiner GA | 6 | 2.000 | 360.000 | ≈ 3.420 USD |
| Mittlerer GA | 8 | 10.000 | 2.400.000 | ≈ 22.800 USD |
| Großer GA | 10 | 50.000 | 15.000.000 | ≈ 142.500 USD |

Dazu kommen **Fixkosten** (unabhängig von Nutzern):

| Fixposten | ~USD / Monat |
|---|---|
| DynamoDB On-Demand (klein) | 50 |
| S3 + KMS | 40 |
| OpenSearch Serverless (klein) | 150 |
| CloudWatch Dashboards + Logs Baseline | 120 |
| WAF + AWS Backup | 80 |
| Monitoring (Grafana Cloud optional) | 90 |
| **Summe Fix** | **≈ 530 USD** |

Skalen-Rechnung ist also `Fix + Variabel`. Beim kleinen GA sind die Fixkosten ~15 % der Gesamtrechnung; bei mittleren GA < 3 %.

---

## 5. Nicht-Turn-Kosten

- **Eval-Harness-Läufe** (TM-ARCH-011): ~3.000 Turns pro Release × 2 Releases / Monat × 0,01 USD ≈ 60 USD / Monat.
- **Red-Team-Suite**: ähnliche Größenordnung.
- **Judge-LLM-Läufe**: abhängig von Judge-Modell. Bei Sonnet als Judge und ~1.000 Prod-Sample-Turns pro Tag: ≈ 7 USD / Tag ≈ 210 USD / Monat.
- **Synthetic Monitoring**: vernachlässigbar.

---

## 6. Die drei Hebel

### 6.1 Hebel 1 — Guardian-Modell

Guardian ist pro Turn *zweimal* im Pfad. Ein Wechsel der Guardian-LLM-Größe wirkt doppelt.

- Haiku → günstigstes Modell, im MVP ausreichend
- Falls ein kleineres Open-Weights-Modell verfügbar (on-device/in-VPC) und Quality-Kriterien trifft → Kosten pro Turn um ~20 % drückbar
- **Warnung:** Guardian darf *nie* zum Kostentreiber werden, das bei Kostendruck „kleiner gemacht" wird. Sicherheit > Kosten; Kostenreduktion nur dann, wenn Eval-Gates der Sicherheits-Suites gehalten werden.

### 6.2 Hebel 2 — Coach-LLM-Input-Länge

- Input = System-Prompt + KB-Snippets + Turn-History.
- Snippet-Auswahl: maximal 3 Snippets, harter Cut.
- History-Management: nur die letzten N Turns, ältere als Summary.
- Prompt-Caching (wenn Bedrock das anbietet) nutzen — reduziert Input-Kosten signifikant, weil der große System-Prompt-Teil nicht ständig neu verrechnet wird.

Faustregel: jedes 1 k Input-Tokens gespart = 0,003 USD/Turn.

### 6.3 Hebel 3 — Retrieval-Store

- Für den MVP reicht DynamoDB mit einem einfachen Embeddings-Store.
- OpenSearch Serverless ist komfortabel, aber hat eine Mindest-Kapazitäts-Gebühr.
- Bei kleinem Traffic: DynamoDB + in-process Cosine-Similarity kostet ~10× weniger Fixkosten.
- Bei mittlerem Traffic: OpenSearch Serverless, weil Entwicklungsgeschwindigkeit wichtiger wird.

---

## 7. Cost-SLO / Anomalie-Detection

| Metrik | Ziel | Alarm |
|---|---|---|
| USD / Turn (rolling 7 d) | ≤ 0,012 | > 0,015 = Sev-3 |
| USD / DAU / Tag | ≤ 0,07 | > 0,10 = Sev-3 |
| Monats-Burn (Tagesrate × 30) | ≤ 110 % Plan | > 120 % = Sev-2 |
| Bedrock-Requests > 10 k Tokens | ≤ 2 % | > 5 % = Incident |

Anomalie-Trigger sind an das Alert-System gebunden und erzeugen wie andere Alerts ein Runbook-Event.

---

## 8. Budget-Governance

- **Monatsbudget** wird vor jedem Quartal zwischen Produkt und Engineering abgestimmt.
- Pro Umgebung (dev/staging/prod) eigenes Cost-Tagging und eigene Budgets in AWS Budgets.
- Überschreitungen > 20 % sind ein eigener Tagesordnungspunkt im Engineering-Standup.
- Automatisches Abschalten nicht-essenzieller Workloads in dev/staging, wenn Budget gerissen (z. B. Eval-Harness außerhalb der Geschäftszeit).

---

## 9. Was wir *nicht* machen

- Keine aggressive Request-Deduplizierung oder Response-Caching für Patient-Inputs — Datenschutz + Variabilität sprechen dagegen.
- Kein Downgrade des Guardians aus Kostengründen (s. §6.1).
- Kein Nutzer-side-Pricing. Patient-Exposure gegen Kostenrisiken ist nicht der Plan.

---

## 10. Offene Punkte

- Prompt-Caching-Feature von Bedrock evaluieren, sobald stabil verfügbar.
- Echte Nutzungsprofile aus dem Pilot als Kalibrierungs-Input.
- Reservation-/Savings-Plans sinnvoll ab mittlerem GA, vorher on-demand.
