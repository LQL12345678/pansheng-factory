# 攀升工厂设备管理系统 - 一键备份脚本
# 使用方式：右键 -> 使用PowerShell运行 或 双击运行

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "    攀升工厂设备管理系统 - 一键备份脚本" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 获取当前日期时间
$datetime = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# 设置备份目录
$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    $projectRoot = Get-Location
}
$backupDir = Join-Path $projectRoot "backup"
$backupName = "equipment_system_backup_$datetime"
$backupPath = Join-Path $backupDir $backupName

# 创建备份目录
Write-Host "[1/6] 创建备份目录..." -ForegroundColor Yellow
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}
New-Item -ItemType Directory -Path $backupPath | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupPath "backend") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupPath "frontend") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupPath "database") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupPath "uploads") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupPath "config") | Out-Null
Write-Host "    备份目录已创建" -ForegroundColor Green

# 复制后端代码
Write-Host "[2/6] 备份后端代码..." -ForegroundColor Yellow
$backendSrc = Join-Path $projectRoot "backend"
$backendDst = Join-Path $backupPath "backend"
Copy-Item -Path $backendSrc -Destination $backendDst -Recurse -Force

# 删除node_modules和db减少体积
$nodeModules = Join-Path $backendDst "node_modules"
$dbDir = Join-Path $backendDst "db"
if (Test-Path $nodeModules) { Remove-Item $nodeModules -Recurse -Force }
if (Test-Path $dbDir) { Remove-Item $dbDir -Recurse -Force }
Write-Host "    后端代码已备份（已排除node_modules和db目录）" -ForegroundColor Green

# 复制前端代码
Write-Host "[3/6] 备份前端代码..." -ForegroundColor Yellow
$frontendSrc = Join-Path $projectRoot "frontend"
$frontendDst = Join-Path $backupPath "frontend"
Copy-Item -Path $frontendSrc -Destination $frontendDst -Recurse -Force

# 删除node_modules和dist减少体积
$frontendNodeModules = Join-Path $frontendDst "node_modules"
$frontendDist = Join-Path $frontendDst "dist"
if (Test-Path $frontendNodeModules) { Remove-Item $frontendNodeModules -Recurse -Force }
if (Test-Path $frontendDist) { Remove-Item $frontendDist -Recurse -Force }
Write-Host "    前端代码已备份（已排除node_modules和dist目录）" -ForegroundColor Green

# 导出数据库
Write-Host "[4/6] 导出数据库..." -ForegroundColor Yellow
$dbFile = Join-Path $projectRoot "devices.db"
$sqlFile = Join-Path $backupPath "database\equipment.sql"

if (Test-Path $dbFile) {
    # 创建临时导出脚本
    $exportScriptPath = Join-Path $env:TEMP "export_db.js"
    $projectRootEscaped = $projectRoot -replace '\\', '\\\\'
    $sqlFileEscaped = Join-Path $backupPath "database\equipment.sql" -replace '\\', '\\\\'

    $scriptContent = @"
const DatabaseSync = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new DatabaseSync('$projectRootEscaped\\devices.db');

const tables = ['devices', 'repairs', 'parts', 'inventory_logs', 'maintenance_plans',
                'maintenance_parts', 'tools', 'tool_change_records', 'device_change_records',
                'device_categories', 'repair_parts', 'wechat_notification_logs', 'users'];

let sql = '-- SQLite Database Export\r\n';
sql += '-- Export Date: ' + new Date().toISOString() + '\r\n\r\n';
sql += 'PRAGMA foreign_keys=OFF;\r\n\r\n';

for (const table of tables) {
    try {
        const rows = db.prepare('SELECT * FROM ' + table).all();
        if (rows.length > 0) {
            sql += '-- Table: ' + table + ' (' + rows.length + ' rows)\r\n';
            sql += 'DROP TABLE IF EXISTS ' + table + ';\r\n';
            const createStmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='" + table + "'").get();
            if (createStmt && createStmt.sql) {
                sql += createStmt.sql + ';\r\n';
            }
            for (const row of rows) {
                const cols = Object.keys(row).join(', ');
                const vals = Object.values(row).map(v => {
                    if (v === null) return 'NULL';
                    if (typeof v === 'string') return "'" + v.replace(/'/g, "''") + "'";
                    return v;
                }).join(', ');
                sql += 'INSERT INTO ' + table + ' (' + cols + ') VALUES (' + vals + ');\r\n';
            }
            sql += '\r\n';
        }
    } catch (e) {}
}

fs.writeFileSync('$sqlFileEscaped', sql, 'utf8');
console.log('Database exported: ' + sql.length + ' bytes');
"@

    $scriptContent | Out-File -FilePath $exportScriptPath -Encoding UTF8

    Push-Location (Join-Path $projectRoot "backend")
    try {
        $result = node $exportScriptPath 2>&1
        Write-Host "    $result" -ForegroundColor Green
    } catch {
        Write-Host "    数据库导出失败，将复制原始文件" -ForegroundColor Yellow
        Copy-Item $dbFile (Join-Path $backupPath "database\equipment.db") -Force
    }
    Pop-Location

    # 清理临时文件
    Remove-Item $exportScriptPath -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "    数据库文件不存在，跳过" -ForegroundColor Yellow
}

# 复制上传文件
Write-Host "[5/6] 备份上传文件..." -ForegroundColor Yellow
$uploadsSrc = Join-Path $projectRoot "backend\uploads"
$uploadsDst = Join-Path $backupPath "uploads"
if (Test-Path $uploadsSrc) {
    Copy-Item -Path $uploadsSrc -Destination $uploadsDst -Recurse -Force
    Write-Host "    上传文件已备份" -ForegroundColor Green
} else {
    Write-Host "    上传目录不存在，跳过" -ForegroundColor Gray
}

# 复制配置文件
Write-Host "[6/6] 备份配置文件..." -ForegroundColor Yellow
$envExample = @"
# 环境配置文件
# 请根据实际环境修改以下配置

NODE_ENV=production
PORT=3001
FRONTEND_PORT=5173

# 数据库配置
DB_PATH=./db/equipment.db
"@
$envFile = Join-Path $backupPath "config\env.example"
$envExample | Out-File -FilePath $envFile -Encoding UTF8

# 复制启动脚本
$startBat = Join-Path $projectRoot "start.bat"
$startAllBat = Join-Path $projectRoot "start-all.bat"
if (Test-Path $startBat) { Copy-Item $startBat $backupPath -Force }
if (Test-Path $startAllBat) { Copy-Item $startAllBat $backupPath -Force }
Write-Host "    配置文件已备份" -ForegroundColor Green

# 创建zip压缩包
Write-Host ""
Write-Host "正在创建压缩包..." -ForegroundColor Yellow
$zipPath = Join-Path $backupDir "$datetime.zip"
Compress-Archive -Path "$backupPath\*" -DestinationPath $zipPath -Force

# 清理未压缩的文件夹
Remove-Item $backupPath -Recurse -Force

# 输出结果
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "    备份完成！" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "压缩文件: $zipPath" -ForegroundColor White
$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Host "文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor White
Write-Host ""
Write-Host "备份内容:" -ForegroundColor White
Write-Host "  - backend\      (后端代码)" -ForegroundColor Gray
Write-Host "  - frontend\     (前端代码)" -ForegroundColor Gray
Write-Host "  - database\     (数据库SQL文件)" -ForegroundColor Gray
Write-Host "  - uploads\      (上传文件)" -ForegroundColor Gray
Write-Host "  - config\       (配置文件)" -ForegroundColor Gray
Write-Host ""

$openBackup = Read-Host "是否打开备份目录？ (Y/N)"
if ($openBackup -eq "Y" -or $openBackup -eq "y") {
    Start-Process explorer.exe -ArgumentList $backupDir
}

