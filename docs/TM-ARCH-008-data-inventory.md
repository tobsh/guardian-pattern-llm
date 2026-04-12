# Data Inventory & PII Classification
## guardian-demo Cardio Coach

> Vollständiges Datenverzeichnis für den guardian-demo Cardio Coach. Für jedes Datum wird definiert: **was** es ist, **wo** es liegt, **wie lange**, **warum**, **wer** darauf zugreifen darf und **wie** es gelöscht wird. Dieses Dokument ist die technische Grundlage für DPIA ([TM-ARCH-007](./TM-ARCH-007-dpia.md)) und DSGVO-Auskunfts-/Löschprozesse.

**Stand:** 0.1 — Draft · **Owner:** DPO + ML/Platform Admin · **Review-Zyklus:** bei jeder Schema-Änderung, mind. quartalsweise.

---

## 1. Ziele

1. **Vollständigkeit** — jede personenbezogene oder sensitive Information im System ist hier gelistet. Was nicht hier steht, darf nicht persistiert werden.
2. **Klassifizierung** — jedes Datum hat eine Sensitivitätsstufe. Die Stufe bestimmt Verschlüsselung, Access, Retention, Logging.
3. **Löschbarkeit** — für jedes Datum ist dokumentiert, wie es auf DSGVO-Lösch-Request verschwindet.
4. **Auskunftsfähigkeit** — für jedes Datum ist dokumentiert, wie es auf einen Art.-15-Antrag exportiert wird.

---

## 2. Sensitivitätsstufen

| Stufe | Beschreibung | Beispiele | KMS | Logging | Default-Retention |
|---|---|---|---|---|---|
| **P0 — Public** | Keine personenbezogenen Daten | Dokumentation, KB-Snippets ohne Patienten-Inhalt | nein | ja | ∞ |
| **P1 — Internal** | Interne Daten, nicht patientenbezogen | System-Metriken (aggregiert), Build-Artefakte | ja (Platform-CMK) | ja | 24 m |
| **P2 — Personal** | Personenbezogen, nicht sensitiv | E-Mail, Login, Altersband, UI-Einstellungen | ja (Tenant-CMK) | eingeschränkt | bis Kündigung + 90 d |
| **P3 — Sensitive** | Gesundheits-relevante Daten nach Art. 9 DSGVO | Onboarding-Anamnese, Konversations-Inhalte, Eskalations-Cases | ja (Tenant-CMK, dedicated) | nur Audit-Log; kein Klartext in App-Logs | 30 d (opt-in 12 m) |
| **P4 — Restricted** | Höchste Sensitivität: Klartext-Eskalations-Cases mit ärztlichem Kontext, Kryptomaterial | KMS-Keys, Signaturschlüssel, Red-Flag-Klartexte in Arzt-Inbox | ja, Hardware-KMS | Read-Logging zwingend | so kurz wie möglich; 7 d für Klartext-Detail, dann Zusammenfassung |

**Regel**: jede neue Kolonne / jedes neue Feld muss *vor* dem Rollout eine Stufe bekommen. Ohne Stufe kein Persist.

---

## 3. Datenarten im Detail

### 3.1 Account & Profil (P2)

| Feld | Typ | Zweck | Store | Retention | Löschung |
|---|---|---|---|---|---|
| `user_id` | UUID v4 | Pseudonymer Primärschlüssel | DynamoDB `users` | bis Kündigung + 90 d | Hard-Delete kaskadiert |
| `email` | string | Login, Reset, Notifications | DynamoDB `users` | bis Kündigung + 90 d | Hard-Delete |
| `password_hash` | argon2id | Authentication | DynamoDB `users` | bis Kündigung | Hard-Delete |
| `display_name` | string (optional) | UI-Begrüßung | DynamoDB `users` | bis Kündigung | Hard-Delete |
| `locale` | enum (de-DE…) | Sprache | DynamoDB `users` | bis Kündigung | Hard-Delete |
| `created_at` / `last_seen_at` | timestamp | Housekeeping | DynamoDB `users` | bis Kündigung + 90 d | Hard-Delete |

### 3.2 Onboarding & Persona (P2/P3)

| Feld | Typ | Stufe | Zweck | Store | Retention |
|---|---|---|---|---|---|
| `age_band` | enum (18-24, 25-34…) | P2 | Altersgerechte Ansprache | DynamoDB `profiles` | bis Kündigung |
| `sex_biological` | enum (m, f, x, skip) | P2 | Leitlinien-konforme Empfehlung | DynamoDB `profiles` | bis Kündigung |
| `risk_profile` | struct | **P3** | Lebensstil-Empfehlungen | DynamoDB `profiles`, CMK | bis Kündigung |
| ↳ `has_hypertension` | bool | P3 | siehe oben | " | " |
| ↳ `is_smoker` | bool | P3 | siehe oben | " | " |
| ↳ `bmi_band` | enum | P3 | siehe oben | " | " |
| `goal` | enum (move, nutrition, smoke-free) | P2 | Pfadsteuerung | DynamoDB `profiles` | bis Kündigung |
| `persona_tone` | enum (formal, casual) | P2 | Tonalität | DynamoDB `profiles` | bis Kündigung |
| `assistant_name` | string (optional) | P2 | Personalisierung | DynamoDB `profiles` | bis Kündigung |
| `consent_version` | string | P2 | Einwilligungs-Nachweis | DynamoDB `consents` | 3 Jahre nach Widerruf (Nachweis) |
| `consent_timestamp` | timestamp | P2 | s.o. | DynamoDB `consents` | s.o. |

### 3.3 Konversationen (P3)

| Feld | Typ | Stufe | Zweck | Store | Retention |
|---|---|---|---|---|---|
| `turn_id` | UUID v7 | P2 | Primärschlüssel pro Nachricht | S3 `turns/{user_id}/…` | 30 d / opt-in 12 m |
| `user_id` | UUID | P2 | Zuordnung | " | " |
| `role` | enum (user, assistant, system) | P1 | Rollen-Tagging | " | " |
| `content_redacted` | text | **P3** | Nachricht nach PII-Redaction | " | " |
| `content_raw` | text | **NICHT PERSISTIERT** | — | — | — |
| `guardian_decisions` | struct | P2 | Audit des Guardian-Laufs | " | " |
| `kb_refs` | [snippet_id@version] | P1 | Zitierbarkeit | " | " |
| `prompt_version` | string | P1 | Reproduzierbarkeit | " | " |
| `model_version` | string | P1 | Reproduzierbarkeit | " | " |
| `timestamp` | ISO-8601 | P1 | Housekeeping | " | " |

**Wichtig:** `content_raw` wird *zu keinem Zeitpunkt* persistiert. Der User-Input läuft durch eine Redaction-Pipeline, bevor er den App-Prozess verlässt; nur `content_redacted` erreicht Storage und Observability.

### 3.4 Eskalations-Cases (P4)

Wenn Guardian einen Fall als eskalationswürdig einstuft (z. B. Red Flag, wiederholter Policy-Verstoß), wird ein **Case** angelegt. Cases sind das einzige P4-Datenartefakt im normalen Betrieb.

| Feld | Typ | Stufe | Zweck | Retention |
|---|---|---|---|---|
| `case_id` | UUID | P2 | Primärschlüssel | 12 m |
| `user_id` | UUID | P2 | Zuordnung | 12 m |
| `summary_redacted` | text | P3 | Was Ärzt:in zuerst sieht (ohne Klartext) | 12 m |
| `raw_turn_refs` | [turn_id] | P2 | Nachverfolgbarkeit | 12 m |
| `opened_by` | user_id | P2 | Audit | 12 m |
| `opened_klartext_at` | timestamp | P2 | Audit | 12 m |
| `klartext_payload` | text | **P4** | Klartext, nur auf bewusste Anforderung sichtbar | **7 d** nach Öffnen, dann automatisch zurück auf redacted-only |
| `resolution` | enum + notes | P3 | Abschlussprotokoll | 12 m |

Der Übergang `klartext_payload sichtbar → ausgeblendet` ist automatisch und nicht deaktivierbar.

### 3.5 Guardian-Metadaten (P2)

Pro Turn werden die Guardian-Entscheidungen als strukturiertes Objekt gespeichert (nicht der Input selbst):

- Input-Klassifizierung (Topic, Red-Flag-Score, Injection-Score)
- Output-Klassifizierung (Fact-Check-Score, Red-Line-Hits, Shape-Valid)
- Denylist-Hits (kategorisch, nicht wörtlich)
- Policy-Version

Retention: 12 Monate (für Eval und Red-Team-Set), dann Aggregation.

### 3.6 KB / Content-Artefakte (P0/P1)

| Feld | Typ | Stufe | Retention |
|---|---|---|---|
| `snippet_id@version` | string | P0 | ∞ (Immutable) |
| `content_md` | markdown | P0 | ∞ |
| `sources[]` | URL / DOI | P0 | ∞ |
| `review_trail[]` | struct | P1 | ∞ (Audit) |
| `signing_metadata` | struct | P1 | ∞ |

KB ist explizit kein personenbezogenes Datum, auch wenn sie in persönlichen Antworten zitiert wird.

### 3.7 Audit-Logs (P1)

- CloudTrail-Events (alle AWS-API-Calls)
- Application-Audit-Log (jede Admin-Aktion, jede Flag-Änderung, jeder Klartext-Zugriff auf Cases)
- Retention: 24 Monate, append-only (Object Lock)

### 3.8 Metriken (P1)

- Aggregate Counter, Histogramme
- k-Anonymität: k ≥ 50; Metriken mit kleineren Kohorten werden nicht erzeugt
- Retention: 24 Monate

### 3.9 Modell-/Prompt-/Policy-Registry (P0/P1)

Versionierte Artefakte des MLOps-Stacks (Prompts, Guardian-Policies, Eval-Sets). Kein Personenbezug.

---

## 4. PII-Redaction-Pipeline

Jede Nutzer-Eingabe wird *vor* dem Coach-Prozess durch folgende Stufen geschickt:

```
Raw Text
    │
    ▼
┌───────────────────────────┐
│ 1. Normalisierung         │  Unicode NFC, Whitespace-Trim
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 2. Erkennung              │  NER: PER, LOC, ORG, EMAIL, PHONE, IBAN
│    (on-device / in-proc)  │  Regex: typische DE-Formate
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 3. Ersetzung              │  [PERSON], [EMAIL], [PHONE], [LOCATION]
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 4. Strukturierung         │  { redacted_text, tokens_removed_count,
│                           │    categories_hit[] }
└─────────────┬─────────────┘
              ▼
        Downstream (Guardian, LLM, Store)
```

Der Coach-LLM sieht also z. B. `„Mein Name ist [PERSON], ich wohne in [LOCATION]"` statt des Originals. Die redactete Form ist, was persistiert wird. Der Original-Text verbleibt nur flüchtig im RAM der bearbeitenden Lambda-Invocation.

**Test-Suite:** 500+ synthetische Beispiele sind im Red-Team-Set (TM-ARCH-011) und werden mit jedem Release geprüft.

---

## 5. Löschkaskade

Eine DSGVO-Löschung (Art. 17) wird über einen einzigen Trigger (`user.delete(user_id)`) ausgelöst. Der Trigger orchestriert:

```
[delete_request]
      │
      ├──▶ DynamoDB users:          DELETE item
      ├──▶ DynamoDB profiles:       DELETE item
      ├──▶ DynamoDB consents:       KEEP (Nachweispflicht), aber Personenbezug kappen
      ├──▶ S3 turns/{user_id}/*:    DELETE objects (inkl. Versionen)
      ├──▶ S3 cases/{user_id}/*:    DELETE objects
      ├──▶ CloudWatch Logs:         keine direkte Löschung (PII darf dort nicht landen — per Design)
      ├──▶ Backups:                 markieren für Rotation; spätestens nach Backup-TTL weg
      └──▶ Audit-Log:               Eintrag mit (user_id_hash, timestamp, operator)
```

- **Hard-Delete-SLA:** 30 Tage ab Bestätigung.
- **Backup-TTL:** Backups der betroffenen Stores werden spätestens nach 35 Tagen rotiert.
- **Widerspruchs-Entries** (Consent-Trail) bleiben zur Nachweispflicht, aber ohne direkten Personenbezug (gehasht).

---

## 6. Zugriffskontrolle — wer darf was sehen?

| Rolle | P0 | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| Patient:in (sich selbst) | ja | nein | ja | ja | nur auf direktem Weg |
| Arzt / Reviewer (nicht patientenzugeordnet) | ja | nein | nein | aggregate | nein |
| Arzt mit Eskalations-Zuweisung | ja | nein | ja | summary | **klartext nur auf bewusste Öffnung + Zeitfenster** |
| Content-Autor | ja | nein | nein | nein | nein |
| ML / Platform Admin | ja | ja | nein | nein | nein |
| Security / Auditor | ja | ja | metadaten | metadaten | zugriff nur auf Audit-Log, nicht auf Payload |
| DPO | ja | ja | ja | auf Anfrage, geloggt | auf Anfrage, geloggt, 4-Augen |

Jeder P3/P4-Zugriff wird geloggt (`who, when, why, case_id`), und das Logging selbst ist P1 (append-only).

---

## 7. Backups

- **Tägliche Snapshots** der DynamoDB-Tables + der S3-Konversations-Buckets.
- Backup-Speicher gleiche KMS-Keys wie Primär-Store.
- **TTL**: 35 Tage. Danach automatische Rotation.
- Backup-Restore-Tests: monatlich, auf isolierte Non-Prod-Umgebung.
- Backups sind **keine** zusätzliche Zweckbindung — sie dienen ausschließlich der Wiederherstellung.

---

## 8. Monitoring der Retention

Ein dedizierter *Retention-Reaper* (Scheduled Lambda) prüft täglich:

- Sind alle S3 Lifecycle Rules aktiv und nicht driftend?
- Gibt es Objekte jenseits ihrer TTL? Sollte nie passieren — Alarm wenn doch.
- Gibt es Accounts, die mehr als ihr Kontingent an P3 halten?
- Gibt es P4-Klartext-Payloads, die länger als 7 Tage offen stehen?

Alle Signale laufen in die Observability-Plane (TM-ARCH-013).

---

## 9. Offene Punkte

- **Detaillierte NER-Pipeline**: Auswahl der Modelle (on-device vs. kleines LLM) und Evaluierung für Deutsch.
- **Schema-Versionierung**: wir brauchen einen leichten Migration-Pfad, wenn Felder hinzukommen oder Stufen wechseln.
- **Data-Lineage-Tool**: langfristig wollen wir Datenfluss automatisch aus Code ableiten, nicht manuell pflegen.
