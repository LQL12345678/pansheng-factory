@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   攀升工厂设备管理系统 - 服务启动
echo ========================================
echo.

:: 获取脚本所在目录
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend
set FRONTEND_DIR=%SCRIPT_DIR%frontend

:: ===== 清理旧进程 =====
echo [1/5] 清理旧服务...
npx pm2 delete all >nul 2>&1
npx pm2 delete device-backend >nul 2>&1
npx pm2 delete device-frontend >nul 2>&1

:: ===== 清理端口占用 =====
echo [2/5] 清理端口占用...

:: 清理 3001 端口
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo 终止进程 %%a (占用端口 3001)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 清理 5173 端口
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo 终止进程 %%a (占用端口 5173)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 等待端口释放
timeout /t 2 /nobreak >nul

:: ===== 启动后端 =====
echo [3/5] 启动后端服务...
cd /d "%BACKEND_DIR%"
start /b cmd /c "npx pm2 start server.js --name device-backend --cwd "%BACKEND_DIR%" --no-daemon"

:: 等待后端启动
timeout /t 3 /nobreak >nul

:: ===== 启动前端 =====
echo [4/5] 启动前端服务...
cd /d "%FRONTEND_DIR%"
start /b cmd /c "npx vite --host --port 5173 --cwd "%FRONTEND_DIR%""

:: 等待服务启动
timeout /t 5 /nobreak >nul

:: ===== 显示状态 =====
echo [5/5] 检查服务状态...
echo.
echo ========================================
echo   服务状态
echo ========================================
npx pm2 status

echo.
echo ========================================
echo   启动完成！
echo   前端访问: http://localhost:5173
echo   后端API:  http://localhost:3001
echo ========================================
echo.
echo 按任意键退出...
pause >nul
