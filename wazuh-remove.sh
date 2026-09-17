#!/usr/bin/env bash
# Remove the legacy Wazuh/OSSEC agent from a Linux endpoint.
#
# Wazuh is retired (the SOC is our own stack now). Run as root:
#   curl -s http://SOC/api/agent/tools/wazuh-remove.sh | sudo bash
# Prints one summary line: REMOVED ... / PARTIAL ... / CLEAN.
set -u

report=()

# 1. Services (any unit whose name mentions wazuh/ossec)
units=$(systemctl list-unit-files --type=service 2>/dev/null | awk '$1 ~ /wazuh|ossec/ {print $1}')
for unit in $units; do
  systemctl disable --now "$unit" >/dev/null 2>&1 || true
  frag=$(systemctl show -p FragmentPath --value "$unit" 2>/dev/null)
  report+=("svc:$unit")
  if [ -n "$frag" ] && [ -f "$frag" ]; then
    rm -f "$frag" && report+=("unit-file:$frag")
  fi
done

# 2. Packages
if command -v dpkg >/dev/null 2>&1; then
  pkgs=$(dpkg-query -W -f='${Package}\n' 2>/dev/null | grep -E '^(wazuh|ossec)' || true)
  for p in $pkgs; do
    DEBIAN_FRONTEND=noninteractive apt-get purge -y "$p" >/dev/null 2>&1 && report+=("pkg:$p") || report+=("pkg-failed:$p")
  done
  for f in /etc/apt/sources.list.d/wazuh.list /etc/apt/sources.list.d/wazuh-agent.list; do
    [ -f "$f" ] && rm -f "$f" && report+=("repo:$(basename "$f")")
  done
  [ -f /usr/share/keyrings/wazuh.gpg ] && rm -f /usr/share/keyrings/wazuh.gpg && report+=("keyring:wazuh")
fi
if command -v rpm >/dev/null 2>&1; then
  pkgs=$(rpm -qa 2>/dev/null | grep -E '^(wazuh|ossec)' || true)
  for p in $pkgs; do
    rpm -e --nodeps "$p" >/dev/null 2>&1 && report+=("rpm:$p") || report+=("rpm-failed:$p")
  done
  for f in /etc/yum.repos.d/wazuh.repo /etc/yum.repos.d/wazuh-agent.repo; do
    [ -f "$f" ] && rm -f "$f" && report+=("repo:$(basename "$f")")
  done
fi

# 3. Leftovers
for d in /var/ossec /var/ossec-agent /opt/ossec /etc/ossec-agent; do
  if [ -d "$d" ]; then
    rm -rf "$d" && report+=("dir:$d")
  fi
done
for f in /etc/systemd/system/wazuh-agent.service /etc/systemd/system/ossec.service; do
  [ -f "$f" ] && rm -f "$f" && report+=("unit-file:$(basename "$f")")
done
systemctl daemon-reload >/dev/null 2>&1 || true

# 4. Verify
left=()
for unit in wazuh-agent wazuh-agentd ossec; do
  systemctl list-unit-files 2>/dev/null | grep -q "^${unit}\.service" && left+=("svc:$unit")
done
[ -d /var/ossec ] && left+=("dir:/var/ossec")
if command -v dpkg >/dev/null 2>&1; then
  dpkg-query -W -f='${Package}\n' 2>/dev/null | grep -qE '^(wazuh|ossec)' && left+=("pkg")
fi
if command -v rpm >/dev/null 2>&1; then
  rpm -qa 2>/dev/null | grep -qE '^(wazuh|ossec)' && left+=("rpm")
fi

if [ ${#left[@]} -eq 0 ]; then
  if [ ${#report[@]} -eq 0 ]; then echo "CLEAN (nothing to remove)"; else echo "REMOVED ${report[*]}"; fi
else
  echo "PARTIAL removed=[${report[*]:-}] left=[${left[*]}]"
fi
