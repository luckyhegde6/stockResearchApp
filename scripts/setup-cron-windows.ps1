# PowerShell Script: Windows Task Scheduler Registration for Stock Research Pipeline

$WorkDir = Get-Location
$TaskName = "StockResearchPipeline_MarketScans"
$ScriptPath = "$WorkDir\scripts\cron-scheduler.ts"

Write-Host "Registering Windows Task Scheduler Job for Stock Research Pipeline..." -ForegroundColor Cyan

$Action = New-ScheduledTaskAction -Execute "npx" -Argument "tsx $ScriptPath" -WorkingDirectory $WorkDir
$Trigger = New-ScheduledTaskTrigger -Daily -At 16:00PM

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Description "Runs automated market scans and configured screeners for stock research pipeline" -User $env:USERNAME

Write-Host "Task '$TaskName' registered successfully!" -ForegroundColor Green
Write-Host "To verify, open Task Scheduler or run: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
