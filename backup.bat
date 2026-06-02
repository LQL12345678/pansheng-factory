@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ================================================
echo     攀升工厂设备管理系统 - 一键备份脚本
echo ================================================
echo.

REM 获取当前日期时间
set DATETIME=%date:~0,4%-%date:~5,2%-%date:~8,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set DATETIME=%DATETIME: =0%

REM 设置备份目录
set PROJECT_ROOT=%~dp0
set BACKUP_DIR=%PROJECT_ROOT%backup
set BACKUP_NAME=equipment_system_backup_%DATETIME%
set BACKUP_PATH=%BACKUP_DIR%\%BACKUP_NAME%

REM 创建备份目录
echo [1/6] 创建备份目录...
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
mkdir "%BACKUP_PATH%"
mkdir "%BACKUP_PATH%\backend"
mkdir "%BACKUP_PATH%\frontend"
mkdir "%BACKUP_PATH%\database"
mkdir "%BACKUP_PATH%\uploads"
mkdir "%BACKUP_PATH%\config"

REM 复制后端代码
echo [2/6] 备份后端代码...
xcopy /E /I /Y "%PROJECT_ROOT%backend" "%BACKUP_PATH%\backend" >nul 2>&1
REM 删除node_modules减少体积
if exist "%BACKUP_PATH%\backend\node_modules" rmdir /S /Q "%BACKUP_PATH%\backend\node_modules"
if exist "%BACKUP_PATH%\backend\db" rmdir /S /Q "%BACKUP_PATH%\backend\db"
echo      后端代码已备份（已排除node_modules和db目录）

REM 复制前端代码
echo [3/6] 备份前端代码...
xcopy /E /I /Y "%PROJECT_ROOT%frontend" "%BACKUP_PATH%\frontend" >nul 2>&1
REM 删除node_modules和dist减少体积
if exist "%BACKUP_PATH%\frontend\node_modules" rmdir /S /Q "%BACKUP_PATH%\frontend\node_modules"
if exist "%BACKUP_PATH%\frontend\dist" rmdir /S /Q "%BACKUP_PATH%\frontend\dist"
echo      前端代码已备份（已排除node_modules和dist目录）

REM 导出数据库
echo [4/6] 导出数据库...
set DB_FILE=%PROJECT_ROOT%devices.db
set SQL_FILE=%BACKUP_PATH%\database\equipment.sql

REM 使用Node.js导出SQL（兼容性好）
cd /d "%PROJECT_ROOT%"
node -e "
const DatabaseSync = require('better-sqlite3');
const fs = require('fs');
const db = new DatabaseSync('devices.db');
const tables = ['devices', 'repairs', 'parts', 'inventory_logs', 'maintenance_plans', 
                 'maintenance_parts', 'tools', 'tool_change_records', 'device_change_records',
                 'device_categories', 'repair_parts', 'wechat_notification_logs', 'users'];

let sql = '-- SQLite Database Export\n';
sql += '-- Export Date: ' + new Date().toISOString() + '\n\n';
sql += 'PRAGMA foreign_keys=OFF;\n\n';

for (const table of tables) {
  try {
    const rows = db.prepare('SELECT * FROM ' + table).all();
    if (rows.length > 0) {
      sql += '-- Table: ' + table + ' (' + rows.length + ' rows)\n';
      sql += 'DROP TABLE IF EXISTS ' + table + ';\n';
      const createStmt = db.prepare('SELECT sql FROM sqlite_master WHERE type=\"table\" AND name=\"' + table + '\"').get();
      if (createStmt) {
        sql += createStmt.sql + ';\n';
      }
      for (const row of rows) {
        const cols = Object.keys(row).join(', ');
        const vals = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'string') return \"'\" + v.replace(/'/g, \"''\") + \"'\";
          return v;
        }).join(', ');
        sql += 'INSERT INTO ' + table + ' (' + cols + ') VALUES (' + vals + ');\n';
      }
      sql += '\n';
    }
  } catch (e) {
    // 表可能不存在
  }
}

fs.writeFileSync('" + SQL_FILE + "', sql, 'utf8');
console.log('Database exported: ' + sql.length + ' bytes');
"

REM 复制上传文件
echo [5/6] 备份上传文件...
if exist "%PROJECT_ROOT%backend\uploads" (
    xcopy /E /I /Y "%PROJECT_ROOT%backend\uploads" "%BACKUP_PATH%\uploads" >nul 2>&1
    echo      上传文件已备份
) else (
    echo      上传目录不存在，跳过
)

REM 复制配置文件
echo [6/6] 备份配置文件...
REM 环境变量配置
(
echo # 环境配置文件
echo # 请根据实际环境修改以下配置
echo.
echo NODE_ENV=production
echo PORT=3001
echo FRONTEND_PORT=5173
echo.
echo # 数据库配置
echo DB_PATH=./db/equipment.db
) > "%BACKUP_PATH%\config\env.example"

REM 复制启动脚本
if exist "%PROJECT_ROOT%start.bat" xcopy /Y "%PROJECT_ROOT%start.bat" "%BACKUP_PATH%\" >nul
if exist "%PROJECT_ROOT%start-all.bat" xcopy /Y "%PROJECT_ROOT%start-all.bat" "%BACKUP_PATH%\" >nul

REM 创建zip压缩包
echo.
echo 正在创建压缩包...
powershell -command "Compress-Archive -Path '%BACKUP_PATH%\*' -DestinationPath '%BACKUP_DIR%\%DATETIME%.zip' -Force"
if exist "%BACKUP_DIR%\%DATETIME%.zip" (
    echo.
    echo ================================================
    echo     备份完成！
    echo ================================================
    echo.
    echo 备份目录: %BACKUP_PATH%
    echo 压缩文件: %BACKUP_DIR%\%DATETIME%.zip
    echo.
    echo 备份内容:
    echo   - backend\      (后端代码)
    echo   - frontend\     (前端代码)
    echo   - database\     (数据库SQL文件)
    echo   - uploads\      (上传文件)
    echo   - config\       (配置文件)
    echo.
    echo 按任意键打开备份目录...
    pause >nul
    explorer "%BACKUP_DIR%"
) else (
    echo.
    echo [错误] 压缩包创建失败，请检查权限
    pause
)

endlocal
