# 매일 정해진 시간에 run.ps1을 자동 실행하도록 윈도우 작업 스케줄러에 등록한다 (PC가 꺼져 있었다면 켜질 때 실행).
#   .\install-schedule.ps1                 매일 17:00에 등록
#   .\install-schedule.ps1 -Time 18:30     시간 지정
#   .\install-schedule.ps1 -Remove         등록 해제
param(
  [string]$Time = "17:00",
  [string]$TaskName = "LemonhouseCafeLikeComment",
  [switch]$Remove
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "예약 작업 '$TaskName'을(를) 해제했습니다."
  exit 0
}
$cfg = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $cfg) -or -not ((Get-Content $cfg -Raw -Encoding UTF8) -match '"expectNick"\s*:\s*"[^"]+"')) {
  Write-Host "아직 최초 설정이 끝나지 않았습니다. 먼저 setup-profile.ps1 → 로그인 → run.ps1 -Mode check 를 끝내세요 (README 참고)."
  exit 1
}
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $PSScriptRoot "run.ps1"))
$t = New-ScheduledTaskTrigger -Daily -At $Time
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$p = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Description "레몬하우스 카페 새 글 좋아요+댓글" -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null
$info = Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
Write-Host "예약 완료: 매일 $Time (다음 실행: $($info.NextRunTime)). 이 시간에 PC가 켜져 있고 로그인돼 있어야 하며, 꺼져 있었다면 켜질 때 실행됩니다."
