@echo off
chcp 65001 >nul
echo ========================================
echo   攀升工厂设备管理系统 - 全量备份工具
echo ========================================
echo.

set BACKUP_DIR=%~dp0backup_full
set DATE=%date:~0,4%%date:~5,2%%date:~8,2%
set TIME2=%time:~0,2%%time:~3,2%%time:~6,2%
set DATETIME=%DATE%_%TIME2%
set ZIP_NAME=攀升设备管理系统_全量备份_%DATETIME%.zip
set PROJECT_ROOT=%~dp0

echo [1/5] 创建备份目录...
if exist "%BACKUP_DIR%" rd /s /q "%BACKUP_DIR%"
mkdir "%BACKUP_DIR%"
mkdir "%BACKUP_DIR%\backend"
mkdir "%BACKUP_DIR%\frontend"
mkdir "%BACKUP_DIR%\logs"
mkdir "%BACKUP_DIR%\db_backup"

echo.
echo [2/5] 复制后端源码（排除node_modules）...
xcopy "%PROJECT_ROOT%backend\*.js" "%BACKUP_DIR%\backend\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%backend\package*.json" "%BACKUP_DIR%\backend\" /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%backend\middleware" "%BACKUP_DIR%\backend\middleware\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%backend\routes" "%BACKUP_DIR%\backend\routes\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%backend\services" "%BACKUP_DIR%\backend\services\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%backend\uploads" "%BACKUP_DIR%\backend\uploads\" /e /y /q >nul 2>&1

echo.
echo [3/5] 复制前端源码（排除node_modules）...
xcopy "%PROJECT_ROOT%frontend\src" "%BACKUP_DIR%\frontend\src\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%frontend\public" "%BACKUP_DIR%\frontend\public\" /e /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%frontend\package*.json" "%BACKUP_DIR%\frontend\" /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%frontend\vite.config.*" "%BACKUP_DIR%\frontend\" /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%frontend\index.html" "%BACKUP_DIR%\frontend\" /y /q >nul 2>&1
xcopy "%PROJECT_ROOT%frontend\tsconfig*.json" "%BACKUP_DIR%\frontend\" /y /q >nul 2>&1

echo.
echo [4/5] 复制数据库和配置文件...
copy "%PROJECT_ROOT%backend\db\equipment.db" "%BACKUP_DIR%\db_backup\" /y >nul 2>&1
copy "%PROJECT_ROOT%devices.db" "%BACKUP_DIR%\db_backup\" /y >nul 2>&1
copy "%PROJECT_ROOT%ecosystem.config.js" "%BACKUP_DIR%\" /y >nul 2>&1
copy "%PROJECT_ROOT%ENVIRONMENT.md" "%BACKUP_DIR%\" /y >nul 2>&1
copy "%PROJECT_ROOT%RESTORE_GUIDE.md" "%BACKUP_DIR%\" /y >nul 2>&1
xcopy "%PROJECT_ROOT%generated-images" "%BACKUP_DIR%\generated-images\" /e /y /q >nul 2>&1

echo.
echo [5/5] 创建部署脚本...
call :create_deploy_script

echo.
echo ========================================
echo   开始压缩打包...
echo ========================================
echo.

powershell -Command "Compress-Archive -Path '%BACKUP_DIR%\*' -DestinationPath '%PROJECT_ROOT%%ZIP_NAME%' -Force"

echo.
echo [完成] 备份文件已生成！
echo.
echo 文件位置: %PROJECT_ROOT%%ZIP_NAME%
echo.

rem 清理备份目录
rd /s /q "%BACKUP_DIR%"

echo 按任意键退出...
pause >nul
exit /b

:create_deploy_script
(
echo @echo off
echo chcp 65001 ^>nul
echo.
echo ========================================
echo   攀升工厂设备管理系统 - 一键部署
echo ========================================
echo.
echo [1/3] 检查 Node.js...
echo node -v 2^>nul
echo if %%errorlevel%% neq 0 ^(
echo     echo [错误] 未检测到 Node.js，请先安装！
echo     echo 下载地址: https://nodejs.org/
echo     pause
echo     exit /b 1
echo ^)
echo.
echo [2/3] 安装后端依赖...
echo cd /d %%~dp0backend
echo npm install
echo.
echo [3/3] 安装前端依赖...
echo cd /d %%~dp0frontend
echo npm install
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
echo   pm2 start ecosystem.config.js
echo.
echo 按任意键退出...
echo pause ^>nul
)>"%BACKUP_DIR%\一键部署.bat"

(
echo @echo off
echo chcp 65001 ^>nul
echo.
echo ========================================
echo   攀升工厂设备管理系统 - 启动服务
echo ========================================
echo.
echo [1/2] 启动后端服务 ^(端口 3001^)...
echo cd /d %%~dp0backend
echo start "攀升设备后端" cmd /k "node server.js"
echo.
echo [2/2] 启动前端服务 ^(端口 5173^)...
echo cd /d %%~dp0frontend
echo start "攀升设备前端" cmd /k "npm run dev"
echo.
echo ========================================
echo   服务启动中...
echo   后端: http://localhost:3001
echo   前端: http://localhost:5173
echo ========================================
echo.
echo 按任意键退出...
echo pause ^>nul
)>"%BACKUP_DIR%\启动服务.bat"

(
echo @echo off
echo chcp 65001 ^>nul
echo.
echo ========================================
echo   攀升工厂设备管理系统 - 安装依赖
echo ========================================
echo.
echo [1/2] 安装后端依赖...
echo cd /d %%~dp0backend
echo npm install
echo.
echo [2/2] 安装前端依赖...
echo cd /d %%~dp0frontend
echo npm install
echo.
echo ========================================
echo   依赖安装完成！
echo ========================================
echo.
echo 按任意键退出...
echo pause ^>nul
)>"%BACKUP_DIR%\安装依赖.bat"

(
echo # 攀升工厂设备管理系统
echo.
echo ## 系统要求
echo - Node.js 18.x 或更高
echo - Windows 10/11 或 macOS 10.14+
echo.
echo ## 快速部署
echo.
echo ### Windows
echo 1. 双击运行『一键部署.bat』等待依赖安装完成
echo 2. 双击运行『启动服务.bat』
echo 3. 访问 http://localhost:5173
echo.
echo ### macOS/Linux
echo ~~~bash
echo # 安装后端依赖
echo cd backend
echo npm install
echo.
echo # 安装前端依赖
echo cd ../frontend
echo npm install
echo.
echo # 启动后端
echo cd ../backend
echo node server.js ^&
echo.
echo # 启动前端
echo cd ../frontend
echo npm run dev
echo ~~~
echo.
echo ## 端口说明
echo - 后端API: http://localhost:3001
echo - 前端界面: http://localhost:5173
echo.
echo ## 数据文件
echo - 数据库位置: backend/db/equipment.db
echo - 原始数据备份: db_backup/
echo.
echo ## 注意事项
echo 1. 首次部署需要安装依赖
echo 2. 数据库包含完整业务数据
echo 3. 如需修改端口，编辑 backend/server.js 和 frontend/vite.config.ts
)>"%BACKUP_DIR%\部署说明.md"

(
echo # 攀升工厂设备管理系统 - 部署恢复指南
echo.
echo ## 概述
echo 本系统包含完整的设备维修管理功能，支持设备台账、维修工单、工具管理、备件管理等功能。
echo.
echo ## 快速部署步骤
echo.
echo ### 步骤1: 解压备份文件
echo 将zip文件解压到目标电脑任意目录，建议路径不包含中文和空格。
echo.
echo ### 步骤2: 安装依赖
echo 方案A: 双击运行『一键部署.bat』
echo 方案B: 手动安装
echo ~~~bash
echo cd backend
echo npm install
echo.
echo cd ../frontend
echo npm install
echo ~~~
echo.
echo ### 步骤3: 启动服务
echo 方案A: 双击运行『启动服务.bat』
echo 方案B: 手动启动
echo ~~~bash
echo # 终端1 - 后端
echo cd backend
echo node server.js
echo.
echo # 终端2 - 前端
echo cd frontend
echo npm run dev
echo ~~~
echo.
echo ### 步骤4: 访问系统
echo 打开浏览器访问: http://localhost:5173
echo.
echo ## 数据恢复
echo.
echo ### 自动恢复
echo 数据库文件已包含在备份包中（backend/db/equipment.db），解压后即可使用。
echo.
echo ### 手动恢复
echo 如需恢复其他数据库：
echo 1. 停止后端服务
echo 2. 将数据库文件复制到 backend/db/equipment.db
echo 3. 重启后端服务
echo.
echo ## 目录结构
echo ~~~
echo ^|^|___一键部署.bat      # 部署脚本
echo ^|^|___启动服务.bat      # 启动脚本
echo ^|^|___安装依赖.bat      # 仅安装依赖
echo ^|^|___部署说明.md       # 部署说明
echo ^|^|___backend/          # 后端服务
echo ^|^|   ^|^|___server.js  # 主入口
echo ^|^|   ^|^|___db/        # 数据库目录
echo ^|^|   ^|^|___routes/    # 路由
echo ^|^|   ^|^|___services/ # 服务
echo ^|^|   ^|^|___uploads/   # 上传文件
echo ^|^|   ^|^|___package.json
echo ^|^|___frontend/         # 前端应用
echo ^|^|   ^|^|___src/       # 源码
echo ^|^|   ^|^|___public/    # 静态资源
echo ^|^|   ^|^|___package.json
echo ^|^|___db_backup/        # 数据库备份
echo ~~~
echo.
echo ## 常见问题
echo.
echo ### Q: npm install 失败？
echo A: 确保 Node.js 版本为 18.x 或更高，运行 node -v 查看版本。
echo.
echo ### Q: 端口被占用？
echo A: 修改以下文件中的端口:
echo    - backend/server.js: PORT
echo    - frontend/vite.config.ts: server.port
echo.
echo ### Q: 数据库错误？
echo A: 检查 backend/db/equipment.db 是否存在且可读。
echo.
echo ### Q: 前端无法连接后端？
echo A: 检查后端是否正常运行，端口3001是否可访问。
echo.
echo ## 技术栈
echo - 后端: Node.js + Express + SQLite
echo - 前端: React + TypeScript + Ant Design
echo - 构建: Vite
)>"%BACKUP_DIR%\恢复部署指南.md"

exit /b
