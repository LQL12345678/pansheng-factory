# 攀升工厂设备管理系统 - 一键启动脚本
# 使用方法：双击运行此文件 或 右键 -> 使用 PowerShell 运行

$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  攀升工厂设备管理系统 - 启动中" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPath = Join-Path $ProjectPath "backend"
$FrontendPath = Join-Path $ProjectPath "frontend"

# 1. 启动后端
Write-Host "[1/3] 启动后端服务..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    node server.js
} -ArgumentList $BackendPath

Write-Host "      后端启动中 (端口 3001)..." -ForegroundColor Gray

# 2. 等待后端启动
Start-Sleep -Seconds 3

# 3. 启动前端
Write-Host "[2/3] 启动前端服务..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    npm run dev
} -ArgumentList $FrontendPath

Write-Host "      前端启动中 (端口 5173)..." -ForegroundColor Gray

# 4. 等待前端启动
Start-Sleep -Seconds 5

# 5. 打开浏览器
Write-Host "[3/3] 打开浏览器..." -ForegroundColor Yellow
Start-Process "http://localhost:5173"

# 完成提示
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  启动完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  请在浏览器中访问: http://localhost:5173" -ForegroundColor White
Write-Host "  登录账号: admin / admin123" -ForegroundColor White
Write-Host ""
Write-Host "  提示: 保持此窗口打开，服务在后台运行" -ForegroundColor Gray
Write-Host "  如需停止服务，请运行 stop.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 等待后台任务
Write-Host "服务运行中，按 Ctrl+C 可查看状态..." -ForegroundColor Gray
Receive-Job -Job $backendJob, $frontendJob -Wait
