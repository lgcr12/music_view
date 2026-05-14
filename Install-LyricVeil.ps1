param(
  [int]$Port = 8000,
  [switch]$NoAutoStart,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$TaskName = "LyricVeil QQMusic AutoStart"
$StartScript = Join-Path $ProjectRoot "Start-LyricVeil.ps1"
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Lyric Veil.lnk"
$StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Lyric Veil"
$StartMenuShortcut = Join-Path $StartMenuDir "Lyric Veil.lnk"

function Test-CommandAvailable {
  param([string]$Command)
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function New-LyricVeilShortcut {
  param(
    [string]$ShortcutPath,
    [string]$TargetScript
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TargetScript`" -Port $Port"
  $shortcut.WorkingDirectory = $ProjectRoot
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,167"
  $shortcut.Description = "Start Lyric Veil on port $Port"
  $shortcut.Save()
}

if (-not (Test-CommandAvailable "node")) {
  throw "Node.js was not found. Install Node.js first, then run this installer again."
}

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "Installing npm dependencies..."
  Push-Location $ProjectRoot
  try {
    npm install
  } finally {
    Pop-Location
  }
}

@"
param(
  [int]`$Port = $Port,
  [switch]`$NoBrowser
)

`$ErrorActionPreference = "SilentlyContinue"
`$ProjectRoot = "$ProjectRoot"
`$url = "http://localhost:`$Port"

function Test-LyricVeilRunning {
  try {
    `$response = Invoke-WebRequest -Uri `$url -UseBasicParsing -TimeoutSec 2
    return `$response.StatusCode -ge 200 -and `$response.StatusCode -lt 500
  } catch {
    return `$false
  }
}

if (-not (Test-LyricVeilRunning)) {
  `$command = "`$env:PORT='`$Port'; Set-Location '`$ProjectRoot'; node server.js"
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `$command -WindowStyle Hidden
  for (`$i = 0; `$i -lt 20; `$i += 1) {
    if (Test-LyricVeilRunning) { break }
    Start-Sleep -Milliseconds 500
  }
}

if (-not `$NoBrowser) {
  Start-Process `$url
}
"@ | Set-Content -LiteralPath $StartScript -Encoding UTF8

New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
New-LyricVeilShortcut -ShortcutPath $DesktopShortcut -TargetScript $StartScript
New-LyricVeilShortcut -ShortcutPath $StartMenuShortcut -TargetScript $StartScript

if (-not $NoAutoStart) {
  & (Join-Path $ProjectRoot "scripts\install-qqmusic-autostart.ps1") -TaskName $TaskName -Port $Port
}

if (-not $NoLaunch) {
  & $StartScript -Port $Port
}

Write-Host ""
Write-Host "Lyric Veil installed."
Write-Host "Desktop shortcut: $DesktopShortcut"
Write-Host "Start menu shortcut: $StartMenuShortcut"
Write-Host "URL: http://localhost:$Port"
