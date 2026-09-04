#!/usr/bin/env python3
"""Tactical RMM PoC: deploy (or test) on Windows agents.

Usage:
    # Set via: export TRMM_API_KEY="your-api-key"

    # List all deployable agents
    ./trmm-deploy.py list

    # Run a command on ALL online Windows agents
    ./trmm-deploy.py exec --cmd "hostname" --shell cmd

    # Run a builtin script on all online Windows agents (script ID 4 = Chrome clear cache)
    ./trmm-deploy.py script --id 4

    # Targeted: run on specific agents only
    ./trmm-deploy.py exec --cmd "hostname" --agent BELC-Main-Admin --agent VETCONSULTTWO

    # Dry-run mode: show what would happen
    ./trmm-deploy.py list --dry-run
"""

import json
import os
import sys
import urllib.request
import ssl
from datetime import datetime, timezone

API_BASE = "https://api.simplyict.com.au"

def api_get(path, api_key):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, headers={"X-API-Key": api_key})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.loads(resp.read())

def api_post(path, data, api_key):
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body,
        headers={"X-API-Key": api_key, "Content-Type": "application/json"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        return json.loads(resp.read())

def find_agents(agents, hostnames=None, status="online", plat="windows"):
    """Filter agents by hostname(s), status, and platform."""
    results = []
    for a in agents:
        if a.get("plat") != plat:
            continue
        if a.get("status") != status:
            continue
        if hostnames and a.get("hostname") not in hostnames:
            continue
        results.append(a)
    return results



def main():
    api_key = os.environ.get("TRMM_API_KEY")
    if not api_key:
        print("error: set TRMM_API_KEY", file=sys.stderr)
        sys.exit(1)

    # Parse subcommand
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    sub = sys.argv[1]
    args = sys.argv[2:]

    # Fetch agents
    print("Fetching agents ...", file=sys.stderr)
    agents = api_get("/agents/", api_key)

    if sub == "list":
        deployable = [a for a in agents
                      if a.get("plat") == "windows" and a.get("status") == "online"]
        recently = [a for a in agents
                    if a.get("plat") == "windows" and a.get("status") == "overdue"
                    and a.get("last_seen")
                    and (datetime.now(timezone.utc) - datetime.fromisoformat(
                        a["last_seen"].replace("Z", "+00:00"))).total_seconds() < 86400]

        print(f"\n{'='*80}")
        print(f"  READY FOR DEPLOYMENT  |  {len(deployable)} online  |  {len(recently)} recently seen")
        print(f"{'='*80}\n")

        for label, group in [("ONLINE", deployable), ("RECENT (<24h)", recently)]:
            if not group:
                continue
            print(f"  ── {label} ──\n")
            print(f"  {'HOSTNAME':30s} {'CLIENT':25s} {'SITE':20s} {'VERSION':8s}  {'IP':16s}")
            print(f"  {'─'*30} {'─'*25} {'─'*20} {'─'*8}  {'─'*16}")
            for a in group:
                host = a.get("hostname", "?")
                client = (a.get("client_name") or "?")[:25]
                site = (a.get("site_name") or "?")[:20]
                ver = a.get("version", "?")
                ip = (a.get("local_ips") or "").split(",")[0][:16]
                print(f"  {host:30s} {client:25s} {site:20s} {ver:8s}  {ip:16s}")
            print()
        return

    # --- Action commands ---
    # Find target agents
    target_hostnames = None
    i = 0
    while i < len(args):
        if args[i] == "--agent" and i + 1 < len(args):
            if target_hostnames is None:
                target_hostnames = []
            target_hostnames.append(args[i + 1])
            i += 2
        else:
            i += 1

    # Re-parse flags
    dry_run = "--dry-run" in args

    targets = find_agents(agents, hostnames=target_hostnames)
    if not targets:
        print(f"error: no online Windows agents found matching criteria", file=sys.stderr)
        sys.exit(1)

    print(f"  Target: {len(targets)} agent(s)", file=sys.stderr)

    if sub == "exec":
        cmd_str = None
        shell = "cmd"
        timeout = 30
        run_as_user = False
        i = 0
        while i < len(args):
            if args[i] == "--cmd" and i + 1 < len(args):
                cmd_str = args[i + 1]
                i += 2
            elif args[i] == "--shell" and i + 1 < len(args):
                shell = args[i + 1]
                i += 2
            elif args[i] == "--timeout" and i + 1 < len(args):
                try:
                    timeout = int(args[i + 1])
                except ValueError:
                    print(f"error: invalid --timeout value '{args[i + 1]}'", file=sys.stderr)
                    sys.exit(1)
                i += 2
            else:
                i += 1

        if not cmd_str:
            print("error: --cmd is required for 'exec'", file=sys.stderr)
            sys.exit(1)

        payload = {
            "cmd": cmd_str,
            "shell": shell,
            "timeout": timeout,
            "run_as_user": run_as_user,
        }

        for a in targets:
            host = a["hostname"]
            aid = a["agent_id"]
            if dry_run:
                print(f"  [DRY-RUN] would exec on {host}: {cmd_str}")
                continue
            print(f"  Executing on {host} ... ", end="", file=sys.stderr)
            try:
                result = api_post(f"/agents/{aid}/cmd/", payload, api_key)
                output = result if isinstance(result, str) else json.dumps(result)
                print(f"OK", file=sys.stderr)
                print(f"  [{host}] {output[:500]}")
            except Exception as e:
                print(f"FAILED: {e}", file=sys.stderr)

    elif sub == "script":
        script_id = None
        output = "wait"
        timeout = 90
        run_as_user = False
        i = 0
        while i < len(args):
            if args[i] == "--id" and i + 1 < len(args):
                try:
                    script_id = int(args[i + 1])
                except ValueError:
                    print(f"error: invalid --id value '{args[i + 1]}'", file=sys.stderr)
                    sys.exit(1)
                i += 2
            elif args[i] == "--timeout" and i + 1 < len(args):
                try:
                    timeout = int(args[i + 1])
                except ValueError:
                    print(f"error: invalid --timeout value '{args[i + 1]}'", file=sys.stderr)
                    sys.exit(1)
                i += 2
            else:
                i += 1

        if not script_id:
            print("error: --id (script ID) is required for 'script'", file=sys.stderr)
            sys.exit(1)

        payload = {
            "script": script_id,
            "output": output,
            "args": [],
            "run_as_user": run_as_user,
            "env_vars": [],
            "timeout": timeout,
        }

        for a in targets:
            host = a["hostname"]
            aid = a["agent_id"]
            if dry_run:
                print(f"  [DRY-RUN] would run script {script_id} on {host}")
                continue
            print(f"  Running script #{script_id} on {host} ... ", end="", file=sys.stderr)
            try:
                result = api_post(f"/agents/{aid}/runscript/", payload, api_key)
                output = result if isinstance(result, str) else json.dumps(result)
                print(f"OK", file=sys.stderr)
                print(f"  [{host}] {output[:500]}")
            except Exception as e:
                print(f"FAILED: {e}", file=sys.stderr)

    else:
        print(f"unknown subcommand: {sub}", file=sys.stderr)
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
