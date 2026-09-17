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
  # No MSI entry: fall back to WMIC for any product the registry missed.
  $wmi = & wmic product where "name like 'Wazuh%%'" get IdentifyingNumber /value 2>$null
  foreach ($line in $wmi) {
    if ($line -match "IdentifyingNumber=(.+)") {
      & msiexec.exe /x $matches[1].Trim() /qn /norestart | Out-Null
      $report += "wmic-msi"
    }
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
$still = Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue |
         Where-Object { $_.DisplayName -like "*Wazuh*" -or $_.DisplayName -like "*OSSEC*" }
if ($still) { $left += "msi" }

if ($left.Count -eq 0) {
  if ($report.Count -eq 0) { "CLEAN (nothing to remove)" } else { "REMOVED " + ($report -join " ") }
} else {
  "PARTIAL removed=[" + ($report -join " ") + "] left=[" + ($left -join " ") + "]"
}
