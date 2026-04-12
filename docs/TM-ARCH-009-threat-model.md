# Threat Model
## guardian-demo Cardio Coach

> STRIDE-basiertes Threat Model für den guardian-demo Cardio Coach. Deckt klassische Web-/API-Risiken *und* die LLM-spezifischen Risiken aus dem OWASP LLM Top-10 (Prompt Injection, Data Exfiltration, Insecure Output Handling, Supply Chain, usw.) ab. Das Modell ist die Grundlage für Security-Reviews und für die Prüfkriterien im Red-Team-Harness ([TM-ARCH-011](./TM-ARCH-011-evaluation-red-team.md)).

**Stand:** 0.1 — Draft · **Owner:** Security-Lead (im MVP: Tobias Hutzler) + ML/Platform Admin · **Review-Zyklus:** pro Major-Release und bei jedem Incident.

---

## 1. Scope & Annahmen

### 1.1 In Scope

- Coach Runtime Plane (Setup Agent, Guardian in/out, Coach LLM, Orchestrator, KB, Rule Engine)
- Content & MLOps Plane (Workbench, Review, Registry, CI/CD, Flags, Canary)
- AWS Control Plane (VPC, IAM, KMS, Bedrock, S3, DynamoDB, CloudTrail)
- End-User-Clients (Web, App) bis zur TLS-Termination

### 1.2 Out of Scope (für dieses Dokument)

- Physische Sicherheit der AWS-Rechenzentren (durch AWS verantwortet)
- Nutzer-Endgeräte-Sicherheit (Betriebssysteme, Browser)
- Drittanbieter-Ökosysteme der Patient:innen (E-Mail-Provider, Passwort-Manager)

### 1.3 Trust Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│                 Untrusted Internet                           │
│  ┌───────────┐    ┌───────────┐                              │
│  │ Patient   │    │ Angreifer │                              │
│  └─────┬─────┘    └─────┬─────┘                              │
└────────┼────────────────┼────────────────────────────────────┘
         │                │
         ▼                ▼
   ─────────── Boundary 1: TLS / WAF / Rate-Limit ───────────
         │                │
         ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                 Edge / API Gateway (trusted)                 │
│                                                                │
│  ──── Boundary 2: App-Auth + IAM + VPC ────                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                 Runtime VPC (trusted)                    │ │
│  │  Guardian · Coach LLM · KB · Rule Engine · Orchestrator  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ──── Boundary 3: Bedrock Managed Service (semi-trusted) ──   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Bedrock Region (EU)                         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ──── Boundary 4: Content/MLOps VPC (trusted, isolated) ──    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │    Workbench · Registry · CI/CD · Eval · Flags           │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Assets und deren Schutzziele

| Asset | Vertraulichkeit | Integrität | Verfügbarkeit |
|---|---|---|---|
| Patient-Gesundheitsdaten (P3) | **hoch** | hoch | mittel |
| Konversations-Logs (P3) | **hoch** | hoch | mittel |
| Eskalations-Cases Klartext (P4) | **hoch** | hoch | niedrig |
| KB / Content-Snippets | niedrig | **hoch** | hoch |
| Guardian-Policies | niedrig | **hoch** | hoch |
| Prompts / Modell-Pins | mittel | **hoch** | hoch |
| Audit-Trail | mittel | **hoch** (append-only) | mittel |
| KMS-Keys | **hoch** | hoch | hoch |
| User-Credentials | **hoch** | hoch | mittel |

---

## 3. STRIDE-Kategorien

Für jedes Hauptelement werden Bedrohungen nach STRIDE durchgegangen: **S**poofing, **T**ampering, **R**epudiation, **I**nformation Disclosure, **D**enial of Service, **E**levation of Privilege.

### 3.1 Edge / API Gateway

| STRIDE | Bedrohung | Mitigation |
|---|---|---|
| S | Session-Hijack durch Token-Diebstahl | Kurze TTL, HttpOnly+Secure-Cookie, Refresh-Token-Rotation, Device Binding |
| T | Request-Parameter-Manipulation | Server-side Validation, strict typing |
| R | Nutzer bestreitet gesendete Nachricht | Audit-Log mit `turn_id`, TLS-Terminierung protokolliert |
| I | Log-Leak mit Header-Tokens | Log-Redaction, PII-Filter vor Shipping |
| D | Layer-7-Flood / Brute Force | Rate-Limit, WAF-Rules, CAPTCHAs auf Login |
| E | Misconfigurierte CORS → Cross-Origin-API | Strict same-origin policy, explicit allowlist |

### 3.2 Guardian (in & out)

| STRIDE | Bedrohung | Mitigation |
|---|---|---|
| S | Angreifer gibt sich als System aus (System-Prompt-Override) | Klare Rollen-Trennung im Prompt-Format, kein User-Content in System-Rolle |
| T | Denylist-Bypass durch Obfuskation (Leetspeak, Unicode) | Normalisierung vor Check, Embedding-basierte Kategorisierung zusätzlich |
| R | Keine Spur einer Guardian-Entscheidung | Pro Turn strukturierter Guardian-Log-Eintrag mit Policy-Version |
| I | Prompt-Extraction (Angreifer holt sich den System-Prompt) | System-Prompt wird nie zurückgegeben; Output-Validator erkennt Prompt-Echo |
| D | Guardian-Überlast durch sehr lange Inputs | Input-Length-Cap vor Guardian; Fail-closed, wenn Limit überschritten |
| E | Angreifer erreicht Rule-Bypass via Multi-Step-Jailbreak | Context-Window-Resets, Turn-übergreifende Risk-Accumulation |

**LLM-spezifisch:**

- **Prompt Injection (LLM01)** — Nutzer versucht, den System-Prompt zu überschreiben. *Mitigation:* Guardian-in mit Injection-Classifier + klare Trennung von User- und System-Nachrichten, keine tool-use-autorität für Nutzer-Inputs.
- **Insecure Output Handling (LLM02)** — Output enthält ausführbaren Code / Links. *Mitigation:* Output-Schema erzwingt strukturierte Antworten; kein HTML-Rendering des Modell-Outputs.
- **Sensitive Information Disclosure (LLM06)** — Modell halluziniert oder gibt Trainingsdaten preis. *Mitigation:* Grounded Generation, Fact-Check-Validator, Denylist-Kategorien.
- **Excessive Agency (LLM08)** — Modell bekommt Tool-Zugriff. *Mitigation:* Im MVP **keine** autonome Tool-Nutzung durch das LLM; alle Aktionen durchlaufen den Orchestrator.

### 3.3 Coach LLM (Bedrock)

| STRIDE | Bedrohung | Mitigation |
|---|---|---|
| S | Fake-Modell (kein Bedrock, sondern Proxy) | VPC-Endpoint auf Bedrock, TLS-Pinning, Signed Responses |
| T | Modell wird vom Provider stillschweigend geändert | Explizites Version-Pinning, Eval-Gate auf neue Versionen |
| I | Prompt+Response beim Provider persistiert | Vertraglich: kein Training; technisch: Keine zusätzlichen System-Headers |
| D | Rate-Limit / Kontingent bei Bedrock überschritten | Multi-Region-Failover, Circuit Breaker in App |

### 3.4 Content / MLOps Plane

| STRIDE | Bedrohung | Mitigation |
|---|---|---|
| S | Git-Commit unter falschem Namen | Signed Commits verpflichtend, Branch-Protection |
| T | Artefakt-Manipulation zwischen Build und Deploy | Sigstore/Cosign-Signaturen, Provenance-Attestation, S3 Object-Lock |
| R | Admin bestreitet Flag-Änderung | Jede Flag-Aktion signiert + im Audit-Log |
| I | Content-Leak durch Misconfig (öffentlicher Bucket) | Alle Buckets privat, SCPs blocken Public-Write auf Org-Level |
| D | CI überlastet (DoS auf Build-Pipeline) | Concurrency-Caps, Abuse-Monitoring |
| E | CI-Runner kompromittiert → Supply-Chain | Ephemere Runner, minimal-privilegierte IAM, keine langlebigen Secrets in Runnern |

**LLM-spezifisch:**

- **Supply Chain (LLM05)** — bösartiger Content-Snippet gelangt in KB. *Mitigation:* 4-Augen-Prinzip (TM-ARCH-004 §3), Eval-Gate, Quellenpflicht.
- **Training Data Poisoning (LLM03)** — im MVP nicht anwendbar, weil wir nicht trainieren. Bei Fine-Tuning später: eigener Threat-Model-Nachtrag.

### 3.5 AWS Control Plane

| STRIDE | Bedrohung | Mitigation |
|---|---|---|
| S | IAM-User-Impersonation | MFA verpflichtend, keine Long-Term-Access-Keys, SSO mit kurzen Token |
| T | Lateral Movement nach kompromittiertem Service | Least-Privilege-Roles, Service-Segmentation |
| R | Admin-Aktion unnachvollziehbar | CloudTrail enabled über alle Regions, Object-Lock |
| I | KMS-Key-Exposure | CMK pro Tenant, Key-Policy mit Condition-Checks, kein Export |
| D | Regional AWS-Outage | Multi-AZ, EU-Region-Failover-Plan (TM-ARCH-014 §4) |
| E | Cross-Account-Assumption | Explicit Trust-Boundaries, `aws:SourceArn`-Conditions |

---

## 4. Angreifer-Profile

| Profil | Motivation | Fähigkeiten | Relevante Bedrohungen |
|---|---|---|---|
| **Script Kiddie** | Ausprobieren, Aufmerksamkeit | Standard-Tools, Copy-Paste-Jailbreaks | Jailbreak-Attempts, Rate-Abuse |
| **Bug Bounty / White Hat** | Positive Disclosure | Tiefes Web-App-Know-how | Alles, aber kooperativ |
| **Opportunistischer Crimineller** | Monetisierung (Credential-Stuffing, PII-Verkauf) | Botnetze, Credential-Listen | Account-Takeover, Scraping |
| **Gezielter Angreifer (APT-ish)** | Gesundheitsdaten / Profil-Diebstahl | Social Engineering, Zero-Days, Supply Chain | Alles, besonders Supply Chain + Insider |
| **Insider (Mitarbeiter:in)** | Neugier / Vorsatz | Native Zugriff, Rechte-Kenntnis | Missbrauch von Eskalations-Cases, Key-Access |
| **Forschende / Red-Team** | Systematisches Testen | Hoch | Alles — werden bewusst eingeladen |

---

## 5. Top-10 priorisierte Bedrohungen

Sortiert nach `(Wahrscheinlichkeit × Schaden)`.

| # | Bedrohung | Primäre Mitigation | Reference |
|---|---|---|---|
| 1 | Prompt Injection durch Patient | Guardian Input-Classifier, System-Prompt-Isolation, strikte Rollen | TM-ARCH-003, TM-ARCH-011 |
| 2 | Insider-Zugriff auf Eskalations-Klartext | 4-Augen für Klartext-Öffnung, automatisches 7-d-Re-Redact, Read-Logging | TM-ARCH-008 §3.4 |
| 3 | Halluzinierte Medikations-Empfehlung | Grounded Generation, Fact-Check, Denylist-Kategorie „Medikation" | TM-ARCH-003 §1.3, TM-ARCH-010 |
| 4 | PII-Leak in Logs | Redaction-Pipeline vor Persist, Log-Shipping-Filter, Audit | TM-ARCH-008 §4 |
| 5 | Supply-Chain-Angriff auf CI | Ephemere Runner, signed Artefakte, SBOM, Dependency-Pin | TM-ARCH-004 §9 |
| 6 | Falsche KB-Quelle persistiert (Content-Poisoning) | 4-Augen-Review, Quellenpflicht, signierte Snippets | TM-ARCH-004 §3 |
| 7 | Session-Hijack auf Patient-Konto | MFA (opt-in), Token-Rotation, Anomalie-Erkennung | TM-ARCH-002 §3 |
| 8 | Credential-Stuffing gegen Login | Rate-Limit, Account-Lockout, Password-Reuse-Detection | TM-ARCH-002 §3 |
| 9 | Bedrock stiller Modell-Wechsel → Verhaltens-Drift | Version-Pinning + Eval-Gate vor Rollout | TM-ARCH-004 §9 |
| 10 | Missbrauch durch nicht primär gemeinten Angriff (z. B. Minderjährige, Vulnerable Users) | UX-Gates, Altersbestätigung, Red-Flag erweitert | TM-ARCH-006 |

---

## 6. Prüfbedingungen im Red-Team-Harness

Der Red-Team-Harness (TM-ARCH-011) enthält für jede Top-10-Bedrohung mindestens einen Test-Case. Jeder neue Release muss alle Tests bestehen, bevor er in den Canary darf.

Zusätzlich:

- **Fuzzing** auf Guardian-Input (Unicode-Tricks, Zero-Width, RTL-Override)
- **Adversarial KB Queries** — kann ein Angreifer das RAG zu falschen Zitaten bringen?
- **Tenant-Isolation-Tests** — kann eine Nutzerin auf Daten einer anderen zugreifen?
- **Replay-Attacks** auf signierte Artefakte

---

## 7. Incident-Response-Kopplung

- Jeder Incident, der eine Bedrohung aus §5 bestätigt, erzeugt automatisch einen neuen Red-Team-Test-Case (TM-ARCH-011).
- Postmortems (TM-ARCH-014 §5) speisen dieses Dokument in der nächsten Review-Runde.

---

## 8. Offene Punkte

- Threat Model muss noch durch externe Security-Review geprüft werden.
- Formale Bewertung nach OWASP ASVS Level 2 (angestrebt) steht aus.
- Pentest (Web + LLM-spezifisch) vor Pilot-Start eingeplant.
