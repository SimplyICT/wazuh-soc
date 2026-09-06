#!/usr/bin/env python3
"""Fix SOC agent start.cmd and restart on offline agents."""
import json, os, ssl, sys, urllib.request, time

TRMM_API_KEY = os.environ.get("TRMM_API_KEY")
SOC_SERVER = os.environ.get("SOC_SERVER", "http://173.208.232.91:8095")
TRMM_API = "https://api.simplyict.com.au"

def api_get(url, key=None):
    req = urllib.request.Request(url)
    if key: req.add_header("X-API-Key", key)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        print(f"error: API GET failed for {url}: {e}", file=sys.stderr)
        raise
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON from {url}: {e}", file=sys.stderr)
        raise

def api_post(url, data, key):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body,
        headers={"X-API-Key": key, "Content-Type": "application/json"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        print(f"error: API POST failed for {url}: {e}", file=sys.stderr)
        raise
    except json.JSONDecodeError as e:
        print(f"error: invalid JSON from {url}: {e}", file=sys.stderr)
        raise

def main():
    if not TRMM_API_KEY:
        print("error: set TRMM_API_KEY", file=sys.stderr)
        sys.exit(1)

    # Get SOC agents
    soc = api_get(f"{SOC_SERVER}/api/agents/all")
    soc_agents = {a.get("hostname"): a for a in soc.get("agents", [])}

    # Get TRMM agents
    trmm = api_get(f"{TRMM_API}/agents/", TRMM_API_KEY)

    offline_windows = [a for a in trmm
        if a.get("hostname") in soc_agents
        and a.get("plat") == "windows"
        and a.get("hostname") not in (
            "DESKTOP-37759RK", "DESKTOP-8K3P7QM",
            "ELP-Sophia-Admin", "ELP-Rentals1", "Georgia-ELP",
            "ELP-Jordan", "DESKTOP-34HOJS3", "DESKTOP-D5HUIPL",
            "Sales-Mitch", "DESKTOP-7Q6S9H7", "ELP-PM-Assistant",
            "Harvest-remote",
        )
        and a.get("status") == "online"  # must be online in TRMM
    ]

    print(f"Fixing {len(offline_windows)} offline agents...")

    for a in offline_windows:
        host = a.get("hostname", "?")
        aid = a.get("agent_id", "?")

        print(f"\n{host} ... ", end="", flush=True)

        # Fix start.cmd - use cmd echo to write proper file
        fix_cmd = (
            'cmd /c (echo @echo off'
            ' && echo cd /d "C:\\ProgramData\\SOCAgent"'
            ' && echo "C:\\Program Files\\Python312\\python.exe" agent.py --server 173.208.232.91:8095 --key ac819555a88829a086d429cfec5daa45 ^>^> "C:\\ProgramData\\SOCAgent\\agent.log" 2^>^&1'
            ') > "C:\\ProgramData\\SOCAgent\\start.cmd"'
        )
        try:
            result = api_post(f"{TRMM_API}/agents/{aid}/cmd/",
                {"cmd": fix_cmd, "shell": "cmd", "timeout": 15, "run_as_user": False},
                TRMM_API_KEY)
            if isinstance(result, dict) and result.get("error"):
                print(f"fix-cmd rejected: {result['error']}", end="", flush=True)
                continue
        except Exception as e:
            print(f"fix-cmd failed: {e}", end="", flush=True)
            continue

        time.sleep(1)

        # Start agent via scheduled task
        try:
            result = api_post(f"{TRMM_API}/agents/{aid}/cmd/",
                {"cmd": 'schtasks /run /tn SOCAgent', "shell": "cmd", "timeout": 15, "run_as_user": False},
                TRMM_API_KEY)
            if isinstance(result, dict) and result.get("error"):
                print(f"start rejected: {result['error']}", end="", flush=True)
                continue
            print("started", end="", flush=True)
        except Exception as e:
            print(f"start failed: {e}", end="", flush=True)
            continue

    print("\n\nDone. Check registration after 30s.")

if __name__ == "__main__":
    main()
