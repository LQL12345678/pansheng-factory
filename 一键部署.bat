@echo off
chcp 65001 >nul
echo ========================================
echo   攀升工厂设备管理系统 - 一键部署
echo ========================================
echo.
echo [1/3] 检查 Node.js...
node -v 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装！
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js 已安装
echo.
echo [2/3] 安装后端依赖...
cd /d %~dp0backend
call npm install
if %errorlevel% neq 0 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)
echo.
echo [3/3] 安装前端依赖...
cd /d %~dp0frontend
call npm install
if %errorlevel% neq 0 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)
echo.
echo ========================================
echo   部署完成！
echo ========================================
echo.
echo 启动方式:
echo   后端: cd backend ^&^& node server.js
echo   前端: cd frontend ^&^& npm run dev
echo.
echo 或者使用 PM2:
echo   npm install -g pm2
echo   pm2 start ecosystem.config.js
echo.
pause
