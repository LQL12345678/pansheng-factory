@echo off
title Device Management System

netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo ========================================
    echo   Services Already Running!
    echo ========================================
    echo.
    echo   Backend:  http://localhost:3001
    echo   Frontend: http://localhost:5173
    echo.
    echo   Opening browser now...
    echo ========================================
    start http://localhost:5173
    pause
    exit /b
)

echo ========================================
echo   Device Management System - Starting
echo ========================================
echo.

set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"

echo [1/3] Starting backend service...
start "Backend-3001" cmd /k "cd /d %BACKEND_DIR% && "C:\Program Files\nodejs\node.exe" server.js"

timeout /t 3 /nobreak >nul

echo [2/3] Starting frontend service...
start "Frontend-5173" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

timeout /t 5 /nobreak >nul

echo [3/3] Opening browser...
start http://localhost:5173

echo.
echo ========================================
echo   Started Successfully!
echo ========================================
echo.
echo   URL: http://localhost:5173
echo   Login: admin / admin123
echo.
echo   Run stop.bat to stop services
echo ========================================
echo.
pause
