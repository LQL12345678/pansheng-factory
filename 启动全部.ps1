# 攀升工厂设备管理系统 - 前后端一键启动
# 使用方法：右键 → 使用 PowerShell 运行

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectDir "backend"
$frontendDir = Join-Path $projectDir "frontend"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$viteJs = Join-Path $frontendDir "node_modules\vite\bin\vite.js"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  攀升工厂设备管理系统 - 全栈启动" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 第一步：清理旧进程
Write-Host "[1/5] 清理旧服务..." -ForegroundColor Yellow
$pids = (netstat -ano | Select-String ':3001|:5173' | Select-String 'LISTENING') -replace '.*LISTENING\s+', '' | Where-Object { $_ -match '^\d+$' }
foreach ($p in $pids) { 
    taskkill /F /PID $p 2>&1 | Out-Null
}
Start-Sleep -Seconds 2
Write-Host "  已清理" -ForegroundColor Green
Write-Host ""

# 第二步：启动后端
Write-Host "[2/5] 启动后端 (端口 3001)..." -ForegroundColor Yellow
Start-Process -FilePath $nodeExe -ArgumentList "server.js" -WorkingDirectory $backendDir -WindowStyle Minimized

do { Start-Sleep -Milliseconds 500 } while (-not (netstat -ano | Select-String ':3001' | Select-String 'LISTENING'))
Write-Host "  后端就绪 ✓" -ForegroundColor Green
Write-Host ""

# 第三步：启动前端
Write-Host "[3/5] 启动前端 (端口 5173)..." -ForegroundColor Yellow
Start-Process -FilePath $nodeExe -ArgumentList $viteJs,"--host","--port","5173" -WorkingDirectory $frontendDir -WindowStyle Minimized

do { Start-Sleep -Milliseconds 500 } while (-not (netstat -ano | Select-String ':5173' | Select-String 'LISTENING'))
Write-Host "  前端就绪 ✓" -ForegroundColor Green
Write-Host ""

# 第四步：打开浏览器
Write-Host "[4/5] 打开浏览器..." -ForegroundColor Yellow
Start-Process "http://localhost:5173"
Write-Host ""

# 完成
Write-Host "[5/5] 全部启动完成！" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  前端: http://localhost:5173" -ForegroundColor White
Write-Host "  后端: http://localhost:3001" -ForegroundColor White
Write-Host "  账号: admin / admin123" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
