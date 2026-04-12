# Runbook & On-Call Playbook
## guardian-demo Cardio Coach

> Das Runbook ist das Dokument, das **um 3:17 Uhr** gebraucht wird. Es erklärt, was On-Call tun soll, wenn ein Alert feuert — ohne vorher erst den Rest der Architektur lesen zu müssen. Kurze Sätze, klare Schritte, explizite Eskalationswege. Jeder Alert aus [TM-ARCH-013 §7](./TM-ARCH-013-observability.md) hat hier einen passenden Abschnitt.

**Stand:** 0.1 — Draft · **Owner:** ML/Platform Admin (rotierend) · **Review-Zyklus:** pro Incident + monatlich Drill.

---

## 1. Rollen und Eskalationskette

| Rolle | Wer | Wann |
|---|---|---|
| **Primary On-Call** | Engineering (Rotation) | Erstreaktion, Triage |
| **Secondary On-Call** | Engineering (Rotation) | wenn Primary nicht reagiert in 10 min |
| **Incident Commander (IC)** | Primary, wenn Sev-1, sonst benannt | ab Sev-2 hochgestuft |
| **Klinischer Lead** | benannter Arzt | bei jedem Sev-1 mit klinischer Dimension |
| **DPO / Compliance Lead** | benannt | bei jedem PII-Leak-Verdacht |
| **Security Lead** | benannt | bei jedem Sicherheitsereignis |
| **Comms / Product Lead** | benannt | externe Kommunikation |

**Sev-Stufen:**

- **Sev-1** — Patientenrisiko oder Datenschutz-Incident. Sofortige Reaktion, 24/7.
- **Sev-2** — spürbare Qualitäts- oder Verfügbarkeitsdegradation. Reaktion ≤ 30 min in Geschäftszeit, ≤ 60 min außerhalb.
- **Sev-3** — Betriebsstörung ohne User-Impact. Next business day.

---

## 2. Verfügbarkeits-Runbooks

### 2.1 Coach-Unavailable (Sev-1)

**Symptom:** synthetische Probe fail ≥ 2 min. Live-Traffic 5xx-Rate > 5 %.

**Sofortmaßnahmen (5 min):**

1. Öffne das Service-Health-Dashboard (TM-ARCH-013 §5.1).
2. Prüfe Bedrock-Status-Page für EU-Region.
3. Prüfe AWS Service Health Dashboard.
4. Teste manuell: `curl -k https://api.guardian-demo.internal/healthz`.

**Wenn Bedrock Throttles:**

- Wechsle auf Secondary Region (Feature-Flag `bedrock.region=secondary`).
- Dokumentiere im Incident-Ticket.

**Wenn App-seitig:**

- Prüfe letzte Deployments (Prompt/Model/Policy Flags).
- **Rollback-Option:** einen Schritt zurück per Feature-Flag.

**Wenn Ursache unklar:**

- Trigger Circuit Breaker `coach.runtime.safe_mode=on`. Coach geht in Rule-Engine-Only-Betrieb; Patienten bekommen freundliche Nachricht: *„Ich bin gerade im eingeschränkten Modus — du kriegst nur die Basis-Antworten, bis wir zurück sind."*
- Eskaliere Sev-1 an Klinik-Lead und IC.

### 2.2 Latency p95 > 2,5 s (Sev-2)

1. Dashboard → Latency-Heatmap.
2. Identifiziere Hot-Span (TM-ARCH-013 §8).
3. Wenn `llm.call` → Bedrock-Throttle?
4. Wenn `guardian.*` → Release-Korrelation? Letzter Guardian-Policy-Rollout?
5. Wenn `retriever.query` → DynamoDB/Vector-Store-Latenzen?
6. Mitigation-Optionen:
   - Bedrock-Region-Swap
   - Flag `guardian.mode=fast` (reduzierter Post-Check für weniger kritische Topics) — **nur mit IC-Freigabe**
   - Traffic-Shaping

### 2.3 Error-Rate > 0,5 % (Sev-2)

1. Logs filtern nach `severity=error`.
2. Gruppiere nach `error_code`.
3. Top-Fehler? Release-Korrelation? Downstream?
4. Wenn unklar → Rollback auf letzten bekannten-guten Stand.

---

## 3. Safety- und Quality-Runbooks

### 3.1 Guardian False-Positive Spike (Sev-2)

**Symptom:** Block-Rate > 3× Baseline über 15 min.

1. Dashboard → Guardian-Kategorien.
2. Welche Kategorie?
3. Korrelation mit Release (Policy-Version-Delta)?
4. Sample-Turns (redacted) anschauen.
5. **Mitigation:**
   - Wenn eine *einzelne* Kategorie driftet: Feature-Flag `guardian.policy.version=previous` für diese Kategorie.
   - Wenn allgemein: Rollback der Policy-Version.
6. Ticket mit Sample an Red-Team-Set.

> **Regel:** lieber FPs akzeptieren als FNs zu riskieren. Nicht voreilig „lockerer" machen.

### 3.2 Guardian False-Negative Signal (Sev-1)

**Symptom:** Post-Scan findet Red-Line-Muster in ausgeliefertem Output, oder Nutzer-Feedback meldet eine Red-Line-Verletzung.

1. **Sofort:** Circuit Breaker `coach.llm.disabled=true` — Coach läuft nur noch Rule-Engine.
2. IC ernennen (Sev-1).
3. Klinik-Lead informieren (verpflichtend).
4. Betroffene Turns identifizieren (`turn_id`-Sammlung).
5. Betroffene Nutzer ermitteln (Tenant-Liste für Hash-Korrelation).
6. Forensik-Lauf initiieren (TM-ARCH-013 §9).
7. DSGVO-Meldepflicht bewerten (TM-ARCH-007).
8. Fix identifizieren (Policy? Prompt? Model? Content?).
9. Hotfix-Release mit beschleunigtem Eval-Gate.
10. Postmortem (§5).

### 3.3 Escalation-Failure (Sev-1)

**Symptom:** Escalation-Suite-Case in Produktion wird nicht korrekt eskaliert (z. B. kein Notruf-Hinweis bei Red-Flag-Formulierung).

- Behandlung wie §3.2. Dies ist der schwerste interne Alert.

### 3.4 PII-Leak-Detection (Sev-1)

**Symptom:** PII-Scanner findet E-Mail/Telefon/IBAN/Adresse in einem App-Log-Eintrag, oder ein Turn-Log enthält unredactete Daten.

1. **Sofort:** Betroffene Logs isolieren (restrict access).
2. DPO benachrichtigen (verpflichtend innerhalb 30 min).
3. Scope-Abschätzung: einzelner Eintrag oder systematisch?
4. Wenn systematisch → Logging-Pipeline stoppen (Turn-Logs temporär unterbinden; App läuft weiter).
5. Root-Cause: Scrubber? Neue Code-Pfad?
6. 72-h-Meldefrist an Aufsichtsbehörde **prüfen lassen** (DPO entscheidet), nicht im Alleingang.
7. Forensik + Postmortem.

### 3.5 Judge-Drift (Sev-2)

**Symptom:** Groundedness/Helpfulness-Score fällt > 5 Punkte in 24 h.

1. Ist der Coach oder der Judge gedriftet?
2. Judge-Pinning prüfen — wurde das Judge-Modell upgedated?
3. Prod-Sample manuell spot-checken (TM-ARCH-013 §4.3 fallback).
4. Wenn Judge-Drift: Judge-Version rollback, Eval-Run wiederholen.
5. Wenn echter Coach-Drift: Feature-Freeze, TM-ARCH-012 §6.

---

## 4. Degraded-Mode

Wenn Bedrock oder LLM-Stack nicht verfügbar ist, fährt der Coach in einen **Degraded-Mode**:

- Nur Rule-Engine, keine freie Konversation
- Hart codierte Antworten zu Bewegung / Ernährung / Rauchstopp
- Eskalations- und Notruf-Pfad bleibt **aktiv**
- UI zeigt deutlich: *„Eingeschränkter Modus"*
- Keine Persistierung von Konversations-Logs (weniger Datenschutz-Exposition in einem ohnehin unsicheren Zustand)

Degraded-Mode kann **nur** durch Circuit Breaker oder IC-Entscheidung aktiviert werden. Der Ausstieg braucht eine explizite Go-Entscheidung (nicht automatisch).

---

## 5. Postmortem-Prozess

Jeder Sev-1 und Sev-2 erzeugt einen Postmortem. Blameless. Innerhalb **5 Werktagen** fertig.

Struktur:

1. **Summary** (3 Sätze)
2. **Timeline** (UTC, minutenauflösend)
3. **Impact** (wie viele Nutzer, wie lange, welche Dimension)
4. **Root Cause(s)**
5. **Was gut lief**
6. **Was nicht gut lief**
7. **Action Items** mit Owner + Datum
8. **Test-Set-Updates** (welche neuen Cases gehen in TM-ARCH-011)

Action Items werden bis zur Umsetzung in der Engineering-Standup verfolgt. Offene Action-Items älter als 30 Tage eskalieren an die Engineering-Leitung.

---

## 6. On-Call-Hygiene

- **Rotation:** eine Woche pro Person, Übergabe am Montag.
- **Drills:** monatlich ein simulierter Incident mit zufällig gezogenem Runbook.
- **Pager-Test:** wöchentlich automatisiert.
- **Burnout-Kriterium:** mehr als 3 Seiten pro Woche oder >1 nachts → Review mit Lead, Gegenmaßnahmen.
- **Dokumentations-Pflicht:** jeder Alert, auch wenn in 2 Min gelöst, bekommt eine Zeile im Incident-Log.

---

## 7. Kontakt-Cheat-Sheet

| Rolle | Kanal | Fallback |
|---|---|---|
| Primary On-Call | Pager/Phone | SMS |
| IC | Incident-Channel | Direct Call |
| Klinik-Lead | Signal + Telefon | E-Mail |
| DPO | Signal + Telefon | E-Mail |
| Security Lead | Signal + Telefon | E-Mail |
| AWS Support (Premium) | Ticket + Phone | — |

Kontaktdaten werden separat im internen Secrets-Store geführt (nicht in diesem Dokument).

---

## 8. Wo die relevanten Kontrollen sitzen

| Aktion | Wie | Wer darf |
|---|---|---|
| Feature-Flag setzen | Flag-UI + API | On-Call + Lead (2-Personen für Prod-Flags mit Patient-Impact) |
| Circuit Breaker ziehen | Notfall-Button in Dashboard + API | On-Call (Sofortrecht), nachträglich dokumentiert |
| Deployment rollback | CI/CD UI | On-Call |
| Policy-Version zurück | Flag | On-Call + Klinik-Lead (wenn Policy) |
| Log-Access-Freigabe | IAM-Temporär | IC + DPO |
| Patient-Kommunikation extern | Produkt-/Comms-Lead | — |

---

## 9. Was *nicht* ins Runbook gehört

- Tiefere Architektur-Hintergründe → Deep-Dives 001–010.
- Dauerhafte Design-Entscheidungen → ADRs (TM-ARCH-017).
- Normale Feature-Arbeit → Backlog.

Dieses Dokument wird kurz gehalten. Wenn ein Abschnitt länger als eine Bildschirmseite wird, ist er wahrscheinlich kein Runbook mehr, sondern Architektur-Diskussion — dann gehört er woanders hin.

---

## 10. Offene Punkte

- Runbook-Drills bauen + Ergebnisse auswerten.
- Pager-System auswählen (Kandidaten: PagerDuty, Grafana OnCall).
- Incident-Management-Tool integrieren (Kandidaten: incident.io, FireHydrant).
