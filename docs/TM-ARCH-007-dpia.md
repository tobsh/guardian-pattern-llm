# DPIA — Datenschutz-Folgenabschätzung
## guardian-demo Cardio Coach

> Datenschutz-Folgenabschätzung nach Art. 35 DSGVO für den guardian-demo Cardio Coach. Das Produkt verarbeitet Gesundheits-relevante Informationen und LLM-vermittelte Konversationsdaten — damit ist eine DPIA sowohl durch Art. 35(3)(a) (systematische umfangreiche Bewertung von Personen) als auch durch Art. 35(3)(b) (besondere Kategorien personenbezogener Daten, Art. 9) **gesetzlich gefordert**.
>
> Dieses Dokument ist die interne Arbeitsversion der DPIA. Die formelle, unterschriebene Fassung wird vom Datenschutzbeauftragten (DPO) geführt und gepflegt.

**Stand:** 0.1 — Draft · **Owner:** DPO / Compliance-Lead · **Review-Zyklus:** vor Major-Release und mindestens jährlich.

---

## 1. Kurzfassung für die Führung

| Frage | Antwort |
|---|---|
| Verarbeiten wir personenbezogene Daten? | **Ja** — Kontakt, Profil, Konversationen. |
| Verarbeiten wir Gesundheitsdaten (Art. 9)? | **Ja** — potenziell, über Nutzer-Eingaben. |
| DPIA erforderlich? | **Ja** — Art. 35(3)(b) erfüllt. |
| Hohes Restrisiko nach Mitigation? | **Nein** — bei vollständiger Umsetzung der hier genannten Maßnahmen. |
| Rechtsgrundlage? | **Einwilligung** (Art. 6(1)(a) + Art. 9(2)(a)) für Nutzung; **Vertragserfüllung** für Kernfunktion. |
| Datenübermittlung in Drittländer? | **Nein** — AWS Bedrock wird strikt in EU-Region (`eu-central-1` oder `eu-west-1`) betrieben. |

---

## 2. Verantwortliche

- **Verantwortliche Stelle:** Tobias Hutzler (für MVP-Betrieb; wird vor GA in eine juristische Entität überführt).
- **Datenschutzbeauftragter:** *extern, zu benennen vor Pilot-Start*.
- **Betroffene:** Patient:innen, Ärzt:innen, Reviewer:innen, interne Mitarbeiter:innen.
- **Auftragsverarbeiter (geplant):** AWS (Infrastructure + Bedrock), weitere Dienstleister nur mit AVV nach Art. 28 DSGVO.

---

## 3. Zweckbestimmung und Notwendigkeit

### 3.1 Zweck

Kardiovaskuläre Lebensstil-Unterstützung (Bewegung, Ernährung, Rauchstopp) durch eine konversationelle Anwendung. Details zur regulatorischen Einstufung in TM-ARCH-006.

### 3.2 Warum personenbezogene Daten erforderlich sind

- **Profil** — für Altersband-, Geschlechts-, Aktivitätsstufen-gerechte Empfehlungen.
- **Konversations-Historie** — damit der Coach Kontext behält und nicht jede Session bei null anfängt.
- **Eskalations-Trail** — damit Ärzt:innen Out-of-Scope-Fälle sicher bearbeiten können.

Alles andere wird nicht verarbeitet. Verhaltens- und Werbe-Tracking ist explizit ausgeschlossen.

### 3.3 Datenminimierung

- Kein Klarname-Zwang; pseudonymes Konto ist Default.
- Altersband statt Geburtsdatum.
- Keine Geolokalisierung über Postleitzahl hinaus.
- Keine Wearable-Integration im MVP.

---

## 4. Datenarten und -fluss

Detailliertes Inventory in **TM-ARCH-008**. Überblick:

| Kategorie | Beispiel | Art. 9? | Retention | Speicherort |
|---|---|---|---|---|
| Kontaktdaten | E-Mail (für Login / Passwort-Reset) | nein | bis Kündigung + 90 d | DynamoDB (EU) |
| Profil | Altersband, Risiko-Ziel, Präferenzen | nein | bis Kündigung | DynamoDB (EU) |
| Onboarding-Anamnese (light) | „hat Hypertonie", „Raucher:in" | **ja** | bis Kündigung | DynamoDB (EU), verschlüsselt |
| Konversations-Logs | Nutzer-Input + Coach-Antwort, redacted | **ggf. ja** | 30 d Default, opt-in 12 m | S3 (EU), verschlüsselt |
| Guardian-Entscheidungen | Block/Pass + Kategorie | teils | 12 m | S3 (EU) |
| Eskalations-Cases | Vollständiger Turn + Kontext | **ja** | 12 m, dann anonymisiert | S3 (EU), restriktiver Zugriff |
| Audit-Logs | Wer hat wann was geändert | nein | 24 m | CloudTrail (EU), append-only |
| Metriken | aggregiert, k-anonym | nein | 24 m | CloudWatch |

---

## 5. Rechtsgrundlagen

| Verarbeitung | Art. 6 | Art. 9 |
|---|---|---|
| Konto & Kernfunktion | (1)(b) Vertragserfüllung | — |
| Gesundheits-Inputs in Konversationen | (1)(a) Einwilligung | (2)(a) Ausdrückliche Einwilligung |
| Eskalations-Weiterleitung an Arzt | (1)(a) Einwilligung + (1)(d) lebenswichtige Interessen im Notfall | (2)(a) bzw. (2)(c) |
| Audit-Logs | (1)(c) rechtliche Verpflichtung + (1)(f) berechtigtes Interesse | — |
| Aggregierte Produktverbesserung | (1)(f) berechtigtes Interesse | — |
| Modell-Training auf Nutzerdaten | **untersagt** — wir trainieren nicht auf Nutzerdaten | — |

---

## 6. Risiken für Betroffene

| ID | Risiko | Wahrscheinlichkeit | Schwere | Bewertung |
|---|---|---|---|---|
| D1 | Unbefugte Einsicht in Gesundheits-Inputs | mittel | hoch | mittel-hoch |
| D2 | Re-Identifizierung aus pseudonymisierten Logs | niedrig | hoch | mittel |
| D3 | Unbeabsichtigte Weitergabe an Dritte (LLM-Provider-Training) | niedrig | hoch | mittel |
| D4 | Profilbildung über Nutzer hinweg | niedrig | mittel | niedrig |
| D5 | Falsche oder vorenthaltene Auskunft auf DSGVO-Request | niedrig | hoch | mittel |
| D6 | Einsicht durch ausländische Behörden (Cloud Act u. ä.) | niedrig | hoch | mittel |
| D7 | Datenverlust durch Betriebsausfall | niedrig | mittel | niedrig |
| D8 | Zweckentfremdung von Konversations-Logs | niedrig | hoch | mittel |

---

## 7. Maßnahmen (technisch + organisatorisch)

### 7.1 Technisch

- **Verschlüsselung im Transit** (TLS 1.2+) und **at rest** (KMS, CMK pro Tenant).
- **PII-Redaction** vor Persistierung in Konversations-Logs (Namen, Adressen, Telefonnummern, E-Mails automatisiert geschwärzt, siehe TM-ARCH-008).
- **Strikte Region-Bindung** (`eu-central-1` / `eu-west-1`); Bedrock wird ausschließlich in EU-Region genutzt. Modell-Provider, die kein EU-Region-Pinning anbieten, werden **nicht** verwendet.
- **Kein Training auf Kundendaten.** AWS Bedrock dokumentiert: keine Nutzung von Prompts/Responses für Modell-Training. Vertraglich abgesichert im AVV.
- **Eigene KMS-Keys** mit Rotation; Key-Access ist IAM-granular.
- **Audit-Logs append-only** (CloudTrail mit Object-Lock).
- **Fine-grained IAM**: Zugriff auf Klartext-Eskalations-Cases nur für benannte Rollen, mit temporären Credentials und Logging.
- **Automatische Retention-Enforcement** (S3 Lifecycle Rules) — keine manuelle Löschung.
- **Löschkaskade über alle Stores** (dokumentiert in TM-ARCH-008).

### 7.2 Organisatorisch

- **AVV** mit jedem Sub-Processor nach Art. 28 DSGVO.
- **Verpflichtung auf Vertraulichkeit** für alle Mitarbeiter:innen.
- **Rollenkonzept**: trennscharfe Trennung zwischen Content-Autoren, Reviewer:innen, ML-Admins, Auditor:innen.
- **Schulung** zu DSGVO, klinischer Sensibilität und Red Lines (jährlich).
- **Incident Response Plan** mit 72-h-Meldekette an Aufsichtsbehörde (Art. 33).
- **Regelmäßige DPIA-Reviews** (s. §10).

### 7.3 Datenschutz durch Voreinstellung (Art. 25)

- Konversations-Log-Retention Default **30 Tage**; längere Retention nur aktiv opt-in durch den Nutzer mit eigener Einwilligung.
- Aggregate-Metriken standardmäßig k-anonym (k ≥ 50), sonst nicht auswertbar.
- Mitarbeitende sehen per Default **keine** Klartext-Inhalte — Arzt-Inbox zeigt redactete Zusammenfassung, bis der Fall bewusst geöffnet wird.

---

## 8. Betroffenenrechte

| Recht | Umsetzung |
|---|---|
| Auskunft (Art. 15) | Self-Service-Export aus der App + Backend-Prozess (Workflow C-2 in TM-ARCH-005) |
| Berichtigung (Art. 16) | Editierbares Profil; Konversations-Log-Edits nicht möglich (Datenintegrität), aber Kontext-Korrektur möglich |
| Löschung (Art. 17) | Konto-Löschung → Löschkaskade über alle Stores innerhalb 30 d |
| Einschränkung (Art. 18) | Pause-Funktion für Konto + Log-Ausschluss |
| Datenübertragbarkeit (Art. 20) | JSON-Export aller Profil- und Konversationsdaten |
| Widerspruch (Art. 21) | Gegen berechtigtes Interesse (Produktverbesserung) jederzeit möglich |
| Keine automatisierte Einzelentscheidung (Art. 22) | Der Coach trifft keine rechtserheblichen oder ähnlich beeinträchtigenden Entscheidungen; zusätzlich opt-out der aggregierten Auswertung möglich |

Alle Prozesse sind in TM-ARCH-014 als Runbook-Einträge dokumentiert.

---

## 9. Drittland-Übermittlungen

- **Keine** Drittland-Übermittlung im Normalbetrieb.
- Sub-Processor AWS: Region-Pinning auf EU; gesonderter AVV mit Standardvertragsklauseln als Rückfall; Bedrock-Nutzung ausschließlich in EU-Region.
- Supportzugriff durch AWS-Personal außerhalb EU ist durch Customer-Managed-Keys und organisatorische Maßnahmen eingegrenzt; Details im AVV.
- Cloud-Act-Restrisiko (siehe Risiko D6) wird durch Verschlüsselung mit eigenen Keys und durch vollständige Pseudonymisierung minimiert.

---

## 10. Konsultation & Review

- **DPO-Konsultation** vor Produktiv-Start verpflichtend.
- **Aufsichtsbehörde** — Vorab-Konsultation nach Art. 36 DSGVO *nur, wenn* das Restrisiko nach Mitigation als hoch eingestuft bliebe (aktuell: nein).
- **Review-Trigger:** (a) jährlich, (b) vor jedem Major-Release, (c) bei jedem Incident mit personenbezogenem Bezug, (d) bei jeder Änderung der Scope-Grenzen (vgl. TM-ARCH-006 §8).

---

## 11. Restrisiko und Freigabe

Nach Umsetzung der Maßnahmen aus §7 wird das Restrisiko als **niedrig bis mittel** eingestuft. Eine formelle Freigabe erfolgt durch DPO + Compliance-Lead + Klinischen Lead vor Produktiv-Rollout.

---

## 12. Offene Punkte

- Externe DPO-Benennung abschließen.
- Formulierungen der Einwilligungs-Texte durch juristisches Review.
- Einwilligungs-Management-System (CMP) auswählen.
- Finale Review mit AWS-AVV und deren Bedrock-spezifischen Zusätzen.
