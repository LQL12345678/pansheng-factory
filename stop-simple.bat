@echo off
title Device Management System - Stop

echo ========================================
echo   Stopping Services...
echo ========================================
echo.

echo [1/2] Stopping frontend (port 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    goto :frontend_done
)
:frontend_done

echo [2/2] Stopping backend (port 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    goto :backend_done
)
:backend_done

echo.
echo ========================================
echo   All services stopped!
echo ========================================
echo.
pause
