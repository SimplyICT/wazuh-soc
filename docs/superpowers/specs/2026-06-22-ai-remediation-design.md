# AI SOC Remediation — Design Document

## Overview

Add actual remediation execution to the SOC Autopilot. When a case is approved and
executed (or auto-triggered for high-confidence critical alerts), the response plan
gets carried out: suppressing false positives, blocking threats, notifying the SOC team.

## Tiered Response Matrix

| Level Band | Trigger | Actions |
|------------|---------|---------|
| 0-7 (Low) | Auto on scan | Log + if same rule_id fires >5x/24h → auto-suppress rule in Wazuh |
| 8-11 (Medium) | On human "Execute Plan" | Ping device, notify SOC via Telegram, add to watchlist |
| 12-14 (High) | On human "Execute Plan" | Block source IP (iptables), ping device, notify SOC with AI incident summary |
| 15+ (Critical) | Auto if confidence >0.9; else on approve | Block source IP, isolate, emergency Telegram, create incident record |

## New Module: `ai_remediate.py`

```python
def execute_case(case: dict) -> dict:
    """Execute the response plan for an approved case.
    Returns {action: result} for each action attempted."""

def suppress_rule(rule_id: int, source: str) -> bool:
    """Add alert source to Wazuh CDB list to suppress false positives.
    Calls Wazuh manager API: PUT /lists to update CDB list."""

def block_ip(address: str) -> bool:
    """Add iptables rule to drop traffic from source IP.
    Runs: iptables -A INPUT -s <ip> -j DROP"""

def ping_device(ip: str) -> dict:
    """Check if device is reachable. Returns {alive, rtt_ms}."""

def notify_soc(message: str, level: str = "info") -> bool:
    """Send notification via existing Telegram/notify.py channels."""

def add_watchlist(ioc: str, ioc_type: str) -> bool:
    """Add IOC to local watchlist file for tracking."""
```

## Changes to Existing Code

### `app.py`
- `/execute` endpoint calls `ai_remediate.execute_case(case)` then sets status
- Auto-execution: when scan finds level 15+ alert with confidence >0.9, run `execute_case` immediately
- Auto-suppression: track per-rule firing counts; when >5 identical alerts in 24h, call `suppress_rule`

### `ai_resolver.py`
- No changes needed

### `soc_agent.py`
- Notify on auto-execution events
- Include remediation actions in daily digest

## Frontend
- Case detail shows which actions were actually taken (with success/failure status)
- Timeline shows execution results per action

## Wazuh Integration (Suppression)

Wazuh supports CDB lists for alert suppression. The system will manage a `soc_suppressions` list:
- API: `PUT /lists` to update the list
- Format: `source_name:alert_type` → `suppressed`
- On approval, adds the alert's source + type to the suppression list
- Wazuh manager then stops firing that alert for that source
