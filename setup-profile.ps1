# 최초 1회 설정: 카페 전용 ego lite 프로필을 정하고, 네이버 로그인 화면을 열어 준다.
#   .\setup-profile.ps1                         새 전용 프로필을 만들고 로그인 화면을 연다 (권장)
#   .\setup-profile.ps1 -ProfileId "Profile 1"  이미 있는 프로필을 쓴다 (그 프로필의 네이버 로그인이 카페 계정이 된다)
#   .\setup-profile.ps1 -SkipLogin              로그인 화면 열기는 생략한다
# 이 스크립트도, 이 도구도 네이버 아이디·비밀번호를 입력하거나 저장하지 않는다. 로그인은 사용자가 직접 한다.
param(
  [string]$ProfileId = "",
  [switch]$SkipLogin
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dir = $PSScriptRoot

$ego = Join-Path $env:USERPROFILE ".local\share\ego\active_version_dir\ego-browser.exe"
if (-not (Test-Path $ego)) { $c = Get-Command ego-browser -ErrorAction SilentlyContinue; if ($c) { $ego = $c.Source } }
if (-not (Test-Path $ego)) { throw "ego-browser를 찾지 못했습니다. ego lite를 먼저 설치하세요 (README 참고)." }
$app = @("$env:ProgramFiles\Citro Labs\ego lite\Application\ego.exe", "$env:LOCALAPPDATA\Citro Labs\ego lite\Application\ego.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $app) { throw "ego lite 실행 파일을 찾지 못했습니다." }

$cfgPath = Join-Path $dir "config.json"
if (-not (Test-Path $cfgPath)) { Copy-Item (Join-Path $dir "config.example.json") $cfgPath }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not (Get-Process -Name ego -ErrorAction SilentlyContinue)) {
  Write-Host "ego lite를 시작합니다..."
  Start-Process -FilePath $app
  Start-Sleep -Seconds 30
}

$userData = Join-Path $env:LOCALAPPDATA "Citro Labs\ego lite\User Data"
if (-not $ProfileId) {
  if ($cfg.profileId) {
    $ProfileId = [string]$cfg.profileId
    Write-Host "config.json에 정해 둔 프로필을 씁니다: $ProfileId"
  } else {
    $nums = @(Get-ChildItem $userData -Directory -Filter "Profile *" -ErrorAction SilentlyContinue | ForEach-Object { [int]($_.Name -replace '\D', '') })
    $next = if ($nums.Count) { ($nums | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    $ProfileId = "Profile $next"
    Write-Host "새 전용 프로필을 만듭니다: $ProfileId  (ego lite 창이 하나 더 열립니다)"
    Start-Process -FilePath $app -ArgumentList ('--profile-directory="{0}"' -f $ProfileId)
    Start-Sleep -Seconds 12
  }
}

$list = (& $ego nodejs -e "console.log(JSON.stringify(await profiles()))" | Out-String)
if ($list -notmatch [regex]::Escape('"id":"' + $ProfileId + '"')) {
  throw "ego lite가 '$ProfileId' 프로필을 인식하지 못했습니다. ego lite를 모두 종료한 뒤 다시 실행해 보세요. (프로필 목록: $list)"
}

# 프로필을 바꾸면 이전 닉네임은 무효이므로 비운다 (check 단계에서 새로 등록)
$nick = [string]$cfg.expectNick; $nid = [string]$cfg.naverId
if ($cfg.profileId -and $cfg.profileId -ne $ProfileId) { $nick = ""; $nid = "" }
$o = [ordered]@{
  cafeId        = $(if ($cfg.cafeId) { $cfg.cafeId } else { 19866392 })
  profileId     = $ProfileId
  expectNick    = $nick
  naverId       = $nid
  taskSpaceName = $(if ($cfg.taskSpaceName) { [string]$cfg.taskSpaceName } else { "cafe like-comment" })
}
[System.IO.File]::WriteAllText($cfgPath, (($o | ConvertTo-Json) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "config.json에 프로필을 저장했습니다: $ProfileId"

if (-not $SkipLogin) {
  $uri = ([System.Uri](Join-Path $dir "open-login.mjs")).AbsoluteUri
  & $ego nodejs -e "await import('$uri')"
}

Write-Host ""
Write-Host "=== 다음 순서 ==="
Write-Host "1) ego lite에서 열린 네이버 로그인 화면에 본인 계정으로 직접 로그인하세요 (최초 1회)."
Write-Host "   반드시 '로그인 상태 유지'를 켜세요. 켜지 않으면 ego lite를 닫을 때 로그인이 사라집니다."
Write-Host "2) 로그인 뒤:  powershell -ExecutionPolicy Bypass -File .\run.ps1 -Mode check   (카페 닉네임 등록)"
Write-Host "3) 확인:       powershell -ExecutionPolicy Bypass -File .\run.ps1 -Mode dry     (아무것도 올리지 않고 대상·문구만 출력)"
Write-Host "4) 매일 자동:  powershell -ExecutionPolicy Bypass -File .\install-schedule.ps1"
