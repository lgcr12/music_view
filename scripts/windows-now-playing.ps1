$ErrorActionPreference = "Stop"

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class QQMusicWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
'@

$processes = Get-Process QQMusic -ErrorAction SilentlyContinue
if (-not $processes) {
  [pscustomobject]@{
    found = $false
    message = "QQMusic is not running."
  } | ConvertTo-Json -Compress
  exit 0
}

$candidates = New-Object System.Collections.Generic.List[object]

foreach ($process in $processes) {
  $targetPid = $process.Id
  $callback = [QQMusicWindows+EnumWindowsProc]{
    param($hWnd, $lParam)

    $windowPid = 0
    [QQMusicWindows]::GetWindowThreadProcessId($hWnd, [ref]$windowPid) | Out-Null
    if ($windowPid -ne $targetPid) {
      return $true
    }

    $length = [QQMusicWindows]::GetWindowTextLength($hWnd)
    $buffer = New-Object System.Text.StringBuilder ($length + 1)
    [QQMusicWindows]::GetWindowText($hWnd, $buffer, $buffer.Capacity) | Out-Null
    $title = $buffer.ToString().Trim()

    if (-not $title) {
      return $true
    }

    if ($title -like "QQMusic*") {
      return $true
    }

    if ($title -like "QQMusic_*") {
      return $true
    }

    if ($title -eq "DynamicLyricWindow" -or $title -eq "Default IME" -or $title -eq "MSCTFIME UI" -or $title -eq "TipWindow") {
      return $true
    }

    $visible = [QQMusicWindows]::IsWindowVisible($hWnd)
    $score = 0
    if ($visible) {
      $score += 100
    }
    if ($title -match '\s-\s') {
      $score += 1000
    }
    if ($title.Length -ge 6) {
      $score += 100
    }

    $candidates.Add([pscustomobject]@{
      title = $title
      visible = $visible
      score = $score
    }) | Out-Null

    return $true
  }

  [QQMusicWindows]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
}

$best = $candidates |
  Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "title"; Descending = $false } |
  Select-Object -First 1

if (-not $best) {
  [pscustomobject]@{
    found = $false
    message = "QQMusic is running, but no usable window title was found."
  } | ConvertTo-Json -Compress
  exit 0
}

[pscustomobject]@{
  found = $true
  rawBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($best.title))
} | ConvertTo-Json -Compress
