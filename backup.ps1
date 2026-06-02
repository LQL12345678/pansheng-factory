$ErrorActionPreference = "Stop"

Write-Host "================================================"
Write-Host "    攀升工厂设备管理系统 - 一键备份脚本"
Write-Host "================================================"
Write-Host ""

$datetime = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $projectRoot) { $projectRoot = $PWD.Path }
$backupDir = Join-Path $projectRoot "backup"
$backupPath = Join-Path $backupDir "temp_backup_$datetime"

Write-Host "[1/6] 创建备份目录..."
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
Write-Host "    完成"

Write-Host "[2/6] 备份后端代码..."
$backendDst = Join-Path $backupPath "backend"
Copy-Item (Join-Path $projectRoot "backend") $backendDst -Recurse -Force
$nodeModules = Join-Path $backendDst "node_modules"
$dbDir = Join-Path $backendDst "db"
if (Test-Path $nodeModules) { Remove-Item $nodeModules -Recurse -Force }
if (Test-Path $dbDir) { Remove-Item $dbDir -Recurse -Force }
Write-Host "    完成（已排除node_modules和db目录）"

Write-Host "[3/6] 备份前端代码..."
$frontendDst = Join-Path $backupPath "frontend"
Copy-Item (Join-Path $projectRoot "frontend") $frontendDst -Recurse -Force
$feNodeModules = Join-Path $frontendDst "node_modules"
$feDist = Join-Path $frontendDst "dist"
if (Test-Path $feNodeModules) { Remove-Item $feNodeModules -Recurse -Force }
if (Test-Path $feDist) { Remove-Item $feDist -Recurse -Force }
Write-Host "    完成（已排除node_modules和dist目录）"

Write-Host "[4/6] 导出数据库..."
$dbFile = Join-Path $projectRoot "devices.db"
$dbDst = Join-Path $backupPath "database"
New-Item -ItemType Directory -Path $dbDst -Force | Out-Null

if (Test-Path $dbFile) {
    Copy-Item $dbFile (Join-Path $dbDst "equipment.db") -Force
    Write-Host "    数据库文件已复制"
} else {
    Write-Host "    数据库文件不存在"
}

Write-Host "[5/6] 备份上传文件..."
$uploadsSrc = Join-Path $projectRoot "backend\uploads"
$uploadsDst = Join-Path $backupPath "uploads"
if (Test-Path $uploadsSrc) {
    Copy-Item $uploadsSrc $uploadsDst -Recurse -Force
    Write-Host "    完成"
} else {
    Write-Host "    上传目录不存在，跳过"
}

Write-Host "[6/6] 备份配置文件..."
$configDst = Join-Path $backupPath "config"
New-Item -ItemType Directory -Path $configDst -Force | Out-Null
$envContent = @"
# 环境配置
NODE_ENV=production
PORT=3001
FRONTEND_PORT=5173
DB_PATH=./db/equipment.db
"@
$envContent | Out-File (Join-Path $configDst "env.example") -Encoding UTF8

$startBat = Join-Path $projectRoot "start.bat"
if (Test-Path $startBat) { Copy-Item $startBat $backupPath -Force }
Write-Host "    完成"

Write-Host ""
Write-Host "正在创建压缩包..."
$zipPath = Join-Path $backupDir "$datetime.zip"
Compress-Archive -Path "$backupPath\*" -DestinationPath $zipPath -Force
Remove-Item $backupPath -Recurse -Force

Write-Host ""
Write-Host "================================================"
Write-Host "    备份完成！"
Write-Host "================================================"
Write-Host ""
Write-Host "压缩文件: $zipPath"
$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Host "文件大小: $([math]::Round($fileSize, 2)) MB"
Write-Host ""
Write-Host "按任意键打开备份目录..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Start-Process explorer.exe -ArgumentList $backupDir
