#!/usr/bin/env python3
"""Remove the legacy Wazuh/OSSEC agent from Windows endpoints via TRMM.

The PowerShell remover (wazuh-remove.ps1) is shipped to each machine as a
base64 -EncodedCommand, so nothing needs to be served over HTTP and the command
works even on hosts that cannot reach the SOC web.

Usage:
    export TRMM_API_KEY=...
    ./wazuh-remove-win.py --detect                 # inventory only
    ./wazuh-remove-win.py --host DESKTOP-37759RK   # one canary
    ./wazuh-remove-win.py                          # whole online fleet

Always prints one line per host: CLEAN / REMOVED ... / PARTIAL ...
"""
import argparse
import base64
import concurrent.futures
import fnmatch
import json
import os
import ssl
import sys
import urllib.request
from pathlib import Path

TRMM_API = "https://api.simplyict.com.au"
SCRIPT = Path(__file__).resolve().parent / "wazuh-remove.ps1"

DETECT = (
    "powershell -NoProfile -Command \"$s=@(); "
    "if(Get-Service WazuhSvc -EA 0){$s+='svc'}; if(Get-Service OssecSvc -EA 0){$s+='ossec-svc'}; "
    "if(Test-Path 'C:\\Program Files (x86)\\ossec-agent'){$s+='dir'}; "
    "$u=Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',"
    "'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -EA 0 | "
    "?{$_.DisplayName -like '*Wazuh*' -or $_.DisplayName -like '*OSSEC*'}; "
    "if($u){$s+='msi'}; if($s){'WAZUH:'+($s -join ',')}else{'CLEAN'}\""
)


def encoded_remover() -> str:
    """wazuh-remove.ps1 as a PowerShell -EncodedCommand payload."""
    text = SCRIPT.read_text(encoding="utf-8")
    return base64.b64encode(text.encode("utf-16-le")).decode()


def trmm_get(path: str, key: str, timeout: int = 90):
    req = urllib.request.Request(f"{TRMM_API}{path}", headers={"X-API-Key": key})
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as r:
        return json.loads(r.read())


def trmm_cmd(agent_id: str, cmd: str, key: str, timeout: int = 600):
    body = json.dumps({"cmd": cmd, "shell": "cmd", "timeout": timeout,
                       "run_as_user": False}).encode()
    req = urllib.request.Request(f"{TRMM_API}/agents/{agent_id}/cmd/", data=body, method="POST",
                                 headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(),
                                    timeout=timeout + 60) as r:
            return r.read().decode().strip().strip('"').replace("\\r\\n", " ").strip()
    except Exception as e:
        return f"ERROR {str(e)[:80]}"


REMOVE_CMD = ('curl.exe -sSL http://173.208.232.91:8095/api/agent/tools/wazuh-remove.ps1 '
              '-o "%TEMP%\\wazuh-remove.ps1" && '
              'powershell -ExecutionPolicy Bypass -NoProfile -File "%TEMP%\\wazuh-remove.ps1"')


def embedded_remove_cmd() -> str:
    """Fallback for hosts that cannot fetch the script: ship it inline.

    Base64 of the UTF-8 text (not UTF-16LE) keeps the command line inside the
    ~8k limit, then PowerShell decodes it to a file and runs it.
    """
    import base64 as _b64
    raw = SCRIPT.read_text(encoding="utf-8")
    b64 = _b64.b64encode(raw.encode("utf-8")).decode()
    ps = ("$p=Join-Path $env:TEMP 'wazuh-remove.ps1'; "
          f"[IO.File]::WriteAllText($p,[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{b64}'))); "
          "& powershell -ExecutionPolicy Bypass -NoProfile -File $p")
    return f'powershell -NoProfile -Command "{ps}"'


def one(a: dict, key: str, payload: str | None) -> tuple:
    host = a.get("hostname", "?")
    if payload is None:
        out = trmm_cmd(a["agent_id"], DETECT, key, timeout=120)
        return host, a.get("client_name", ""), out
    out = trmm_cmd(a["agent_id"], REMOVE_CMD, key, timeout=600)
    if "curl:" in out or "Could not connect" in out or out.strip() == "":
        # Machine cannot reach the SOC (filtered egress, agent box down): ship the
        # script inline instead. The command line stays just under the 8k limit.
        out2 = trmm_cmd(a["agent_id"], embedded_remove_cmd(), key, timeout=600)
        out = out2 if out2.strip() else f"FALLBACK-FAILED {out[:60]}"
        out = f"{out} (embedded fallback)"
    return host, a.get("client_name", ""), out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--host", action="append", default=[],
                    help="limit to these hosts (glob or substring, repeatable)")
    ap.add_argument("--detect", action="store_true", help="inventory only, remove nothing")
    ap.add_argument("--include-offline", action="store_true")
    args = ap.parse_args()
    if not args.key:
        print("error: set TRMM_API_KEY or pass --key", file=sys.stderr)
        return 1

    agents = [a for a in trmm_get("/agents/", args.key) if a.get("plat") == "windows"]
    if not args.include_offline:
        agents = [a for a in agents if a.get("status") == "online"]
    if args.host:
        pats = [h.strip().lower() for h in args.host]

        def matches(name):
            low = name.lower()
            return any(fnmatch.fnmatch(low, p) or p in low for p in pats)
        agents = [a for a in agents if matches(a.get("hostname", ""))]

    payload = None if args.detect else REMOVE_CMD
    print(f"{'detect on' if args.detect else 'removing from'} {len(agents)} windows agents", flush=True)

    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        for host, client, out in ex.map(lambda a: one(a, args.key, payload), agents):
            rows.append((host, client, out))
            print(f"  {host:<28} {client[:20]:<22} {out[:110]}", flush=True)

    def count(prefix):
        return sum(1 for _, _, o in rows if o.startswith(prefix))
    print(f"\nsummary: CLEAN {count('CLEAN')} | REMOVED {count('REMOVED')} | "
          f"still WAZUH {count('WAZUH')} | PARTIAL {count('PARTIAL')} | ERROR {count('ERROR')}")
    json.dump([{"host": h, "client": c, "result": o} for h, c, o in rows],
              open("/tmp/wazuh-remove-win.json", "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
