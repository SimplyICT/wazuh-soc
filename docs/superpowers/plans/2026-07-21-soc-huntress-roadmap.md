# SOC Platform — Huntress-Class Upgrade Roadmap

> Based on Huntress API analysis (live data: 25,819 identity events/mo, 2 EDR agents, 20K SIEM logs/mo, 15 canaries)
> Current platform: SOC (42 agents, React SPA, FastAPI backend, DeepSeek AI triage)

---

## Executive Summary

Our SOC has the right foundation — telemetry, AI triage, EDR actions — but is missing three product pillars that make Huntress dominant:
1. **ITDR** (Identity Threat Detection & Response) — their biggest product, zero coverage
2. **Human SOC layer** — named analysts, monthly reports, curated threat intel
3. **Cross-product correlation** — EDR + ITDR + SIEM in unified incident view

This document maps every capability, current status, build effort, and implementation order.

---

## Phase 0: Foundation Work (2 weeks)

### P0-A: ITDR — Microsoft 365 Connector
**Effort: 2 weeks | Impact: Critical (opens entire product category)**

Integrate Microsoft Graph API to monitor identity signals:

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Microsoft   │     │  Graph API        │     │  SOC Platform  │
│  Entra ID    │────▶│  Poller Service   │────▶│  - Alerts      │
│  (M365)      │     │  (every 5 min)    │     │  - Dashboard   │
│              │     │                   │     │  - Cases       │
│ Sign-in logs │     │  itdr_poller.py   │     │  - Reports     │
│ Audit logs   │     │  + M365 app reg   │     │                │
│ Risk events  │     │  + Graph SDK      │     │  - New ITDR    │
└──────────────┘     └──────────────────┘     │    page        │
                                              └────────────────┘
```

**Data to ingest (6 categories):**

| Data Source | Graph API Endpoint | Detection Value |
|------------|-------------------|-----------------|
| **Sign-in logs** | `GET /auditLogs/signIns` | Impossible travel, anonymous IP, unfamiliar location, MFA failure spikes |
| **Audit logs** | `GET /auditLogs/directoryAudits` | Privileged role assignment, directory changes |
| **Entra ID Risk detections** | `GET /identityProtection/riskDetections` | Leaked credentials, atypical travel, anonymous IP |
| **Mailbox rules** | `GET /users/{id}/mailFolders/inbox/messageRules` | Auto-forwarding to external domains (data exfil) |
| **OAuth apps** | `GET /oauth2PermissionGrants` | Rogue app consent grants |
| **Service principals** | `GET /servicePrincipals` | Risky OAuth app registrations |

**Files to create:**
- `mission-control-ui/itdr_poller.py` — Graph API polling + event parsing
- `mission-control-ui/itdr_detections.py` — Detection rules for identity threats
- `src/pages/Itdr.jsx` — Identity dashboard
- `src/components/ItdrIncidents.jsx` — ITDR-specific case list
- `src/pages/ItdrDetail.jsx` — ITDR incident detail view

**Detection rules to implement (Priority order):**

| Detection | Logic | Severity |
|-----------|-------|----------|
| MFA fatigue attack | >10 MFA deny+approve in 5 min for one user | Critical |
| Impossible travel | Sign-in from geo A → geo B in < travel time | High |
| Mailbox forwarding rule | New rule forwarding to external domain | High |
| Global Admin grant | Non-PIM role activation of GA | Critical |
| Legacy auth usage | Legacy protocol sign-in (IMAP, POP, SMTP) | Medium |
| OAuth app consent | New app with Mail.Read+/User.Read.All scope | High |
| Anonymous IP sign-in | Sign-in from Tor/anonymizer | Medium |
| Password spray | >50 failed logins, <3 failures per user pattern | Critical |
| Inactive account MFA change | MFA disabled on account inactive >90 days | High |
| Risky service principal | App with high privileges, no cert expiry | Medium |

### P0-B: Enhanced Alert Queue & Human SOC Workflow
**Effort: 1 week | Impact: High (enables human-in-the-loop)**

Current: AI triage → case creation with no human review queue.
Need: A proper SOC queue with assignment, status tracking, SLA.

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────┐
│ AI       │───▶│ Review      │───▶│ Assigned to  │───▶│ Resolved │
│ Triage   │    │ Queue       │    │ Analyst      │    │ / Closed │
│          │    │ (new page)  │    │ (claim btn)  │    │          │
│ Auto-    │    │ - Filter    │    │ - Comment    │    │ - Note   │
│ resolve  │    │ - Sort      │    │ - Escalate   │    │ - Time   │
│ (low     │    │ - SLA clock │    │ - Attach     │    │ tracked  │
│ conf)    │    │             │    │   evidence   │    │          │
└──────────┘    └─────────────┘    └──────────────┘    └──────────┘
```

**Components needed:**
- `src/pages/ReviewQueue.jsx` — All alerts needing human review
- `src/components/QueueCard.jsx` — Single alert/case in review queue
- `src/components/ClaimButton.jsx` — Analyst assignment widget
- `src/components/SlaTimer.jsx` — Visual SLA countdown
- `src/components/AnalystNote.jsx` — Note-taking per case
- `Backend`: `/api/queue/*` endpoints (list, claim, resolve, escalate, comment)

**SLA thresholds:**
| Severity | Response SLA | Resolution SLA | Auto-Escalation |
|----------|-------------|---------------|-----------------|
| Critical | 15 min | 1 hour | Escalate to email + phone at 30 min |
| High | 1 hour | 4 hours | Escalate to email at 2 hours |
| Medium | 4 hours | 24 hours | Escalate at 8 hours |
| Low | 24 hours | 72 hours | Escalate at 48 hours |

---

## Phase 1: EDR Enhancements (3 weeks)

### 1-A: Process Ancestry & Deep Investigation
**Effort: 1 week | Impact: High**

Current: `ps aux` flat process list.
Target: Process ancestry tree showing parent→child relationships.

**Backend changes:**
- `edr_actions.py`: Add `list_process_tree()` that runs `ps -eo pid,ppid,cmd,lstart` + builds tree
- `edr_actions.py`: Add `get_process_children(pid)` for drill-down
- Add `/api/edr/agent/{id}/process-tree` endpoint

**Frontend changes:**
- `src/components/ProcessTree.jsx` — Tree visualization (indented list with expand/collapse)
- Replace the flat ProcessTable with ProcessTree as default view
- Add click-to-expand for process children
- Color-code by CPU/MEM, highlight suspicious processes by heuristics

```
PID 1 (init)
 └─ PID 256 (systemd)
     ├─ PID 512 (sshd)
     │   └─ PID 2048 (sshd: aiagent)
     │       └─ PID 2049 (bash)
     │           ├─ PID 3000 (ps aux) ← current command
     │           └─ PID 3100 (python3 evil.py) ← HIGHLIGHTED RED
     └─ PID 768 (wazuh-agent)
```

### 1-B: Persistence Mechanism Detection
**Effort: 1 week | Impact: High**

Current: No persistence monitoring.
Target: Detect and list all persistence mechanisms on the endpoint.

**Backend:**
- `edr_actions.py`: Add `list_persistence()` that checks:
  - **Linux**: cron jobs (`crontab -l`, `/etc/cron*`), systemd services, .bashrc/.profile, SSH authorized_keys, at jobs
  - **Windows**: Run keys (HKLM\Software\Microsoft\Windows\CurrentVersion\Run), Startup folder, Scheduled Tasks, Services, WMI persistence
- `/api/edr/agent/{id}/persistence` endpoint

**Frontend:**
- `src/components/PersistenceTable.jsx` — Persistence points with risk scoring
- Add "Persistence" tab to AgentDetail EDR panel

### 1-C: Network Connection Enhancement
**Effort: 2 days | Impact: Medium**

Current: `ss -tunap` output parsed.
Target: Enriched connections with geolocation, risk scoring, threat intel.

- Add GeoIP lookup for external IPs (using local GeoLite2 DB or API)
- Add threat intel check: cross-reference external IPs against OTX/blocklists
- Flag connections to known-bad ports (e.g., non-standard RDP, mining pools, C2)
- `src/components/NetworkMap.jsx` — Simple external connection geo-map

### 1-D: File Reputation Check
**Effort: 2 days | Impact: Medium**

Current: No file reputation.
Target: Hash-based lookup against external threat intel.

- Add `file_reputation(filepath)` to `edr_actions.py`:
  1. Compute SHA256 of file via SSH
  2. Check against local cache
  3. Query OTX API for hash reputation
  4. Cache results for 24h
- Highlight known-bad hashes red, unknown grey, known-good green
- `/api/edr/agent/{id}/file-reputation` endpoint

---

## Phase 2: SIEM Enhancement (2 weeks)

### 2-A: Multi-Source Log Ingestion
**Effort: 1 week | Impact: High**

Current: Only Wazuh agent logs.
Target: Log forwarding from firewalls, cloud services, on-prem servers.

**Backend:**
- `siem_ingest.py` — HTTP/Syslog endpoint for log forwarding
- Support: Syslog (RFC 5424), HTTP JSON POST, CloudWatch polling
- Normalize all logs into unified event format
- `/api/siem/ingest` — syslog-compatible endpoint
- `/api/v1/siem/events` — REST ingest for agents/scripts

```
┌──────────┐     ┌───────────────┐     ┌────────────┐
│ Firewall │────▶│ Port 514      │────▶│ Parse      │
│ (syslog) │     │ (syslog)      │     │ Normalize  │
├──────────┤     ├───────────────┤     ├────────────┤
│ Cloud    │────▶│ /api/siem/    │────▶│ Enrich     │
│ (webhook)│     │ ingest        │     │ (GeoIP,    │
├──────────┤     ├───────────────┤     │  TI)       │
│ Windows  │────▶│ Winlogbeat    │────▶│            │
│ Server   │     │ → syslog      │     ├────────────┤
└──────────┘     └───────────────┘     │ Store      │
                                       │ (Supabase  │
                                       │  pg)       │
                                       └────────────┘
```

### 2-B: Correlation Engine
**Effort: 1 week | Impact: High**

Current: Rule-based Wazuh alerts + AI triage.
Target: Cross-source correlation rules.

- `siem_correlate.py` — Rule + ML-based correlation engine
- Rules:
  - **Brute force across sources**: Failed logins from same IP across firewall + Windows + M365
  - **Post-exploitation chain**: Process create → network connect → persistence install
  - **Geo anomaly**: Sign-in from Russia + VPN disconnect + local admin create
- Time-window correlation (e.g., 5min sliding window)
- `/api/siem/correlations` — list active correlations

---

## Phase 3: Reporting & Compliance (2 weeks)

### 3-A: Automated SOC Reports
**Effort: 1 week | Impact: Medium**

Current: No reporting.
Target: Huntress-comparable monthly PDF reports.

- `report_generator.py` — PDF report generation via ReportLab / WeasyPrint
- Report sections:
  1. Executive summary (AI-written, post-edited by human)
  2. Threat landscape (global + org-specific)
  3. EDR findings (malware, persistence, firewall issues)
  4. ITDR findings (identity threats, MFA issues, risky apps)
  5. SIEM summary (log volume, correlation hits)
  6. Remediation recommendations (actionable, prioritized)
  7. Trend comparison (month-over-month)
- `/api/reports/generate` — endpoint
- `/api/reports/{id}/pdf` — download
- Schedule: auto-generate on 1st of each month
- Frontend: `src/pages/Reports.jsx` — report archive + download

### 3-B: Compliance Module
**Effort: 1 week | Impact: Medium**

Current: No compliance mapping.
Target: Map findings to regulatory frameworks.

- Audit log of all SOC actions (we have partial in `edr_audit.json`)
- Compliance mapping:
  - **PCI-DSS v4.0**: Requirement 10 (log audits), 11 (pen testing), 12 (policy)
  - **HIPAA**: 45 CFR §164.312 (access control, audit controls)
  - **SOC 2**: CC6 (logical access), CC7 (monitoring)
- `src/pages/Compliance.jsx` — compliance dashboard with pass/fail per requirement
- `/api/compliance/overview` — compliance scorecard
- `/api/compliance/report` — framework-specific report

---

## Phase 4: Platform Infrastructure (3 weeks)

### 4-A: Multi-Tenant Architecture
**Effort: 2 weeks | Impact: High (enables MSP model)**

Current: Single-organization.
Target: Multi-tenant with org isolation.

- **Database**: Add `organization_id` to all tables (cases, audit log, alerts)
- **Backend**: Tenant middleware — inject org_id from auth context on every request
- **API**: `/api/v1/org/{org_id}/...` namespace
- **Frontend**: Org switcher in sidebar, filtered data per org
- **Auth**: JWT with org_id claim, per-org API keys
- Supabase RLS policies for row-level security

**Schema impact:**
```sql
ALTER TABLE soc_cases ADD COLUMN organization_id UUID REFERENCES orgs(id);
ALTER TABLE audit_log ADD COLUMN organization_id UUID REFERENCES orgs(id);
-- All existing data gets org_id = default_org
```

### 4-B: RBAC (Role-Based Access Control)
**Effort: 3 days | Impact: Medium**

| Role | Permissions | 
|------|------------|
| **SOC Admin** | Full access, user management, playbook editing |
| **SOC Analyst** | View + triage + respond, cannot delete/modify rules |
| **SOC Viewer** | Read-only dashboard + reports |
| **Client Admin** | View own org data, manage own agents |
| **Client Viewer** | Read-only own org |

### 4-C: Webhook / Integration API
**Effort: 2 days | Impact: Medium**

- `/api/v1/webhooks` — Register webhooks for events (case_created, critical_alert, isolation)
- PSA/RMM integration endpoints (ConnectWise, Datto, Kaseya format)
- Slack / Teams / Discord notification channels (beyond Telegram)

### 4-D: Onboarding Wizard
**Effort: 2 days | Impact: Medium**

Current: Manual config.
Target: Step-by-step onboarding for new clients/orgs.

1. Create organization
2. Generate deploy token
3. Show agent install command (Windows + Linux + macOS via Wazuh)
4. Quick ITDR setup (M365 consent URL)
5. SIEM log source config (syslog endpoint + port)
6. Validate connectivity (agent callback check)
7. First report scheduling

---

## Phase 5: Deception & Canary (1 week)

### 5-A: Canary Token Deployment
**Effort: 1 week | Impact: Medium**

Current: No deception technology.
Target: Deploy canary tokens across the environment.

- Canary token types:
  - **DNS canary**: Trigger on DNS resolution of unique subdomain
  - **Web canary**: HTTP endpoint that alerts on any access
  - **File canary**: Network share file that alerts on read
  - **Credential canary**: Fake credentials that alert on use
  - **API key canary**: Fake API key that alerts on usage
- `deception/canary_server.py` — Simple Flask-based canary server
- Canary management dashboard: `src/pages/Canaries.jsx`
- Deploy via EDR agent: `edr_actions.py: deploy_canary(type, target)`

---

## Effort Summary

| Phase | Weeks | Files Created | Impact |
|-------|-------|-------------|--------|
| **P0-A: ITDR Connector** | 2 | 6+ | **Critical** — opens product category |
| **P0-B: Human SOC Queue** | 1 | 6+ | **High** — enables human-in-the-loop |
| **P1-A: Process Tree** | 1 | 2 | High |
| **P1-B: Persistence Detection** | 1 | 2 | High |
| **P1-C: Network Enrichment** | 0.4 | 1 | Medium |
| **P1-D: File Reputation** | 0.4 | 1 | Medium |
| **P2-A: Multi-Source SIEM** | 1 | 3 | High |
| **P2-B: Correlation Engine** | 1 | 2 | High |
| **P3-A: SOC Reports** | 1 | 3 | Medium |
| **P3-B: Compliance Module** | 1 | 3 | Medium |
| **P4-A: Multi-Tenant** | 2 | 8+ | High |
| **P4-B: RBAC** | 0.6 | 3 | Medium |
| **P4-C: Webhooks** | 0.4 | 2 | Medium |
| **P4-D: Onboarding Wizard** | 0.4 | 3 | Medium |
| **P5-A: Canary Tokens** | 1 | 4 | Medium |
| **Total** | **~14 weeks** | **~50 files** | |

---

## Recommended Build Order

```
Week 1-2:   P0-A ITDR Connector ← START HERE (identity #1 attack vector)
Week 2-3:   P0-B Human SOC Queue (need this before you can sell "managed" anything)
Week 3-4:   P1-A Process Tree + P1-B Persistence Detection
Week 4-5:   P2-A Multi-Source SIEM (start simple: syslog listener)
Week 5-6:   P2-B Correlation Engine + P1-C/D EDR enhancements
Week 6-7:   P3-A SOC Reports + P3-B Compliance Module
Week 7-9:   P4-A Multi-Tenant (biggest effort, enables MSP growth)
Week 9-10:  P4-B RBAC + P4-C Webhooks + P4-D Onboarding
Week 10-11: P5-A Canary Tokens
Week 11-12: Polish, performance, bug fixes
Week 12-14: Beta testing with real client
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| M365 API rate limits | Medium | Cache responses, distribute polling, use delta queries |
| ITDR detection false positives | High | Start with conservative thresholds, tune over 30 days |
| EDR agent compatibility (non-Linux) | High | Build for Linux first, use Wazuh data for Windows |
| Multi-tenant migration from single-org | Low | All new data gets org_id; backfill existing with default |
| SIEM log volume costs | Medium | Set ingestion caps, compress old data, tiered storage |
