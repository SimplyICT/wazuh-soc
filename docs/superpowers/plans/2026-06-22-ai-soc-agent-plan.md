# AI SOC Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rule-based SOC Autopilot with an LLM-driven triage engine that auto-resolves low/medium alerts, intelligently triages high/critical alerts, and escalates only when confidence is low.

**Architecture:** Three new Python modules (`ai_triage.py`, `ai_resolver.py`, `ai_digest.py`) sit between the existing scan cycle and Supabase. The existing `app.py` autopilot endpoints are rewritten to use these modules. Cases migrate from flat JSON to Supabase. Alerts flow: Wazuh → Supabase → AI triage → auto-resolve or case creation.

**Tech Stack:** Python 3, Ollama + llama3.2:3b, Supabase (existing), FastAPI (existing)

---

### Task 1: Install Ollama and pull model

**Files:**
- None (infrastructure)

- [ ] **Step 1: Install Ollama**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

- [ ] **Step 2: Verify installation**

```bash
ollama --version
```

Expected output: `ollama version [0.x.x]`

- [ ] **Step 3: Pull lightweight model**

```bash
ollama pull llama3.2:3b
```

This downloads ~2GB. May take a few minutes.

- [ ] **Step 4: Verify model works**

```bash
ollama run llama3.2:3b "Say hello in one word"
```

Expected output: `Hello`

- [ ] **Step 5: Test HTTP API**

```bash
curl http://localhost:11434/api/generate -d '{"model":"llama3.2:3b","prompt":"Say hello","stream":false}'
```

Expected: JSON response with `"response":"Hello"`

---

### Task 2: Create Supabase tables for SOC cases and audit log

**Files:**
- Execute: SQL against Supabase

- [ ] **Step 1: Create soc_cases table**

Run this SQL in the Supabase SQL editor (or via `psql` if direct access):

```sql
CREATE TABLE IF NOT EXISTS soc_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  alert_ids JSONB DEFAULT '[]',
  ai_analysis TEXT,
  confidence REAL,
  mitre_technique TEXT,
  response_plan JSONB DEFAULT '[]',
  entities JSONB DEFAULT '[]',
  events JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soc_cases_status ON soc_cases(status);
CREATE INDEX IF NOT EXISTS idx_soc_cases_severity ON soc_cases(severity);
CREATE INDEX IF NOT EXISTS idx_soc_cases_created ON soc_cases(created_at DESC);
```

- [ ] **Step 2: Create soc_audit_log table**

```sql
CREATE TABLE IF NOT EXISTS soc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  alert_title TEXT,
  alert_level INTEGER,
  action TEXT NOT NULL,
  confidence REAL,
  analysis TEXT,
  ai_model TEXT DEFAULT 'llama3.2:3b',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON soc_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON soc_audit_log(action);
```

- [ ] **Step 3: Verify tables exist**

```bash
psql "$SUPABASE_DB_URL" -c "\dt soc_*"
```

Expected: both `soc_cases` and `soc_audit_log` listed.

---

### Task 3: Build ai_triage.py — alert analysis via local LLM

**Files:**
- Create: `/home/aiagent/mission-control-ui/ai_triage.py`
- Test: `/home/aiagent/mission-control-ui/tests/test_ai_triage.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ai_triage.py
import json
import pytest
from ai_triage import triage_alert, _parse_response

SAMPLE_ALERT = {
    "id": "alert-001",
    "level": 12,
    "title": "Multiple failed login attempts",
    "description": "User admin failed to log in 15 times from IP 10.0.0.50",
    "source": "Windows-SRV-01",
    "rule_id": 5710,
    "similar_count_24h": 3
}

def test_parse_response_valid():
    raw = json.dumps({
        "analysis": "Login failures suggest brute force attack",
        "confidence": 0.85,
        "recommended_action": "escalate",
        "mitre_technique": "T1110",
        "response_plan": ["Block source IP", "Notify user", "Review auth logs"],
        "false_positive_likelihood": "low"
    })
    result = _parse_response(raw)
    assert result["confidence"] == 0.85
    assert result["recommended_action"] == "escalate"
    assert result["mitre_technique"] == "T1110"

def test_parse_response_missing_field():
    raw = json.dumps({"analysis": "test"})
    result = _parse_response(raw)
    assert result["confidence"] == 0.5  # default
    assert result["recommended_action"] == "escalate"  # default
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/aiagent/mission-control-ui && python3 -m pytest tests/test_ai_triage.py -v 2>&1
```

Expected: `ModuleNotFoundError: No module named 'ai_triage'`

- [ ] **Step 3: Write ai_triage.py**

```python
"""AI-powered alert triage using local Ollama LLM."""
import json
import logging
import os
import requests

logger = logging.getLogger("ai_triage")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

DEFAULT_RESPONSE = {
    "analysis": "Unable to analyze alert automatically.",
    "confidence": 0.5,
    "recommended_action": "escalate",
    "mitre_technique": "",
    "response_plan": ["Review alert manually"],
    "false_positive_likelihood": "unknown"
}

ALERT_TRIAGE_PROMPT = """You are a SOC triage analyst. Analyze this security alert and return ONLY valid JSON.

Alert:
- ID: {id}
- Level: {level} (0-15, higher = more severe)
- Title: {title}
- Description: {description}
- Source: {source}
- Rule ID: {rule_id}
- Similar alerts in 24h: {similar_count}

Return JSON with these fields:
- "analysis": brief 2-3 sentence analysis
- "confidence": 0.0 to 1.0 (how confident you are in your assessment)
- "recommended_action": "resolve" or "escalate"
- "mitre_technique": MITRE ATT&CK technique ID if applicable, or empty string
- "response_plan": list of recommended action strings (2-4 items)
- "false_positive_likelihood": "low", "medium", or "high"

JSON:"""


def _call_llm(prompt: str) -> str:
    """Send prompt to Ollama and return raw response text."""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("response", "")
    except Exception as e:
        logger.error("LLM call failed: %s", e)
        return ""


def _parse_response(raw: str) -> dict:
    """Parse LLM JSON response with fallback defaults."""
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            cleaned = cleaned.rsplit("```", 1)[0]
        data = json.loads(cleaned)
        return {
            "analysis": data.get("analysis", DEFAULT_RESPONSE["analysis"]),
            "confidence": float(data.get("confidence", DEFAULT_RESPONSE["confidence"])),
            "recommended_action": data.get("recommended_action", DEFAULT_RESPONSE["recommended_action"]),
            "mitre_technique": data.get("mitre_technique", DEFAULT_RESPONSE["mitre_technique"]),
            "response_plan": data.get("response_plan", DEFAULT_RESPONSE["response_plan"]),
            "false_positive_likelihood": data.get("false_positive_likelihood", DEFAULT_RESPONSE["false_positive_likelihood"]),
        }
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        logger.warning("Failed to parse LLM response: %s — raw: %s", e, raw[:200])
        return dict(DEFAULT_RESPONSE)


def triage_alert(alert: dict) -> dict:
    """Analyze a single alert and return triage decision."""
    prompt = ALERT_TRIAGE_PROMPT.format(**alert)
    raw = _call_llm(prompt)
    if not raw:
        return dict(DEFAULT_RESPONSE)
    return _parse_response(raw)


def triage_batch(alerts: list[dict]) -> list[dict]:
    """Triage multiple alerts, returning a result per alert."""
    return [triage_alert(a) for a in alerts]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/aiagent/mission-control-ui && python3 -m pytest tests/test_ai_triage.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add ai_triage.py tests/test_ai_triage.py && git commit -m "feat: add ai_triage module for LLM-based alert analysis"
```

---

### Task 4: Build ai_resolver.py — auto-resolution + case creation

**Files:**
- Create: `/home/aiagent/mission-control-ui/ai_resolver.py`
- Test: `/home/aiagent/mission-control-ui/tests/test_ai_resolver.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ai_resolver.py
import pytest
from unittest.mock import patch, MagicMock
from ai_resolver import auto_resolve, create_case

SAMPLE_ALERT = {"id": "alert-001", "level": 10, "title": "Test alert"}
SAMPLE_ANALYSIS = {
    "analysis": "False positive - known behaviour",
    "confidence": 0.95,
    "recommended_action": "resolve",
    "mitre_technique": "",
    "response_plan": [],
    "false_positive_likelihood": "high"
}

@patch("ai_resolver.SUPABASE")
def test_auto_resolve_logs_action(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
    result = auto_resolve(SAMPLE_ALERT, SAMPLE_ANALYSIS)
    assert result is True
    assert mock_supabase.table.called

@patch("ai_resolver.SUPABASE")
def test_create_case_stores_case(mock_supabase):
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()
    result = create_case([SAMPLE_ALERT], SAMPLE_ANALYSIS)
    assert result is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/aiagent/mission-control-ui && python3 -m pytest tests/test_ai_resolver.py -v
```

Expected: `ModuleNotFoundError`

- [ ] **Step 3: Write ai_resolver.py**

```python
"""Auto-resolution and case creation for AI-triaged alerts."""
import json
import logging
import os
from datetime import datetime, timezone
from postgrest.exceptions import APIError
from supabase import create_client

logger = logging.getLogger("ai_resolver")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

SUPABASE = None
if SUPABASE_URL and SUPABASE_KEY:
    SUPABASE = create_client(SUPABASE_URL, SUPABASE_KEY)


def _get_supabase():
    """Lazy-init Supabase client."""
    global SUPABASE
    if SUPABASE is None and SUPABASE_URL and SUPABASE_KEY:
        SUPABASE = create_client(SUPABASE_URL, SUPABASE_KEY)
    return SUPABASE


def _log_action(alert_id: str, alert_title: str, alert_level: int,
                action: str, confidence: float, analysis: str):
    """Write an entry to the soc_audit_log table."""
    sb = _get_supabase()
    if not sb:
        logger.warning("Supabase not configured, skipping audit log")
        return False
    try:
        sb.table("soc_audit_log").insert({
            "alert_id": alert_id,
            "alert_title": alert_title,
            "alert_level": alert_level,
            "action": action,
            "confidence": confidence,
            "analysis": analysis,
            "ai_model": "llama3.2:3b",
        }).execute()
        return True
    except APIError as e:
        logger.error("Failed to write audit log: %s", e)
        return False


def auto_resolve(alert: dict, analysis: dict) -> bool:
    """Auto-resolve an alert after AI analysis.

    Logs the action to soc_audit_log and updates the alert status
    via the internal API at port 8000.
    """
    alert_id = alert.get("id", "")
    alert_title = alert.get("title", "")
    alert_level = alert.get("level", 0)
    confidence = analysis.get("confidence", 0.5)
    analysis_text = analysis.get("analysis", "")

    # Log to audit
    _log_action(alert_id, alert_title, alert_level,
                "auto_resolve", confidence, analysis_text)

    # Call internal API to resolve the alert
    try:
        import requests
        resp = requests.post(
            f"http://127.0.0.1:8000/api/v1/alerts/{alert_id}/resolve",
            timeout=10,
            json={"reason": f"AI auto-resolved (confidence: {confidence:.2f}): {analysis_text}"}
        )
        if resp.ok:
            logger.info("Auto-resolved alert %s (confidence=%.2f)", alert_id, confidence)
            return True
        logger.warning("Failed to resolve alert %s: HTTP %d", alert_id, resp.status_code)
        return False
    except Exception as e:
        logger.error("Error resolving alert %s: %s", alert_id, e)
        return False


def create_case(alerts: list[dict], analysis: dict) -> str | None:
    """Create a SOC case in Supabase from AI-analyzed alerts.

    Returns the case ID if successful, None otherwise.
    """
    sb = _get_supabase()
    if not sb:
        logger.warning("Supabase not configured, cannot create case")
        return None

    severity_labels = {15: "critical", 14: "high", 13: "high", 12: "high",
                       11: "medium", 10: "medium", 9: "medium", 8: "medium",
                       7: "medium", 6: "low", 5: "low", 4: "low",
                       3: "low", 2: "low", 1: "low", 0: "low"}
    max_level = max((a.get("level", 0) for a in alerts), default=0)
    severity = severity_labels.get(max_level, "low")

    max_title = max((a.get("title", "") for a in alerts), key=len)
    title = max_title or f"Multiple alerts ({severity})"

    alert_ids = [a.get("id", "") for a in alerts if a.get("id")]
    now = datetime.now(timezone.utc).isoformat()

    case_data = {
        "title": title,
        "severity": severity,
        "status": "awaiting_approval",
        "alert_ids": json.dumps(alert_ids),
        "ai_analysis": analysis.get("analysis", ""),
        "confidence": analysis.get("confidence", 0.5),
        "mitre_technique": analysis.get("mitre_technique", ""),
        "response_plan": json.dumps(analysis.get("response_plan", [])),
        "entities": json.dumps([{"source": a.get("source", "")} for a in alerts if a.get("source")]),
        "events": json.dumps([{"type": "created", "timestamp": now, "detail": "Case created by AI triage"}]),
    }

    try:
        resp = sb.table("soc_cases").insert(case_data).execute()
        if resp.data:
            case_id = resp.data[0].get("id", "")
            logger.info("Created case %s for %d alerts (confidence=%.2f)",
                        case_id, len(alerts), analysis.get("confidence", 0.5))
            for a in alerts:
                _log_action(a.get("id", ""), a.get("title", ""), a.get("level", 0),
                            "case_created", analysis.get("confidence", 0.5),
                            analysis.get("analysis", ""))
            return case_id
        return None
    except APIError as e:
        logger.error("Failed to create case: %s", e)
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/aiagent/mission-control-ui && python3 -m pytest tests/test_ai_resolver.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add ai_resolver.py tests/test_ai_resolver.py && git commit -m "feat: add ai_resolver for auto-resolution and case creation"
```

---

### Task 5: Rewrite autopilot scan engine in app.py to use AI triage

**Files:**
- Modify: `/home/aiagent/mission-control-ui/app.py`

- [ ] **Step 1: Add imports for new modules**

Replace the existing autopilot section import block:

```python
# Near top of app.py, after existing imports
from ai_triage import triage_alert
from ai_resolver import auto_resolve, create_case
import json
```

- [ ] **Step 2: Replace _generate_autopilot_case with AI version**

Remove the existing `_generate_autopilot_case` function (around line 1135) and replace:

```python
async def _ai_generate_cases(alerts_grouped: dict):
    """AI-powered case generation from grouped alerts."""
    new_cases = 0
    auto_resolved = 0

    for site_key, site_alerts in alerts_grouped.items():
        if not site_alerts:
            continue

        for alert in site_alerts:
            level = alert.get("level", 0)
            analysis = triage_alert(alert)
            confidence = analysis.get("confidence", 0.5)
            recommended_action = analysis.get("recommended_action", "escalate")

            should_auto = (
                recommended_action == "resolve"
                and confidence >= 0.9
            )

            if should_auto:
                ok = auto_resolve(alert, analysis)
                if ok:
                    auto_resolved += 1
            else:
                # Create a case for human approval
                cid = create_case([alert], analysis)
                if cid:
                    new_cases += 1

    return {"new_cases": new_cases, "auto_resolved": auto_resolved}
```

- [ ] **Step 3: Replace autopilot_scan_and_generate with AI version**

Update the existing `autopilot_scan_and_generate` function (around line 1080):

```python
async def autopilot_scan_and_generate():
    """AI-powered scan cycle — fetches alerts and triages them."""
    logger.info("AI Autopilot scan starting...")
    try:
        alerts = await _fetch_open_alerts()
        if not alerts:
            logger.info("No open alerts to process")
            return {"new_cases": 0, "auto_resolved": 0}

        # Deduplicate against already-processed alerts
        processed_ids = set()
        sb = _get_supabase()
        if sb:
            try:
                resp = sb.table("soc_audit_log").select("alert_id").execute()
                processed_ids = {r["alert_id"] for r in (resp.data or []) if r.get("alert_id")}
            except Exception:
                pass

        new_alerts = [a for a in alerts if a.get("id") not in processed_ids]
        if not new_alerts:
            logger.info("No new alerts to process")
            return {"new_cases": 0, "auto_resolved": 0}

        logger.info("Processing %d new alerts", len(new_alerts))

        # Group by source for context
        grouped = {}
        for a in new_alerts:
            source = a.get("source", a.get("agent_name", "unknown"))
            grouped.setdefault(source, []).append(a)

        result = await _ai_generate_cases(grouped)
        logger.info("AI Autopilot scan complete: %d cases created, %d auto-resolved",
                    result["new_cases"], result["auto_resolved"])
        return result

    except Exception as e:
        logger.error("AI Autopilot scan failed: %s", e)
        return {"new_cases": 0, "auto_resolved": 0, "error": str(e)}
```

- [ ] **Step 4: Add helper to fetch open alerts**

Add this function before `autopilot_scan_and_generate`:

```python
async def _fetch_open_alerts() -> list[dict]:
    """Fetch open/acknowledged alerts from the internal API."""
    try:
        resp = requests.get(
            "http://127.0.0.1:8000/api/v1/alerts",
            params={"status": "OPEN,ACKNOWLEDGED", "limit": 200},
            timeout=30,
        )
        if resp.ok:
            data = resp.json()
            return data.get("data", data.get("alerts", []))
        return []
    except Exception as e:
        logger.error("Failed to fetch open alerts: %s", e)
        return []
```

- [ ] **Step 5: Remove old JSON case storage references**

Find and remove these lines (around the old `autopilot_cases.json` logic):
- `CASES_FILE = BASE_DIR / "autopilot_cases.json"`
- Any JSON file read/write for cases
- Old `_generate_autopilot_case` function body
- Old autopilot CRUD endpoints that read/write the JSON file

For the existing autopilot CRUD endpoints (`/wazuh-api/autopilot/cases`, etc.), update them to query Supabase:

```python
# Near line 966, replace the old case listing
@app.get("/wazuh-api/autopilot/cases")
def autopilot_list_cases():
    sb = _get_supabase()
    if not sb:
        return JSONResponse({"affected_items": []})
    try:
        resp = sb.table("soc_cases").select("*").order("created_at", desc=True).execute()
        return {"affected_items": resp.data or []}
    except Exception as e:
        logger.error("Failed to list cases: %s", e)
        return JSONResponse({"affected_items": []})
```

```python
# Replace the old case detail endpoint (around line 982)
@app.get("/wazuh-api/autopilot/cases/{case_id}")
def autopilot_get_case(case_id: str):
    sb = _get_supabase()
    if not sb:
        return JSONResponse({"error": "no db"}, status_code=503)
    try:
        resp = sb.table("soc_cases").select("*").eq("id", case_id).execute()
        if resp.data:
            return resp.data[0]
        return JSONResponse({"error": "not found"}, status_code=404)
    except Exception as e:
        logger.error("Failed to get case: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)
```

- [ ] **Step 6: Update approve/reject/execute endpoints for Supabase**

```python
@app.post("/wazuh-api/autopilot/cases/{case_id}/approve")
def autopilot_approve_case(case_id: str):
    sb = _get_supabase()
    if not sb:
        return JSONResponse({"error": "no db"}, status_code=503)
    try:
        now = datetime.now(timezone.utc).isoformat()
        resp = sb.table("soc_cases").update({
            "status": "approved",
            "updated_at": now,
            "events": sb.raw("events || '[{\"type\":\"approved\",\"timestamp\":\"' || now || '\"}]'::jsonb")
        }).eq("id", case_id).execute()
        return resp.data[0] if resp.data else JSONResponse({"error": "not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/wazuh-api/autopilot/cases/{case_id}/reject")
def autopilot_reject_case(case_id: str):
    sb = _get_supabase()
    if not sb:
        return JSONResponse({"error": "no db"}, status_code=503)
    try:
        now = datetime.now(timezone.utc).isoformat()
        resp = sb.table("soc_cases").update({
            "status": "rejected",
            "updated_at": now
        }).eq("id", case_id).execute()
        return resp.data[0] if resp.data else JSONResponse({"error": "not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/wazuh-api/autopilot/cases/{case_id}/execute")
def autopilot_execute_case(case_id: str):
    sb = _get_supabase()
    if not sb:
        return JSONResponse({"error": "no db"}, status_code=503)
    try:
        now = datetime.now(timezone.utc).isoformat()
        resp = sb.table("soc_cases").update({
            "status": "in_progress",
            "updated_at": now
        }).eq("id", case_id).eq("status", "approved").execute()
        if resp.data:
            # Log execution event
            sb.table("soc_audit_log").insert({
                "alert_id": case_id,
                "alert_title": f"Case {case_id} execution",
                "alert_level": 0,
                "action": "case_executed",
                "confidence": 1.0,
                "analysis": "Human approved and executed case response plan"
            }).execute()
            return {"status": "executed", "case_id": case_id}
        return JSONResponse({"error": "case not found or not approved"}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
```

- [ ] **Step 7: Update stats endpoint for Supabase**

```python
@app.get("/wazuh-api/autopilot/stats")
def autopilot_stats():
    sb = _get_supabase()
    if not sb:
        return {"last_24h": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "resolved": 0}
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        resp = sb.table("soc_cases").select("severity,status").gte("created_at", cutoff).execute()
        cases = resp.data or []
        stats = {"last_24h": len(cases), "critical": 0, "high": 0, "medium": 0, "low": 0, "resolved": 0}
        for c in cases:
            sev = c.get("severity", "").lower()
            if sev in stats:
                stats[sev] += 1
            if c.get("status") in ("resolved", "closed"):
                stats["resolved"] += 1
        return stats
    except Exception:
        return {"last_24h": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "resolved": 0}
```

- [ ] **Step 8: Add _get_supabase helper near the top of the autopilot section**

```python
def _get_supabase():
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    if url and key:
        return create_client(url, key)
    return None
```

- [ ] **Step 9: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add app.py && git commit -m "feat: rewrite autopilot engine with AI triage, migrate to Supabase"
```

---

### Task 6: Build ai_digest.py — daily summary generator

**Files:**
- Create: `/home/aiagent/mission-control-ui/ai_digest.py`
- Test: `/home/aiagent/mission-control-ui/tests/test_ai_digest.py`

- [ ] **Step 1: Write ai_digest.py**

```python
"""Daily SOC digest generator — summarizes AI actions and alert trends."""
import json
import logging
import os
from datetime import datetime, timezone, timedelta

from ai_triage import _call_llm

logger = logging.getLogger("ai_digest")

DIGEST_PROMPT = """You are a SOC shift lead writing a daily digest. Based on the following data from the last 24 hours, write a concise 3-5 sentence summary for the SOC team.

Total alerts processed: {total_alerts}
Auto-resolved: {auto_resolved}
Cases created: {cases_created}
Cases awaiting approval: {awaiting_approval}
Most common alert level: {most_common_level}

Alert breakdown by level:
{alert_breakdown}

Write a professional, actionable summary:"""


def _get_supabase():
    from supabase import create_client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "")
    if url and key:
        return create_client(url, key)
    return None


def _fetch_24h_stats() -> dict:
    """Query Supabase audit log for the past 24 hours."""
    sb = _get_supabase()
    if not sb:
        return {}

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    try:
        audit_resp = sb.table("soc_audit_log").select("*").gte("created_at", cutoff).execute()
        entries = audit_resp.data or []

        total = len(entries)
        auto_resolved = sum(1 for e in entries if e.get("action") == "auto_resolve")
        cases_created = sum(1 for e in entries if e.get("action") == "case_created")

        levels = [e.get("alert_level", 0) for e in entries if e.get("alert_level") is not None]
        level_counts = {}
        for lv in levels:
            label = "critical" if lv >= 15 else "high" if lv >= 12 else "medium" if lv >= 7 else "low"
            level_counts[label] = level_counts.get(label, 0) + 1

        most_common = max(level_counts, key=level_counts.get) if level_counts else "none"
        alert_breakdown = "\n".join(f"- {k}: {v}" for k, v in sorted(level_counts.items()))

        cases_resp = sb.table("soc_cases").select("status").execute()
        cases = cases_resp.data or []
        awaiting = sum(1 for c in cases if c.get("status") == "awaiting_approval")

        return {
            "total_alerts": total,
            "auto_resolved": auto_resolved,
            "cases_created": cases_created,
            "awaiting_approval": awaiting,
            "most_common_level": most_common,
            "alert_breakdown": alert_breakdown or "No alerts in this period",
        }
    except Exception as e:
        logger.error("Failed to fetch digest data: %s", e)
        return {}


def generate_digest() -> str:
    """Generate a daily SOC digest text using the LLM."""
    stats = _fetch_24h_stats()
    if not stats:
        return "No data available for digest generation."

    prompt = DIGEST_PROMPT.format(**stats)
    raw = _call_llm(prompt)
    if raw:
        return raw.strip()
    return "Digest generation failed."
```

- [ ] **Step 2: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add ai_digest.py && git commit -m "feat: add ai_digest module for daily SOC summaries"
```

---

### Task 7: Update soc_agent.py to use AI digest

**Files:**
- Modify: `/home/aiagent/mission-control-ui/soc_agent.py`

- [ ] **Step 1: Add AI digest to the digest scheduler**

Find the existing digest scheduler section and update:

```python
# Inside the digest scheduler callback, replace the old summary logic with:
def _send_ai_digest():
    """Generate and send AI-powered daily digest."""
    try:
        from ai_digest import generate_digest
        digest = generate_digest()
        if digest:
            _send_telegram(digest)
            logger.info("AI digest sent")
    except Exception as e:
        logger.error("Failed to send AI digest: %s", e)

# Then replace the old digest scheduling callback reference
# From: _send_telegram(...) with old summary
# To:   _send_ai_digest()
```

- [ ] **Step 2: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add soc_agent.py && git commit -m "feat: integrate AI digest into SOC agent scheduler"
```

---

### Task 8: Update React frontend to show AI analysis

**Files:**
- Modify: `/home/aiagent/wazuh-soc/src/pages/AutopilotCase.jsx`

- [ ] **Step 1: Add AI analysis section to case detail**

Add a confidence badge component and AI analysis card to the case detail view:

```jsx
// Inside AutopilotCase.jsx, after the detail-header section, add:

function ConfidenceBadge({ confidence }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red';
  return <span className={`badge badge-${color}`}>{pct}% confidence</span>;
}

// In the render, after the <div className="detail-header"> section:
{
  c.ai_analysis && (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">AI Analysis</div>
        <ConfidenceBadge confidence={c.confidence} />
      </div>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 13 }}>
        {c.ai_analysis}
      </p>
      {c.mitre_technique && (
        <div style={{ marginTop: 8 }}>
          <span className="badge badge-accent">MITRE: {c.mitre_technique}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build and deploy**

```bash
cd /home/aiagent/wazuh-soc && bun run build
```

- [ ] **Step 3: Commit**

```bash
cd /home/aiagent/wazuh-soc && git add src/pages/AutopilotCase.jsx && git commit -m "feat: add AI analysis display to case detail page"
```

---

### Task 9: Restart backend and verify

**Files:**
- None (deployment)

- [ ] **Step 1: Restart the systemd service**

```bash
sudo systemctl restart mission-control-ui
```

- [ ] **Step 2: Verify endpoints respond**

```bash
# Login
curl -s -c /tmp/test_cookies.txt -X POST -d "username=admin&password=admin123" http://127.0.0.1:8095/login

# Test autopilot stats
curl -s -b /tmp/test_cookies.txt http://127.0.0.1:8095/wazuh-api/autopilot/stats

# Test case listing
curl -s -b /tmp/test_cookies.txt http://127.0.0.1:8095/wazuh-api/autopilot/cases

# Trigger scan
curl -s -b /tmp/test_cookies.txt -X POST http://127.0.0.1:8095/wazuh-api/autopilot/scan
```

Expected: All return JSON without errors

- [ ] **Step 3: Verify SPA loads correctly**

Open browser to `/wazuh-soc-v2` — Autopilot page should show cases from Supabase.
