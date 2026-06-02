# 攀升工厂设备管理系统 - 停止脚本
# 使用方法：双击运行此文件 或 右键 -> 使用 PowerShell 运行

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  攀升工厂设备管理系统 - 停止服务" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 关闭前端服务 (端口 5173)
Write-Host "[1/2] 停止前端服务..." -ForegroundColor Yellow
$frontend = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($frontend) {
    Stop-Process -Id $frontend.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "      前端服务已停止" -ForegroundColor Green
} else {
    Write-Host "      前端服务未运行" -ForegroundColor Gray
}

# 2. 关闭后端服务 (端口 3001)
Write-Host "[2/2] 停止后端服务..." -ForegroundColor Yellow
$backend = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($backend) {
    Stop-Process -Id $backend.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "      后端服务已停止" -ForegroundColor Green
} else {
    Write-Host "      后端服务未运行" -ForegroundColor Gray
}

# 额外清理：关闭相关 node 进程
Write-Host ""
Write-Host "[清理] 关闭残留进程..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  服务已全部停止" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  如需重新启动，请运行 start.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

Start-Sleep -Seconds 1
