# Remove the legacy Wazuh/OSSEC agent from a Windows endpoint.
#
# Wazuh is retired (the SOC is our own stack now) — this clears the service, the
# MSI install and the leftovers. Run as SYSTEM/admin:
#   powershell -ExecutionPolicy Bypass -File wazuh-remove.ps1
# Prints one summary line: REMOVED / PARTIAL <what is left> / CLEAN.

$ErrorActionPreference = "Continue"
$report = @()

# 1. Services
foreach ($svc in @("WazuhSvc", "OssecSvc", "Wazuh")) {
  $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if ($s) {
    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
    & sc.exe delete $svc | Out-Null
    $report += "svc:$svc"
  }
}

# 2. MSI / installed product
$uninstallRoots = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$products = Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*Wazuh*" -or $_.DisplayName -like "*OSSEC*" }
foreach ($p in $products) {
  $code = $p.PSChildName
  if ($code -match "^\{.*\}$") {
    & msiexec.exe /x $code /qn /norestart | Out-Null
    $report += "msi:$($p.DisplayName)"
  }
}
if (-not $products) {
  # No MSI entry in the Uninstall keys: ask the installer service for products
  # whose display name mentions Wazuh (WMIC is gone on current Windows 11).
  $msi = @()
  try {
    $msi = Get-WmiObject -Class Win32_Product -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -like "*Wazuh*" -or $_.Name -like "*OSSEC*" }
  } catch { $msi = @() }
  foreach ($m in $msi) {
    & msiexec.exe /x $m.IdentifyingNumber /qn /norestart | Out-Null
    $report += "msi:$($m.Name)"
  }
}

# 3. Leftovers (files, tasks, firewall rules)
foreach ($dir in @("C:\Program Files (x86)\ossec-agent", "C:\Program Files\ossec-agent",
                   "C:\ProgramData\ossec", "C:\Program Files (x86)\Wazuh",
                   "C:\Program Files\Wazuh")) {
  if (Test-Path $dir) {
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    $report += "dir:$dir"
  }
}
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
  $_.TaskName -match "wazuh|ossec" -or ($_.Actions | ForEach-Object { $_.Execute }) -match "wazuh|ossec"
} | ForEach-Object { Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false; $report += "task:$($_.TaskName)" }
Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "wazuh|ossec" } |
  ForEach-Object { Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue; $report += "fw:$($_.DisplayName)" }

# 4. Verify
Start-Sleep -Seconds 2
$left = @()
foreach ($svc in @("WazuhSvc", "OssecSvc", "Wazuh")) {
  if (Get-Service -Name $svc -ErrorAction SilentlyContinue) { $left += "svc:$svc" }
}
foreach ($dir in @("C:\Program Files (x86)\ossec-agent", "C:\Program Files\ossec-agent")) {
  if (Test-Path $dir) { $left += "dir:$dir" }
}
# A leftover MSI registry entry with no service and no files is a stale key that
# clears on the next reboot - report it as a note, not as a failed removal.
$still = Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue |
         Where-Object { $_.DisplayName -like "*Wazuh*" -or $_.DisplayName -like "*OSSEC*" }
if ($still) {
  if ($left.Count -eq 0) { $report += "stale-msi-entry(clears-on-reboot)" } else { $left += "msi" }
}

if ($left.Count -eq 0) {
  if ($report.Count -eq 0) { "CLEAN (nothing to remove)" } else { "REMOVED " + ($report -join " ") }
} else {
  "PARTIAL removed=[" + ($report -join " ") + "] left=[" + ($left -join " ") + "]"
}
