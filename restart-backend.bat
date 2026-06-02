@echo off
chcp 65001 >nul
echo ========================================
echo   攀升设备管理系统 - 后端服务重启
echo ========================================
echo.

:: 停止占用3001端口的进程
echo [1/3] 停止旧服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul

:: 启动新服务（使用系统 Node.js v24，node:sqlite 需要）
echo [2/3] 启动新服务...
cd /d "%~dp0backend"
set "NODE_PATH=C:\Program Files\nodejs"
start "攀升设备管理系统-后端" cmd /c ""C:\Program Files\nodejs\node.exe" server.js"

:: 等待服务启动
echo [3/3] 等待服务启动...
timeout /t 3 /nobreak >nul

:: 检查服务是否启动成功
curl -s http://localhost:3001/api/users/check >nul 2>&1
if %errorlevel%==0 (
    echo.
    echo ========================================
    echo   ✅ 服务重启成功！
    echo   访问地址: http://localhost:3001
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   ❌ 服务启动失败，请检查日志
    echo ========================================
)

pause
