# Rollout Plan
## guardian-demo Cardio Coach

> Wie wir vom ersten Prototypen zu echten Patient:innen kommen — ohne den Bogen zu überspannen. Das Dokument beschreibt die vier Phasen **Shadow → Pilot → Controlled GA → GA**, ihre Ein- und Ausstiegskriterien, die Rollen-Erwartungen pro Phase und die Abbruchkriterien, die jede Phase jederzeit stoppen können.

**Stand:** 0.1 — Draft · **Owner:** Produkt-Lead + Klinischer Lead · **Review-Zyklus:** pro Phasen-Wechsel + monatliche Fortschritts-Checkpoints.

---

## 1. Prinzipien

1. **Vertrauen baut sich in Schritten auf.** Jede Phase soll nur das nächstgrößere Risiko zulassen.
2. **Evidenz vor Umfang.** Keine Phase wird durch Datum, nur durch erfüllte Kriterien ausgelöst.
3. **Rückwärts ist immer eine Option.** Jede Phase hat einen dokumentierten Rückfall-Pfad, auch nachträglich.
4. **Patient:innen wissen, in welcher Phase sie sind.** In Pilot-Phasen gibt es explizite Kommunikation, dass das Produkt sich entwickelt.

---

## 2. Phasen im Überblick

```
┌────────────┐    ┌────────────┐    ┌──────────────┐    ┌─────────┐
│  Shadow    │──▶│   Pilot    │──▶│ Controlled GA │──▶│   GA    │
│ 0 Patienten│    │ 50–200 P.  │    │ 1–5k Patienten│    │  offen  │
│ Dauer 4 w  │    │ Dauer 8 w  │    │ Dauer 8 w     │    │         │
└────────────┘    └────────────┘    └──────────────┘    └─────────┘
     │                  │                   │                │
     ▼                  ▼                   ▼                ▼
 kein User-         echte User            PLZ- o.         Offen, mit
 Risiko, nur        mit starker           Klinik-         Standard-
 Klinik-Spot-       Begleitung,           begrenztes      Rollout-
 Check + Red-       geführtes             Angebot         gates
 Team Interni      Onboarding            (Funnel-
                                          kontrolle)
```

---

## 3. Phase 0 — Pre-Flight

Bevor Shadow überhaupt anläuft, sind folgende Meilensteine Pflicht (TM-ARCH-011 §9):

- Red-Line-Suite: 100 % Block
- Jailbreak-Suite: ≥ 99,5 % Block
- Escalation-Suite: 100 % korrekt
- PII-Leak-Suite: 0 Leaks
- DPIA durch DPO freigegeben (TM-ARCH-007)
- Threat Model durch Security-Review bestätigt (TM-ARCH-009)
- Runbook vorhanden, On-Call-Rotation gesetzt (TM-ARCH-014)
- Cost-Dashboard live (TM-ARCH-015)
- Vertragliche AWS-AVV signiert

Ohne diese Liste — kein Rollout.

---

## 4. Phase 1 — Shadow (4 Wochen)

### 4.1 Ziel

Beobachten, wie sich der Coach in einer **nicht patient-zugewandten Umgebung** verhält, mit realistischen Test-Prompts, Klinik-Spot-Checks und internen Nutzer:innen.

### 4.2 Wer

- Engineering-Team (volle Team-Größe, 5–8 Personen)
- 2 Ärzt:innen aus dem Klinik-Netzwerk (Content-Owner)
- Externes Red-Team einmalig in Woche 2
- **Keine echten Patient:innen**

### 4.3 Was läuft

- Täglich 100–200 Turns aus Test-Prompts + Mitarbeiter-Nutzung
- Wöchentlicher Klinik-Spot-Check (Sample 50 Turns)
- Alle Metriken aus TM-ARCH-012 aktiv
- Cost-Tracking ab Tag 1

### 4.4 Ausstiegs-Kriterien (→ Pilot)

- 4 Wochen ohne Sev-1
- Groundedness-Score ≥ 0,95
- Red-Line-Block-Rate = 100 %
- Klinik-Lead schriftliches OK
- Externes Red-Team hat keine kritischen offenen Findings
- Feedback aus Mitarbeiter-Nutzung + Content-Autor:innen ist verarbeitet

### 4.5 Abbruch-Kriterien

- 1× Red-Line-Verstoß in Produktion
- PII-Leak
- Groundedness fällt > 5 Pt unter Baseline für > 3 Tage
- Externe Audit-Findings, die nicht innerhalb 2 Wochen gelöst werden können

---

## 5. Phase 2 — Pilot (8 Wochen)

### 5.1 Ziel

Erste echte Nutzung durch begrenzte Patient:innen-Gruppe, mit intensiver Begleitung. Validierung der klinischen Akzeptanz und der Effizienz des Setup-Flows.

### 5.2 Wer

- 50 → 200 Patient:innen (ramp-up über 2 Wochen)
- Rekrutiert aus **2–3 kooperierenden Praxen/Zentren** durch deren Ärzt:innen
- Inklusionskriterien: Erwachsene mit kardiovaskulärem Risiko, stabile Grundversorgung, schriftliches Einverständnis
- Exklusionskriterien: akute Dekompensation, Schwangerschaft/Stillzeit, < 18 Jahre, schwere psychische Krise

### 5.3 Was neu ist

- Echte Nutzer-Inputs
- Feedback-Formular nach jedem Coach-Turn (thumbs + optionaler Kommentar)
- Wöchentliches Ärzt:innen-Review der Eskalations-Inbox
- Monatlicher Nutzer-Survey (Verständlichkeit, Scope-Klarheit, Nutzen)

### 5.4 Ausstiegs-Kriterien (→ Controlled GA)

- 8 Wochen ohne Sev-1 mit patient-relevanter Auswirkung
- Escalation-Completeness = 100 % (jedes Red Flag korrekt eskaliert)
- Groundedness-Score ≥ 0,95, Helpfulness-Score ≥ 0,85
- Nutzer-Survey: ≥ 80 % verstehen den Scope klar; ≥ 70 % berichten Nutzen
- Content-Freshness: 100 %
- Cost / Turn innerhalb 20 % des Modells
- Schriftliches OK vom Klinik-Lead, Compliance-Lead, Produkt-Lead

### 5.5 Abbruch-Kriterien

- Jedes patientenwirksame Sev-1-Ereignis (siehe TM-ARCH-014 §1)
- Nutzer-Survey zeigt < 50 % Scope-Verständnis → zurück an UX
- Cost-Explosion > 2× Plan ohne Erklärung
- Klinik-Lead oder DPO entzieht die Freigabe aus irgendeinem Grund

---

## 6. Phase 3 — Controlled GA (8 Wochen)

### 6.1 Ziel

Skalierung auf 1.000–5.000 Nutzer:innen mit **deutlicher, aber noch steuerbarer** Funnel-Kontrolle. Stresstest für Operations und Cost.

### 6.2 Steuerung

- Anmeldung weiterhin über einen **Opt-in-Kanal** (z. B. Praxis-Netzwerk, klinische Studien-Kohorten, Arbeitgeber-Health-Programme)
- Warteliste wenn nötig
- Klare UX-Kommunikation: *„Wir sind gerade im kontrollierten Start"*
- Monitoring auf Nutzer-Kohorten: Engagement-Drop-offs, Eskalations-Verteilung, Cost-Spikes

### 6.3 Was neu ist

- Echte Skalierungs-Probleme (DB, Vector-Store, Bedrock-Quoten)
- Multi-Praxen-Zuordnung, damit Eskalations-Cases zu den richtigen Ärzt:innen gehen
- Erster On-Call-Rotations-Test unter realistischer Last

### 6.4 Ausstiegs-Kriterien (→ GA)

- 8 Wochen ohne Sev-1 mit patient-relevanter Auswirkung
- Alle SLOs (TM-ARCH-012) erfüllt oder besser
- Incident-Postmortems alle abgeschlossen, Action Items bearbeitet
- Skalierungs-Architektur getestet (Last-Test + echter Peak)
- Positives Votum Klinik + Compliance + Produkt

---

## 7. Phase 4 — GA

### 7.1 Was ändert sich?

- Marketing-/Kommunikations-Freigabe
- Selbstständige Anmeldung ohne Funnel
- On-Call-Rotation auf vollen 24/7-Modus
- Öffentlicher Status-Kanal
- Quartals-Kadenz für Content-Reviews

### 7.2 Fortlaufende Pflichten

- Quarterly Review Pack (TM-ARCH-011 §8.2)
- Jährlicher DPIA-Review (TM-ARCH-007 §10)
- Jährlicher Threat-Model-Review (TM-ARCH-009 §7)
- Externe Red-Team-Session quartalsweise
- Pentest mindestens 1×/Jahr

---

## 8. Rollback-Pfade

Jede Phase kann **rückwärts**:

- Controlled GA → Pilot: Warteliste stoppen, Onboarding pausieren, bestehende Nutzer:innen informieren, Kohorten-Support hochfahren.
- Pilot → Shadow: alle Pilot-Nutzer:innen auf Standby-UI mit Abschiedsnachricht + Empfehlung zur Ärzt:in; Ursache-Analyse.
- Shadow → Abbruch: Architektur-/Klinik-Entscheidung, offener Re-Launch-Termin.

Ein Rollback ist **keine Niederlage**. Er ist die dokumentierte Konsequenz der Prinzipien in §1.

---

## 9. Kommunikation

- **Patient-facing**: jede Phase hat einen definierten UI-Banner + FAQ.
- **Ärzt:innen-facing**: Kurzpräsentation + Onboarding für jede neue Praxis in Phase 2 / 3.
- **Medienanfragen**: erst nach Controlled GA, mit vorbereiteten Sprachregelungen.
- **Incident-Kommunikation**: Entscheidung bei Comms/Product-Lead, nie durch Engineering direkt.

---

## 10. Offene Punkte

- Auswahl der Pilot-Praxen.
- Klinisches Studien-Design (wenn wir Evidence publizieren wollen).
- Rechtliche Klärung: Wie stark dürfen kooperierende Praxen den Coach in ihren Abläufen einsetzen?
- Patient-Kommunikations-Prototyp (Onboarding-Texte, AGB).
