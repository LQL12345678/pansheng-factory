@echo off
chcp 65001 >nul
echo ========================================
echo   攀升工厂设备管理系统 - 启动服务
echo ========================================
echo.
echo [1/2] 启动后端服务 (端口 3001)...
cd /d %~dp0backend
start "攀升设备后端" cmd /k "node server.js"
echo [OK] 后端服务已启动
echo.
echo [2/2] 启动前端服务 (端口 5173)...
cd /d %~dp0frontend
start "攀升设备前端" cmd /k "npm run dev"
echo [OK] 前端服务已启动
echo.
timeout /t 3 >nul
echo ========================================
echo   服务启动中...
echo   后端: http://localhost:3001
echo   前端: http://localhost:5173
echo ========================================
echo.
echo 提示: 关闭此窗口不会停止服务
echo       如需停止，请关闭对应的命令窗口
pause
