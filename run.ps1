# 레몬하우스 카페 새 글 좋아요+댓글 실행기 (Windows PowerShell 5.1)
#   .\run.ps1                          실제 실행 (좋아요 + 댓글)
#   .\run.ps1 -Mode dry                대상 글과 댓글 문구만 출력 (아무것도 올리지 않음)
#   .\run.ps1 -Mode one -Article 12345 글 하나만 처리
#   .\run.ps1 -Mode check              로그인 계정 점검 (최초 설정 때 카페 닉네임을 등록)
param(
  [ValidateSet("apply", "dry", "one", "check")][string]$Mode = "apply",
  [int]$Article = 0
)
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dir  = $PSScriptRoot
$log  = Join-Path $dir "run.log"
$lock = Join-Path $dir "run.lock"

function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) -Encoding UTF8 }
function FileUri($name) { ([System.Uri](Join-Path $dir $name)).AbsoluteUri }

$ego = Join-Path $env:USERPROFILE ".local\share\ego\active_version_dir\ego-browser.exe"
if (-not (Test-Path $ego)) { $c = Get-Command ego-browser -ErrorAction SilentlyContinue; if ($c) { $ego = $c.Source } }
if (-not (Test-Path $ego)) { Write-Host "ego-browser를 찾지 못했습니다. ego lite를 먼저 설치하세요 (README 참고)."; exit 1 }
$app = @("$env:ProgramFiles\Citro Labs\ego lite\Application\ego.exe", "$env:LOCALAPPDATA\Citro Labs\ego lite\Application\ego.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not (Test-Path (Join-Path $dir "config.json"))) { Write-Host "config.json이 없습니다. 먼저 setup-profile.ps1을 실행하세요 (README 참고)."; exit 1 }
if ($Mode -eq "one" -and $Article -le 0) { Write-Host "-Mode one 은 -Article <글번호> 가 필요합니다."; exit 1 }

# 한글·공백 경로에서도 되도록 파일 경로를 URL(ASCII)로 넘긴다
$js = switch ($Mode) {
  "dry"   { "globalThis.CAFE_MODE='dry'; await import('$(FileUri 'run.mjs')')" }
  "one"   { "globalThis.CAFE_ONLY=[$Article]; await import('$(FileUri 'run.mjs')')" }
  "check" { "await import('$(FileUri 'check-login.mjs')')" }
  default { "await import('$(FileUri 'run.mjs')')" }
}

function RunOnce {
  $o = (& $ego nodejs -e $js 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" } }) -join "`r`n"
  $script:code = $LASTEXITCODE
  Add-Content -Path $log -Value $o -Encoding UTF8
  Write-Host $o
}

# 이미 실행 중이면(잠금 파일이 60분 이내) 건너뜀. 실제 등록 모드에만 적용
$useLock = $Mode -in @("apply", "one")
if ($useLock -and (Test-Path $lock) -and ((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 60) { Log "skip: already running"; Write-Host "이미 실행 중입니다."; exit 0 }
if ($useLock) { Set-Content -Path $lock -Value $PID }

try {
  Log "start mode=$Mode"
  if (-not (Get-Process -Name ego -ErrorAction SilentlyContinue)) {
    if (-not $app) { Write-Host "ego lite 실행 파일을 찾지 못했습니다."; exit 1 }
    Log "ego lite not running -> starting"
    Start-Process -FilePath $app
    Start-Sleep -Seconds 45
  }
  if ($Mode -eq "apply") {
    # 아무것도 올리지 못하고 멈췄을 때만 5분 뒤 한 번 더 시도 (이중 등록 위험 없음)
    for ($i = 1; $i -le 2; $i++) {
      RunOnce
      Log "attempt $i exit=$code"
      $rep = $null
      try { $rep = Get-Content (Join-Path $dir "last-report.json") -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
      $retry = $rep -and ($rep.status -ne "ok") -and ($rep.liked -eq 0) -and ($rep.commented -eq 0) -and ($rep.status -notlike "WRONG_*") -and ($rep.status -notlike "BLOCKED*") -and ($rep.status -ne "LOGIN_REQUIRED")
      if (-not $retry) { break }
      if ($i -eq 1) { Log "retry in 5 min (status=$($rep.status))"; Start-Sleep -Seconds 300 }
    }
  } else {
    RunOnce
    Log "exit=$code"
  }
  if ($code -ne 0) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "notify.ps1") -Title "Cafe like/comment failed" -Message "ego-browser exit $code. See run.log" | Out-Null
  }
} finally {
  if ($useLock) { Remove-Item $lock -ErrorAction SilentlyContinue }
  Log "end"
}
