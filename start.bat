@echo off
chcp 65001 >nul
title 攀升工厂设备管理系统

echo ========================================
echo   攀升工厂设备管理系统 - 启动中
echo ========================================
echo.

:: 检查端口是否已被占用
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo [警告] 后端端口 3001 已被占用，可能服务已在运行
    echo.
)

:: 启动后端服务
echo [1/3] 启动后端服务...
cd /d %~dp0backend
start /b cmd /c "title 后端服务 && node server.js"
echo       后端启动中 (端口 3001)...

:: 等待后端启动
timeout /t 3 /nobreak >nul

:: 启动前端服务
echo [2/3] 启动前端服务...
cd /d %~dp0frontend
start /b cmd /c "title 前端服务 && npm run dev"
echo       前端启动中 (端口 5173)...

:: 等待前端启动
timeout /t 5 /nobreak >nul

:: 自动打开浏览器
echo [3/3] 打开浏览器...
start http://localhost:5173

:: 完成提示
echo.
echo ========================================
echo   启动完成！
echo ========================================
echo.
echo   请在浏览器中访问: http://localhost:5173
echo   登录账号: admin / admin123
echo.
echo   提示: 关闭此窗口不会停止服务
echo   如需停止服务，请双击运行 stop.bat
echo.
echo ========================================
pause
