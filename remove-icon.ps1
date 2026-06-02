# 攀升设备管理系统 - 移除桌面图标和开机启动
# 使用方法：右键 -> 使用 PowerShell 运行

$Desktop = [Environment]::GetFolderPath("Desktop")
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutName = "攀升设备管理系统"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  攀升设备管理系统 - 移除设置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 删除桌面快捷方式
Write-Host "[1/2] 删除桌面快捷方式..." -ForegroundColor Yellow
$DesktopShortcut = "$Desktop\$ShortcutName.lnk"
if (Test-Path $DesktopShortcut) {
    Remove-Item $DesktopShortcut -Force
    Write-Host "      已删除桌面图标" -ForegroundColor Green
} else {
    Write-Host "      桌面图标不存在" -ForegroundColor Gray
}

# 2. 删除开机启动
Write-Host "[2/2] 删除开机自动启动..." -ForegroundColor Yellow
$StartupShortcut = "$Startup\$ShortcutName.lnk"
if (Test-Path $StartupShortcut) {
    Remove-Item $StartupShortcut -Force
    Write-Host "      已删除开机启动项" -ForegroundColor Green
} else {
    Write-Host "      开机启动项不存在" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  移除完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2
