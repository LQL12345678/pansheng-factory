@echo off
chcp 65001 >nul
echo ========================================
echo   攀升工厂设备管理系统 - 服务守护进程
echo ========================================
echo.

set "BACKEND_DIR=C:\Users\Admin\WorkBuddy\2026-05-10-task-1\backend"
set "FRONTEND_DIR=C:\Users\Admin\WorkBuddy\2026-05-10-task-1\frontend"
set "LOG_DIR=C:\Users\Admin\WorkBuddy\2026-05-10-task-1\logs"

:: 确保日志目录存在
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 检查并启动后端 (PM2)
echo [1/2] 检查后端服务...
cd /d "%BACKEND_DIR%"
npx pm2 list | findstr /i "device-backend" >nul
if %errorlevel% neq 0 (
    echo     后端未运行，正在启动...
    npx pm2 start server.js --name device-backend --cwd "%BACKEND_DIR%"
) else (
    echo     后端服务运行中
)

:: 等待后端启动
timeout /t 2 /nobreak >nul

:: 启动前端 (Vite 开发服务器)
echo [2/2] 启动前端服务...
cd /d "%FRONTEND_DIR%"

:: 使用 PowerShell 启动 Vite，忽略 Ctrl+C 信号
powershell -Command "Start-Process -FilePath 'npx.cmd' -ArgumentList 'vite','--host','--port','5173' -WorkingDirectory '%FRONTEND_DIR%' -WindowStyle Hidden -PassThru"

echo.
echo ========================================
echo   服务启动完成！
echo   后端: http://localhost:3001
echo   前端: http://localhost:5173
echo ========================================
echo.
echo 按任意键退出此窗口（服务将继续在后台运行）...
pause >nul
