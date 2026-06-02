@echo off
chcp 65001 >nul
echo ========================================
echo   攀升工厂设备管理系统 - 安装依赖
echo ========================================
echo.
echo [1/2] 安装后端依赖...
cd /d %~dp0backend
call npm install
echo.
echo [2/2] 安装前端依赖...
cd /d %~dp0frontend
call npm install
echo.
echo ========================================
echo   依赖安装完成！
echo ========================================
pause
