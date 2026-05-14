param(
  [string]$TaskName = "LyricVeil QQMusic AutoStart",
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$watcher = Join-Path $PSScriptRoot "windows-qqmusic-autostart.ps1"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcher`" -ProjectRoot `"$projectRoot`" -Port $Port"

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Start Lyric Veil automatically when QQ Music opens." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started scheduled task: $TaskName"
