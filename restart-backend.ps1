Write-Host "========================================"
Write-Host "  攀升设备管理系统 - 后端服务重启"
Write-Host "========================================"
Write-Host ""

# 停止占用3001端口的进程
Write-Host "[1/3] 停止旧服务..."
$port = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($port) {
    $processId = $port.OwningProcess
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Host "  已停止旧进程 (PID: $processId)"
}
Start-Sleep -Seconds 2

# 启动新服务
Write-Host "[2/3] 启动新服务..."
$backendPath = "C:\Users\Admin\WorkBuddy\2026-05-10-task-1\backend"
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $backendPath -NoNewWindow -PassThru | Out-Null

# 等待服务启动
Write-Host "[3/3] 等待服务启动..."
Start-Sleep -Seconds 4

# 检查服务是否启动成功
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/users/check" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host ""
        Write-Host "========================================"
        Write-Host "  ✅ 服务重启成功！"
        Write-Host "  访问地址: http://localhost:3001"
        Write-Host "========================================"
    }
} catch {
    Write-Host ""
        Write-Host "========================================"
        Write-Host "  ❌ 服务启动失败，请检查日志"
        Write-Host "========================================"
}
