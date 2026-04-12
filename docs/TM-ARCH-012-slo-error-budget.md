# SLOs & Error Budgets
## guardian-demo Cardio Coach

> **Service Level Objectives** (SLOs) und **Error Budgets** für den guardian-demo Cardio Coach. Dieses Dokument definiert messbare Ziele für Verfügbarkeit, Latenz, Korrektheit und Sicherheit — und was passiert, wenn wir sie verfehlen. Die Zahlen sind die Kopplung zwischen dem Klinik-/Produkt-Versprechen aus [TM-ARCH-006](./TM-ARCH-006-clinical-safety-mdr.md) und dem technischen Betrieb aus [TM-ARCH-002](./TM-ARCH-002-aws-bedrock.md), [TM-ARCH-004](./TM-ARCH-004-mlops-content-governance.md), [TM-ARCH-013](./TM-ARCH-013-observability.md), [TM-ARCH-014](./TM-ARCH-014-runbook-oncall.md).

**Stand:** 0.1 — Draft · **Owner:** ML/Platform Admin · **Review-Zyklus:** monatlich; Zielwerte pro Release-Cycle neu freigegeben.

---

## 1. Warum SLOs, und warum eigene für einen Coach?

Klassische SLOs decken *„funktioniert der Dienst?"*. Ein Coach, der Gesundheitsinhalte rendert, braucht zusätzlich *„verhält sich der Dienst korrekt?"* und *„verhält er sich sicher?"*. Wir teilen die SLOs daher in drei Dimensionen:

- **Verfügbarkeits-SLOs** — klassisch (Uptime, Latenz, Error-Rate)
- **Korrektheits-SLOs** — Guardian-Block-Rate, Escalation-Completeness, Groundedness-Score
- **Sicherheits-SLOs** — Jailbreak-Block-Rate, PII-Leak-Rate, Freshness der Inhalte

Jeder SLO hat ein **Error Budget**: die Toleranz, bevor wir handeln. Ein gerissenes Budget zieht konkrete Konsequenzen, vom Feature-Freeze bis zum Circuit Breaker.

---

## 2. Service-Landschaft für SLO-Zwecke

| Service | Typ | Kritikalität |
|---|---|---|
| Coach-Runtime (Patient-Pfad) | User-Pfad | **kritisch** |
| Guardian (in/out) | Teil Runtime | **kritisch** |
| Setup-Agent (Onboarding) | User-Pfad | hoch |
| Arzt-Inbox / Workbench | Intern | mittel |
| CI/CD, Registry | Intern | mittel |
| Observability-Plane | Intern | hoch |

SLOs dieser Seite beziehen sich primär auf den **Patient-Pfad**. Interne Dienste werden konservativer behandelt (nicht unter 99 %), aber sind nicht direkt patientenwirksam.

---

## 3. Verfügbarkeits-SLOs

### 3.1 Coach-Runtime

| Metrik | Ziel | Messung | Error Budget |
|---|---|---|---|
| Verfügbarkeit (2xx + erwartete 4xx) | **99,9 % / 30 d** | synthetischer Probe + Live-Traffic | 43 min / 30 d |
| Turn-Latency p50 | ≤ **1,2 s** | App-Tracing | nicht budgetiert, sondern Trend |
| Turn-Latency p95 | ≤ **2,5 s** | App-Tracing | 1 % der Turns darf länger sein |
| Turn-Latency p99 | ≤ **5,0 s** | App-Tracing | 1 % darf länger |
| Error-Rate (5xx) | ≤ **0,1 %** | App-Log | jede Überschreitung trigger on-call |

### 3.2 Guardian

- Verfügbarkeit ist an Coach-Runtime gebunden (fail-closed: Guardian down → Coach down).
- **Guardian-Overhead** soll **< 150 ms** median sein. Ist das nicht der Fall, muss entweder optimiert oder Circuit Breaker für Guardian-Upgrade gezogen werden.

### 3.3 Bedrock-Abhängigkeit

- Bedrock ist ein externes Managed Service. Unser SLO bleibt unverändert — wir fangen Bedrock-Ausfälle durch Region-Failover und durch Graceful-Degradation-Modi (TM-ARCH-014 §4) ab.
- **Provider-Timeout**: 8 s hart, danach Fallback-Antwort (*„Ich brauche einen Moment — versuch es bitte gleich noch einmal"*).

---

## 4. Korrektheits-SLOs

| Metrik | Ziel | Messung | Error Budget |
|---|---|---|---|
| Groundedness-Score (Judge) | ≥ **0,95** über rolling 7 d | LLM-as-Judge + Spot-Check | Unter 0,92 → Feature-Freeze |
| Guardian-out Block-Korrektheit | ≥ **0,98** | Spot-Check + Regression-Suite | Unter 0,96 → Incident |
| Refusal-Korrektheit (Refuse, wenn erwartet) | ≥ **0,95** | Golden-Set + Prod-Monitoring | Unter 0,90 → Eval-Revisit |
| Content-Freshness (Leitlinie ≤ 12 m) | **100 %** für aktiv ausgelieferte Snippets | Nightly Job | jeder Verstoß → Ticket |
| Eskalations-Completeness (Red Flag → korrekte Route) | **100 %** | Escalation-Suite + Prod-Monitoring | jeder Verstoß → Sev-1 |

---

## 5. Sicherheits-SLOs

| Metrik | Ziel | Messung | Konsequenz bei Riss |
|---|---|---|---|
| Jailbreak-Block-Rate | ≥ **99,5 %** | Red-Team-Suite + Prod-Sampling | Unter 99 %: Hotfix + Red-Team-Review |
| PII-Leaks in Logs | **0 / Monat** | PII-Scanner über Log-Stores | Jeder Fund: Sev-1 |
| Unbeabsichtigte Medikations-Nennungen | **0 / Monat** | Denylist-Audit + Regex-Scan | Jeder Fund: Sev-1 |
| Kritische CVEs in Supply Chain | **0 offen** nach 7 d | SBOM + Vuln-Scanner | Ticket + Rollout-Freeze |
| Key-Rotation-Frequenz | ≤ **90 d** | KMS-Schedule | Alarm bei Drift |

---

## 6. Error-Budget-Policy

Error Budgets sind kein Dekor — sie sind eine **Entscheidungs-Regel**. Wenn ein Budget reißt, passiert folgendes, deterministisch:

### 6.1 Kleinere Risse (< 50 % des Monats-Budgets in 7 Tagen verbrannt)

- Informativer Alert in den internen Kanal.
- Wöchentlicher Review im Engineering-Standup.

### 6.2 Mittlere Risse (Monats-Budget 50–100 % verbrannt)

- **Feature-Freeze** für alle nicht-essentiellen Prompt-/Content-/Modell-Änderungen bis zum Monatsende.
- Root-Cause-Ticket mit SLA 5 Werktage.
- Report an Klinischen Lead + Produkt-Lead.

### 6.3 Budget verbrannt

- **Harter Freeze**: nur noch Sicherheits- und Korrektheits-Fixes.
- Wenn die gerissene Dimension *Korrektheit* oder *Sicherheit* ist → **Circuit Breaker** (ggf. automatisch durch Alerting).
- Postmortem (TM-ARCH-014 §5) verpflichtend.
- Rollback-Option auf letzten bekannten-guten Stand wird *standardmäßig* erwogen.

### 6.4 Silent Burn

- Mehr als ein Viertel des Budgets in einem einzigen Zeitfenster < 1 h → Auto-Circuit-Breaker.

---

## 7. Zusammenhang zum Circuit Breaker (TM-ARCH-004 §7)

Der Circuit Breaker ist die Notbremse. Automatische Auslöser aus diesem Dokument:

- Escalation-Completeness < 100 % (1 Verstoß genügt)
- Jailbreak-Block-Rate sinkt über den Schwellwert
- PII-Leak-Detection schlägt an
- Groundedness-Score fällt > 5 Punkte innerhalb eines 24-h-Fensters
- Latenz p95 steigt über 4 s länger als 15 min

Alle Trigger sind in TM-ARCH-014 Runbooks übersetzt.

---

## 8. Messung und Datenquellen

| SLO-Dimension | Datenquelle | Refresh |
|---|---|---|
| Verfügbarkeit | ALB/APIGW-Metrik, Synthetic Probes | 1 min |
| Latenz | App-Tracing, p50/p95/p99 | 1 min |
| Korrektheit (Judge) | Batch-Eval gegen Prod-Sample (anonymisiert) | 6 h |
| Korrektheit (Spot-Check) | Wöchentliches Sample durch Klinik-Lead | 7 d |
| Sicherheit (Denylist/PII) | Scheduled Scan | 1 h |
| Freshness | Nightly Job | 24 h |

---

## 9. Kommunikation

- **Patient-facing**: keine eigene Statuspage im MVP, aber App zeigt transparente „Ich bin gerade überlastet"-Mitteilungen statt generischer Fehler.
- **Intern**: Dashboard (TM-ARCH-013) mit Ampeln pro SLO-Zeile.
- **Compliance**: quartalsweiser SLO-Bericht, Teil des Quality Reports (TM-ARCH-011 §8.2).

---

## 10. Offene Punkte

- Initiale Zielwerte sind Schätzungen; Kalibrierung nach erstem Pilot-Monat.
- Latency-Ziele hängen an Bedrock-Region-Latenz — Messen, dann ggf. anpassen.
- Definition des „anonymisierten Prod-Samples" für Judge-Runs muss DPIA-konform finalisiert werden.
