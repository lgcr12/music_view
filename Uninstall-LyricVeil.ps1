param(
  [string]$TaskName = "LyricVeil QQMusic AutoStart"
)

$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = $PSScriptRoot
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Lyric Veil.lnk"
$StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Lyric Veil"
$StartScript = Join-Path $ProjectRoot "Start-LyricVeil.ps1"

& (Join-Path $ProjectRoot "scripts\uninstall-qqmusic-autostart.ps1") -TaskName $TaskName

Remove-Item -LiteralPath $DesktopShortcut -Force
Remove-Item -LiteralPath $StartMenuDir -Recurse -Force
Remove-Item -LiteralPath $StartScript -Force

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*server.js*" -and
    $_.CommandLine -like "*$ProjectRoot*"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Write-Host "Lyric Veil shortcuts, autostart task, and generated start script were removed."
