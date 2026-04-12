# Clinical Safety Case & MDR-Einordnung
## guardian-demo Cardio Coach

> Dieses Dokument beantwortet die **regulatorische Kernfrage**: Ist der guardian-demo Cardio Coach ein Medizinprodukt nach der EU-Medizinprodukte-Verordnung (MDR, Verordnung (EU) 2017/745) und der Medical Device Software Classification (MDCG 2019-11)? Wenn ja, welcher Klasse? Und welche Schutzmaßnahmen leiten sich daraus für Architektur und Betrieb ab?
>
> Das Dokument ist **kein** Ersatz für eine formelle Konformitätsbewertung durch eine Benannte Stelle. Es ist die interne Entscheidungsgrundlage, auf der wir den Produkt-Scope so schneiden, dass wir mit vertretbarem Risiko in den MVP-Betrieb gehen können.

**Stand:** 0.1 — Draft · **Owner:** Klinischer Lead + Compliance-Lead · **Review-Zyklus:** vor jedem Major-Release und quartalsweise.

---

## 1. Ausgangslage

Der guardian-demo Cardio Coach ist ein konversationelles System, das Herz-Kreislauf-Patient:innen bei **Lebensstil-Maßnahmen** (Bewegung, Ernährung, Rauchstopp) begleitet. Er stellt keine Diagnosen, verschreibt keine Medikamente, passt keine Dosierungen an und ersetzt keine ärztliche Konsultation.

Das System ist als **Support-Tool** konzipiert, nicht als diagnostisches oder therapeutisches Instrument.

---

## 2. Regulatorischer Rahmen

### 2.1 MDR — Medical Device Regulation

Die MDR definiert in Artikel 2(1) ein Medizinprodukt (sinngemäß) als ein Gerät, das vom Hersteller *für einen oder mehrere der folgenden Zwecke* am Menschen eingesetzt werden soll:

- Diagnose, Verhütung, Überwachung, Vorhersage, Prognose, Behandlung oder Linderung von Krankheiten
- Diagnose, Überwachung, Behandlung, Linderung von oder Kompensierung von Verletzungen oder Behinderungen
- Untersuchung, Ersatz oder Veränderung der Anatomie oder eines physiologischen oder pathologischen Vorgangs
- Gewinnung von Informationen durch In-vitro-Untersuchung

**Entscheidend ist die Zweckbestimmung** — was der Hersteller mit dem Produkt *beabsichtigt*, nicht, was technisch möglich wäre.

### 2.2 MDCG 2019-11 — Software Qualification

Software ist Medical Device Software (MDSW), wenn sie *„designed to be used, alone or in combination, for a purpose as specified in the definition of a 'medical device'"*. Entscheidend:

- **Nicht-MDSW:** allgemeines Wohlbefinden, Fitness, Lifestyle, Bildung ohne medizinischen Entscheidungs-Input.
- **MDSW:** Software, die *individuelle* medizinische Entscheidungen beeinflusst oder trifft.

### 2.3 Regel 11 (Software Classification)

Für MDSW gilt MDR-Anhang VIII, Regel 11:

> Software, die Informationen liefert, die für Entscheidungen mit diagnostischen oder therapeutischen Zwecken verwendet werden, wird in Klasse IIa eingestuft, es sei denn, diese Entscheidungen haben Auswirkungen, die zum Tod oder zu einer irreversiblen Verschlechterung führen können (→ III) oder zu einer schweren Verschlechterung oder einem chirurgischen Eingriff führen können (→ IIb).

Software für Monitoring physiologischer Prozesse → ebenfalls IIa (IIb bei vitalen Parametern).

---

## 3. Bewertung für den guardian-demo Cardio Coach

### 3.1 Intended Use (Zweckbestimmung, vorläufig)

> Der guardian-demo Cardio Coach ist ein **allgemeines Lebensstil-Unterstützungstool** für Erwachsene mit kardiovaskulärem Risikoprofil. Er motiviert, informiert und begleitet bei nicht-medikamentösen Maßnahmen der Primär- und Sekundärprävention (Bewegung, Ernährung, Rauchstopp). Er ersetzt **keine** ärztliche Beratung, stellt **keine** Diagnosen und gibt **keine** medikamentösen Empfehlungen. Jede Eingabe, die auf eine akute oder unklare klinische Situation hindeutet, wird an einen ärztlichen Kontaktweg eskaliert.

### 3.2 Klassifizierung

| Kriterium | Bewertung |
|---|---|
| Liefert Software Informationen für individuelle diagnostische oder therapeutische Entscheidungen? | **Nein** — Entscheidungen sind auf Lebensstil beschränkt, keine Diagnose, keine Medikation. |
| Monitored die Software physiologische Parameter? | **Nein** — keine Vitalwert-Auswertung, keine Wearable-Interpretation im MVP. |
| Kann die Software einen einzelnen Patienten direkt zu klinischen Aktionen führen? | **Nein** — Coach gibt nur Lifestyle-Impulse, klinische Aktionen werden ausdrücklich eskaliert. |
| Beeinflusst die Software Medikamente / Dosierungen? | **Nein** — hart gesperrter Themenraum (TM-ARCH-010). |

**Vorläufiges Ergebnis:** Der Coach fällt im aktuellen Scope **nicht** unter die MDR als Medizinprodukt — er ist ein **Wellness-/Lifestyle-Support-Tool**. Das ist die gleiche Kategorie wie z. B. generische Ernährungs- oder Fitness-Apps, *wenn* der Scope strikt gehalten wird.

> **Wichtig:** Diese Einschätzung ist *kontingent* an den strikten Themen-Scope. Sobald eine künftige Version Vitalwerte interpretiert, Medikamentenfragen beantwortet oder individualisierte klinische Entscheidungsunterstützung gibt, **kippt die Klassifizierung in mindestens MDR Klasse IIa**, und es gelten deutlich strengere Anforderungen (Benannte Stelle, Technisches Dossier, Post-Market Surveillance, PMCF, Clinical Evaluation Report).

### 3.3 Scope-Grenzen als Compliance-Hebel

Die folgenden Grenzen sind **nicht Produktoptionen**, sondern Teil der regulatorischen Einstufung. Sie werden im Guardian (TM-ARCH-003) und in den Red Lines (TM-ARCH-010) hart durchgesetzt:

1. **Keine individuelle Diagnose** — der Coach interpretiert keine Symptome diagnostisch.
2. **Keine Medikation** — Dosis, Wechselwirkung, Nebenwirkung → hart geblockt + Eskalation.
3. **Keine Vitalwert-Bewertung** — Blutdruck/Puls/EKG/Blutzucker werden nicht ausgewertet.
4. **Keine Notfall-Triage** — Red-Flag-Symptome → sofort Notruf-Hinweis, kein LLM-Versuch.
5. **Keine Laborwert-Interpretation** — hart geblockt.
6. **Keine Schwangerschafts-/Pädiatrie-Empfehlungen** im MVP.

Jede Verschiebung dieser Grenzen ist eine **regulatorische Entscheidung**, kein Feature-Request.

---

## 4. Clinical Safety Case (Strukturelles Argument)

Ein Safety Case beantwortet: *„Warum glauben wir, dass das System hinreichend sicher ist?"* Struktur nach GSN (Goal Structuring Notation), hier als Textform:

### 4.1 Top-Level-Claim (G1)

> **G1:** Der guardian-demo Cardio Coach verursacht im bestimmungsgemäßen Einsatz innerhalb seines Scopes keine klinisch relevanten Schäden an Nutzer:innen.

### 4.2 Strategie (S1)

> **S1:** Argumentation durch (a) Begrenzung des Themenraums, (b) Verhinderung von Halluzinationen, (c) verlässliche Eskalation aller Out-of-Scope-Situationen, (d) auditierbare Kontrolle über alle Inhalte.

### 4.3 Sub-Goals

- **G1.1** — Scope ist so eng definiert, dass keine regulatorisch relevanten Entscheidungen berührt werden. *Belegt durch:* TM-ARCH-005 §4, TM-ARCH-010.
- **G1.2** — Der Coach sagt nichts, was nicht auf eine Leitlinien-Quelle oder eine deterministische Regel zurückgeht. *Belegt durch:* TM-ARCH-001 §3, TM-ARCH-011 (Eval Suite).
- **G1.3** — Jede Nachricht wird pre- und post-processing durch einen Guardian geprüft. *Belegt durch:* TM-ARCH-003.
- **G1.4** — Red-Flag-Situationen werden verlässlich erkannt und mit einer hart kodierten Eskalation beantwortet. *Belegt durch:* TM-ARCH-003 §1.2, TM-ARCH-010 §3.
- **G1.5** — Jede ausgelieferte Aussage ist rückverfolgbar auf Version + Quelle. *Belegt durch:* TM-ARCH-002 §5, TM-ARCH-013.
- **G1.6** — Inhaltsänderungen durchlaufen ein 4-Augen-Prinzip mit klinischem Sign-off. *Belegt durch:* TM-ARCH-004 §3.
- **G1.7** — Bei Anomalien trennt ein Circuit Breaker das System vom Nutzer. *Belegt durch:* TM-ARCH-004 §7.
- **G1.8** — Betriebsseitige Kontrollen (SLOs, Observability, On-Call) sichern zeitnahe Erkennung und Reaktion. *Belegt durch:* TM-ARCH-012, TM-ARCH-013, TM-ARCH-014.

### 4.4 Assumptions (A)

- **A1:** Nutzer:innen wurden klar aufgeklärt, dass der Coach **kein Arzt-Ersatz** ist — Onboarding, AGB, persistentes Disclaimer-Element im UI.
- **A2:** Nutzer:innen haben einen realen ärztlichen Kontaktweg, den sie im Eskalationsfall verwenden können.
- **A3:** Das LLM-Backend erlaubt Region-Pinning und Daten-Isolation im EU-Raum (erfüllt durch AWS Bedrock EU-Region, siehe TM-ARCH-002).

### 4.5 Context (C)

- **C1:** Zielgruppe sind Erwachsene ohne akute kardiovaskuläre Krise.
- **C2:** Der Coach ist immer als **Ergänzung** zu einer bestehenden ärztlichen Betreuung positioniert.
- **C3:** Sprache ist zunächst Deutsch; Übersetzungen nur mit klinischer Review pro Sprache.

---

## 5. Hazard-Analyse (Auswahl)

| ID | Hazard | Ursache | Mitigation | Doc |
|---|---|---|---|---|
| H1 | Fehlende Notfall-Erkennung | Red-Flag-Klassifier falsch negativ | Doppelte Red-Flag-Regex vor Guardian; harter Fallback; Test-Suite mit 200+ realen Red-Flag-Formulierungen | TM-ARCH-003, TM-ARCH-011 |
| H2 | Halluzinierte Medikations-Empfehlung | Guardian-out unzureichend | Denylist „Medikament/Dosis/Wirkstoff"; Fact-Check gegen KB; keine KB-Einträge zu Medikation | TM-ARCH-010 |
| H3 | Jailbreak / Prompt-Injection umgeht Guardian | Angreifer manipuliert Input | Constitutional Classifier + Input-Normalisierung + Tenant-Isolation; Red-Team-Suite | TM-ARCH-009, TM-ARCH-011 |
| H4 | Falsche Quelle zitiert | RAG liefert falschen Snippet | Versionierte KB, signierte Snippets, Confidence-Threshold, Reject-über-Fallback | TM-ARCH-001, TM-ARCH-004 |
| H5 | Veralteter Content nach Leitlinien-Update | Keine Re-Review | Jährlicher Content-Review-Zwang, MLOps-Pipeline mit Freshness-Metadaten | TM-ARCH-004 |
| H6 | PII-Leak ins Modell | Rohe Eingaben in Prompt | Input-Redaction, strukturierte Felder, kein Raw-Message-Logging | TM-ARCH-007, TM-ARCH-008 |
| H7 | Nutzer ignoriert Disclaimer | UX | Persistente Reminder, Onboarding-Quiz | Produkt-Pflicht |
| H8 | Guardian kann nicht skalieren → Fallback zu „ungeprüft" | Architektur-Fehler | Fail-closed — wenn Guardian down, Coach-LLM auch down | TM-ARCH-003 §3 |
| H9 | Silent Regression in Prompt | Prompt-Change ohne Eval | Eval-Gate im CI erzwingt Regress-Check | TM-ARCH-004 §9, TM-ARCH-011 |
| H10 | Missbrauch durch Minderjährige | Altersverifikation | AGB-Bestätigung Mindestalter + Red-Flag für erkennbar jugendliche Formulierungen | Produkt + TM-ARCH-010 |

Die vollständige Hazard-Liste wird als lebendes Dokument im Compliance-Wiki geführt. Jeder Incident (TM-ARCH-014 §5) kann neue Hazards erzeugen.

---

## 6. Risk Control Measures — Mapping zur Architektur

| Kontrolle | Architektur-Element | Deep-Dive |
|---|---|---|
| Scope-Begrenzung durch Denylist | Guardian-in / Red Lines | TM-ARCH-003, TM-ARCH-010 |
| Grounded Generation | KB + RAG + Grounded Prompt | TM-ARCH-001 §3 |
| Output-Verifikation | Guardian-out | TM-ARCH-003 §1.3 |
| Nachvollziehbarkeit | Audit-Trail, signierte Artefakte | TM-ARCH-002 §5, TM-ARCH-004 §5 |
| Menschliche Kontrolle | 4-Eyes Review | TM-ARCH-004 §3 |
| Notfall-Abbruch | Circuit Breaker | TM-ARCH-004 §7 |
| Kontinuierliche Überwachung | Observability + SLOs | TM-ARCH-012, TM-ARCH-013 |
| Reaktionsfähigkeit | Runbook, On-Call | TM-ARCH-014 |
| Regelmäßige Verifikation | Eval & Red-Team | TM-ARCH-011 |

---

## 7. Verbleibendes Restrisiko und Akzeptanz

Auch mit allen Kontrollen bleibt ein nicht null-wertiges Restrisiko. Die akzeptierten Restrisiken und ihre Begründungen sind:

- **R1:** Ein Nutzer kann einen subtilen, nicht als Red Flag erkennbaren Warnhinweis formulieren, den weder Guardian noch Coach als kritisch einstufen. **Mitigation:** persistente Aufklärung, dass der Coach kein Arzt ist; klare Eskalationswege; zweimonatlicher Review der False-Negative-Cases.
- **R2:** Ein Leitlinien-Update könnte kurzzeitig im System veralten. **Mitigation:** Content-Freshness-Metadaten, Alarm, wenn Snippet älter als Jahresschwelle.
- **R3:** Ein LLM-Upgrade durch den Provider könnte Verhalten ändern. **Mitigation:** explizite Version-Pinning, Eval-Gate auf neue Versionen vor Rollout (TM-ARCH-004 §9).

Das Restrisiko ist für die gewählte Zweckbestimmung (Nicht-Medizinprodukt) als akzeptabel eingestuft.

---

## 8. Trigger für Re-Klassifizierung

Wenn eine der folgenden Änderungen diskutiert wird, ist **vor Implementierung** die Klassifizierung neu zu bewerten (und mit hoher Wahrscheinlichkeit fällt das System dann unter die MDR):

- Interpretation von Vitalwerten, Laborwerten oder Wearable-Daten
- Individualisierte Medikamenten-Empfehlungen oder -Interaktionen
- Einsatz zur Überwachung chronischer Erkrankungen mit Alarmfunktion
- Nutzung der Ausgaben durch Ärzt:innen als Grundlage für individuelle klinische Entscheidungen
- Ausweitung auf Pädiatrie oder Schwangerschaft
- Diagnose-adjacente Aussagen (*„das klingt nach…"*)

Jeder dieser Trigger öffnet automatisch ein ADR (TM-ARCH-017), das nicht ohne Klinik-Lead und Compliance-Lead geschlossen wird.

---

## 9. Offene Punkte

- Formale Bestätigung der Nicht-MDR-Einstufung durch externe Beratung vor dem ersten produktiven Rollout.
- Schriftliche Zweckbestimmung in AGB/Onboarding mit juristischem Review.
- Clinical Evidence: wir erheben im Pilot (TM-ARCH-016) explizit, ob Nutzer:innen den Scope verstehen.
