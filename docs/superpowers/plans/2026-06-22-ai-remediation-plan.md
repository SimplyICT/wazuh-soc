# AI SOC Remediation — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add actual remediation execution when cases are approved or auto-triggered.

**Architecture:** New `ai_remediate.py` module handles all actions (block IP, suppress rule, ping, notify). The existing `/execute` endpoint calls into it. Auto-execution triggers for critical high-confidence alerts during the scan cycle.

**Tech Stack:** Python 3, iptables, Wazuh REST API, existing Telegram/notify.py

---

### Task 1: Build ai_remediate.py

**Files:**
- Create: `/home/aiagent/mission-control-ui/ai_remediate.py`

- [ ] **Step 1: Write ai_remediate.py**

```python
"""Remediation executor — carries out response plan actions for approved cases."""
import logging
import os
import subprocess
import requests

logger = logging.getLogger("ai_remediate")

WAZUH_API_BASE = os.getenv("WAZUH_SOC_API_BASE", "http://208.87.135.185:5000/api")
WAZUH_USER = os.getenv("WAZUH_SOC_USER", "admin")
WAZUH_PASS = os.getenv("WAZUH_SOC_PASS", "admin123")

REMEDIATION_LOG = os.path.join(os.path.dirname(__file__), "remediation_log.json")

_wazuh_token = {"value": ""}


def _wazuh_login() -> str:
    if _wazuh_token["value"]:
        return _wazuh_token["value"]
    try:
        r = requests.post(
            f"{WAZUH_API_BASE}/auth/login",
            json={"username": WAZUH_USER, "password": WAZUH_PASS},
            timeout=10,
        )
        if r.ok:
            _wazuh_token["value"] = r.json().get("token", "")
            return _wazuh_token["value"]
    except Exception as e:
        logger.error("Wazuh login failed: %s", e)
    return ""


def ping_device(ip: str) -> dict:
    """Check device reachability via ping."""
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "3", ip],
            capture_output=True, timeout=10, text=True,
        )
        alive = r.returncode == 0
        rtt = None
        if alive and "time=" in r.stdout:
            rtt = float(r.stdout.split("time=")[1].split(" ")[0])
        return {"alive": alive, "rtt_ms": rtt}
    except Exception as e:
        return {"alive": False, "error": str(e)}


def block_ip(address: str) -> dict:
    """Add iptables rule to drop traffic from source IP."""
    try:
        r = subprocess.run(
            ["iptables", "-A", "INPUT", "-s", address, "-j", "DROP"],
            capture_output=True, timeout=10, text=True,
        )
        if r.returncode == 0:
            logger.info("Blocked IP %s via iptables", address)
            return {"success": True, "action": "block_ip", "target": address}
        return {"success": False, "action": "block_ip", "error": r.stderr.strip()}
    except Exception as e:
        return {"success": False, "action": "block_ip", "error": str(e)}


def suppress_rule(rule_id: int, source: str, alert_type: str) -> dict:
    """Suppress a Wazuh rule for a specific source via CDB list."""
    token = _wazuh_login()
    if not token:
        return {"success": False, "action": "suppress_rule", "error": "no auth"}
    try:
        entry = f"{source}:{alert_type}"
        resp = requests.put(
            f"{WAZUH_API_BASE}/lists",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "soc_suppressions",
                "content": {entry: "suppressed"},
            },
            timeout=15,
        )
        if resp.ok:
            logger.info("Suppressed rule %d for %s", rule_id, source)
            return {"success": True, "action": "suppress_rule", "target": entry}
        return {"success": False, "action": "suppress_rule", "error": resp.text[:200]}
    except Exception as e:
        return {"success": False, "action": "suppress_rule", "error": str(e)}


def notify_soc(message: str, level: str = "info") -> dict:
    """Send notification via Telegram."""
    try:
        from soc_agent import _send_telegram
        _send_telegram(f"[{level.upper()}] {message}")
        return {"success": True, "action": "notify", "target": "telegram"}
    except Exception as e:
        logger.warning("Telegram notify failed: %s", e)
    return {"success": False, "action": "notify", "error": "telegram unavailable"}


def add_watchlist(ioc: str, ioc_type: str = "ip") -> dict:
    """Add IOC to local watchlist file."""
    import json
    from datetime import datetime, timezone
    watch_file = os.path.join(os.path.dirname(__file__), "watchlist.json")
    try:
        entries = []
        if os.path.exists(watch_file):
            entries = json.loads(open(watch_file).read())
        entries.append({
            "value": ioc,
            "type": ioc_type,
            "added": datetime.now(timezone.utc).isoformat(),
            "source": "ai_remediation",
        })
        with open(watch_file, "w") as f:
            json.dump(entries, f, indent=2)
        logger.info("Added %s (%s) to watchlist", ioc, ioc_type)
        return {"success": True, "action": "add_watchlist", "target": ioc}
    except Exception as e:
        return {"success": False, "action": "add_watchlist", "error": str(e)}


def execute_case(case: dict) -> list[dict]:
    """Execute the full response plan for a case.

    Reads the response_plan from the case and runs each action.
    Returns a list of result dicts (one per action attempted).
    """
    results = []
    plan = case.get("response_plan", [])
    level = case.get("severity", "low")
    title = case.get("title", "")

    if isinstance(plan, list):
        actions = plan
    elif isinstance(plan, dict):
        actions = plan.get("actions", [])
    else:
        actions = []

    for action in actions:
        action_type = action if isinstance(action, str) else action.get("type", "")
        target = "" if isinstance(action, str) else action.get("target", "")

        if action_type == "block_ip" and target:
            results.append(block_ip(target))
        elif action_type in ("ping", "ping_device") and target:
            results.append(ping_device(target))
        elif action_type in ("suppress", "suppress_rule"):
            results.append(suppress_rule(
                case.get("rule_id", 0),
                case.get("source", target),
                case.get("alert_type", ""),
            ))
        elif action_type in ("notify", "notify_soc"):
            msg = f"Case: {title} — {action.get('rationale', 'Execution triggered')}"
            results.append(notify_soc(msg, level))
        elif action_type in ("investigate", "review"):
            results.append(notify_soc(
                f"Case requires investigation: {title}", "high"))
        elif target:
            results.append(ping_device(target))
        else:
            results.append(notify_soc(f"Action: {action_type} — {title}", "info"))

    return results
```

- [ ] **Step 2: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add ai_remediate.py && git commit -m "feat: add ai_remediate module for execution actions"
```

---

### Task 2: Wire execution into the autopilot endpoints

**Files:**
- Modify: `/home/aiagent/mission-control-ui/app.py`

- [ ] **Step 1: Update the /execute endpoint**

Replace the existing `autopilot_execute` function:

```python
@app.post("/wazuh-api/autopilot/cases/{case_id}/execute")
def autopilot_execute(case_id: str):
    c = get_case(case_id)
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    if c.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Case must be approved before execution")

    from ai_remediate import execute_case
    results = execute_case(c)

    now = datetime.now(timezone.utc).isoformat()
    events = c.get("events", [])
    if isinstance(events, str):
        try:
            events = json.loads(events)
        except Exception:
            events = []
    for r in results:
        events.append({
            "type": "executed" if r.get("success") else "failed",
            "timestamp": now,
            "detail": f"{r.get('action', 'unknown')} → {r.get('target', '')}: {'ok' if r.get('success') else r.get('error', 'failed')}",
        })
    update_case(case_id, {
        "status": "in_progress",
        "events": json.dumps(events),
        "actions": json.dumps(results),
    })
    return {"status": "ok", "case": {"id": case_id, "status": "in_progress"}, "results": results}
```

- [ ] **Step 2: Add auto-execution for critical high-confidence alerts**

In `ai_scan_and_generate()`, add after the case creation block:

```python
# Auto-execute for critical alerts with high confidence
if level >= 15 and confidence >= 0.9 and cid:
    from ai_remediate import execute_case
    new_case = get_case(cid)
    if new_case:
        results = execute_case(new_case)
        update_case(cid, {"status": "in_progress", "actions": json.dumps(results)})
        from ai_resolver import log_action as _log
        _log(alert.get("id", ""), alert.get("title", ""), level,
             "auto_executed", confidence, f"Auto-remediation triggered: {len(results)} actions")
        logger.info("Auto-executed remediation for case %s (%d actions)", cid, len(results))
```

- [ ] **Step 3: Commit**

```bash
cd /home/aiagent/mission-control-ui && git add app.py && git commit -m "feat: wire ai_remediate into execute endpoint and auto-exec for critical alerts"
```

---

### Task 3: Restart and verify

- [ ] **Step 1: Restart backend**

```bash
sudo systemctl restart mission-control-ui
```

- [ ] **Step 2: Test the execute endpoint**

```bash
# Get a case ID
curl -sL -b /tmp/cookies.txt http://127.0.0.1:8095/wazuh-api/autopilot/cases | python3 -c "import sys,json;d=json.load(sys.stdin);items=d.get('affected_items',[]);print(items[0]['id'] if items else 'no cases')"

# Approve it
curl -sL -b /tmp/cookies.txt -X POST http://127.0.0.1:8095/wazuh-api/autopilot/cases/{ID}/approve

# Execute it
curl -sL -b /tmp/cookies.txt -X POST http://127.0.0.1:8095/wazuh-api/autopilot/cases/{ID}/execute | python3 -m json.tool
```
