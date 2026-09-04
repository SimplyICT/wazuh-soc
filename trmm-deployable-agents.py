#!/usr/bin/env python3
"""Tactical RMM PoC: list all Windows agents ready for SOC agent deployment.

Usage:
    # Set via: export TRMM_API_KEY="your-api-key"
    ./trmm-deployable-agents.py
    # or
    # ./trmm-deployable-agents.py --key <your-key>
"""

import json
import os
import sys
import urllib.error
import urllib.request
import ssl
from datetime import datetime, timezone

API_BASE = "https://api.simplyict.com.au"

def api_get(path, api_key):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        print(f"error: API request to {path} failed: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON response from {path}: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    api_key = None
    if len(sys.argv) > 2 and sys.argv[1] == "--key":
        api_key = sys.argv[2]
    else:
        api_key = os.environ.get("TRMM_API_KEY")

    if not api_key:
        print("error: set TRMM_API_KEY or pass --key <key>", file=sys.stderr)
        sys.exit(1)

    # Fetch all agents
    print("Fetching agents ...", file=sys.stderr)
    agents = api_get("/agents/", api_key)

    # Filter: Windows + online
    deployable = [
        a for a in agents
        if a.get("plat") == "windows" and a.get("status") == "online"
    ]

    # Also collect overdue but recently seen (within 24h) for awareness
    recently_overdue = [
        a for a in agents
        if a.get("plat") == "windows" and a.get("status") == "overdue"
        and a.get("last_seen")
        and (datetime.now(timezone.utc) - datetime.fromisoformat(a["last_seen"].replace("Z", "+00:00"))).total_seconds() < 86400
    ]

    print(f"\n{'='*80}")
    print(f"  WINDOWS AGENTS READY FOR DEPLOYMENT  |  {len(deployable)} online  |  {len(recently_overdue)} recently seen (≤24h)")
    print(f"{'='*80}\n")

    if deployable:
        _print_table(deployable, "DEPLOY NOW")
    if recently_overdue:
        _print_table(recently_overdue, "MAYBE (overdue <24h)")
    if not deployable and not recently_overdue:
        print("  No Windows agents ready for deployment.")

    # Summary
    total_windows = sum(1 for a in agents if a.get("plat") == "windows")
    total_online = sum(1 for a in agents if a.get("status") == "online")
    print(f"\n  Summary:  {total_windows} total Windows  |  {total_online} total online  |  {len(agents)} agents in TRMM")
    print()


def _print_table(agents, label):
    print(f"  ── {label} ──\n")
    print(f"  {'HOSTNAME':30s} {'CLIENT':25s} {'SITE':20s} {'STATUS':>8s}  {'LAST SEEN':20s}  {'IP':16s}  {'OS'}")
    print(f"  {'─'*30} {'─'*25} {'─'*20} {'─'*8}  {'─'*20}  {'─'*16}  {'─'*30}")
    for a in agents:
        host = a.get("hostname", "?")
        client = a.get("client_name", "?") or "?"
        site = a.get("site_name", "?") or "?"
        status = a.get("status", "?")
        last = a.get("last_seen", "")
        if last:
            last = last[:19].replace("T", " ")
        ip = a.get("local_ips", "") or ""
        os_str = (a.get("operating_system", "") or "").split(",")[0][:30]
        print(f"  {host:30s} {client:25s} {site:20s} {status:>8s}  {last:20s}  {ip:16s}  {os_str}")
    print()


if __name__ == "__main__":
    main()
