@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   攀升工厂设备管理系统 - 停止服务
echo ========================================
echo.

:: 停止 PM2 服务
echo [1/3] 停止 PM2 服务...
npx pm2 stop all >nul 2>&1
npx pm2 delete all >nul 2>&1

:: 清理端口占用
echo [2/3] 清理端口占用...

:: 清理 3001 端口
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo 终止进程 %%a (端口 3001)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 清理 5173 端口
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo 终止进程 %%a (端口 5173)...
    taskkill /F /PID %%a >nul 2>&1
)

:: 显示状态
echo [3/3] 检查状态...
echo.
npx pm2 status

echo.
echo ========================================
echo   服务已停止
echo ========================================
pause
