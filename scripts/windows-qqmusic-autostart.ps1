param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 8000,
  [switch]$NoBrowser
)

$ErrorActionPreference = "SilentlyContinue"
$mutex = New-Object System.Threading.Mutex($false, "Global\LyricVeilQQMusicAutoStart")
if (-not $mutex.WaitOne(0)) {
  exit 0
}

$qqProcessNames = @(
  "QQMusic",
  "QQMusicLite",
  "QQMusicExternal",
  "QQMusicSvr"
)

function Test-QQMusicRunning {
  $processes = Get-Process -Name $qqProcessNames -ErrorAction SilentlyContinue
  return [bool]($processes | Where-Object {
    $_.ProcessName -like "QQMusic*" -and ($_.MainWindowHandle -ne 0 -or $_.ProcessName -eq "QQMusic")
  } | Select-Object -First 1)
}

function Test-LyricVeilRunning {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-LyricVeil {
  if (Test-LyricVeilRunning) {
    return
  }

  $command = "`$env:PORT='$Port'; Set-Location '$ProjectRoot'; node server.js"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command `
    -WindowStyle Hidden
}

function Wait-LyricVeil {
  for ($i = 0; $i -lt 20; $i += 1) {
    if (Test-LyricVeilRunning) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

$openedForCurrentQQSession = $false

try {
  while ($true) {
    if (Test-QQMusicRunning) {
      Start-LyricVeil
      if (-not $NoBrowser -and -not $openedForCurrentQQSession -and (Wait-LyricVeil)) {
        Start-Process "http://localhost:$Port/"
        $openedForCurrentQQSession = $true
      }
    } else {
      $openedForCurrentQQSession = $false
    }

    Start-Sleep -Seconds 2
  }
} finally {
  $mutex.ReleaseMutex() | Out-Null
}
