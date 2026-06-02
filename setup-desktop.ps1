# 攀升工厂设备管理系统 - 桌面图标和开机启动设置
# 使用方法：右键 -> 使用 PowerShell 运行

$Desktop = [Environment]::GetFolderPath("Desktop")
$Startup = [Environment]::GetFolderPath("Startup")
$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatFile = Join-Path $ProjectPath "start-simple.bat"
$ShortcutName = "攀升设备管理系统"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  攀升设备管理系统 - 桌面图标设置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 创建桌面快捷方式
Write-Host "[1/2] 创建桌面快捷方式..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$Desktop\$ShortcutName.lnk")
$Shortcut.TargetPath = $BatFile
$Shortcut.WorkingDirectory = $ProjectPath
$Shortcut.Description = "攀升工厂设备管理系统 - 双击启动"
$Shortcut.Save()

# 设置图标 (使用系统齿轮图标)
$bytes = [System.IO.File]::ReadAllBytes("$Desktop\$ShortcutName.lnk")
$bytes[0x47] = 0x00  # 修改图标索引
[System.IO.File]::WriteAllBytes("$Desktop\$ShortcutName.lnk", $bytes)

Write-Host "      桌面快捷方式已创建: $ShortcutName.lnk" -ForegroundColor Green

# 2. 添加到开机启动
Write-Host "[2/2] 添加到开机自动启动..." -ForegroundColor Yellow
$StartupShortcut = $WshShell.CreateShortcut("$Startup\$ShortcutName.lnk")
$StartupShortcut.TargetPath = $BatFile
$StartupShortcut.WorkingDirectory = $ProjectPath
$StartupShortcut.Description = "攀升工厂设备管理系统 - 开机自动启动"
$StartupShortcut.Save()

Write-Host "      已添加到开机启动项" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  设置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  已完成："
Write-Host "  1. 桌面图标: $ShortcutName.lnk" -ForegroundColor White
Write-Host "  2. 开机自启: 下次开机自动运行" -ForegroundColor White
Write-Host ""
Write-Host "  提示："
Write-Host "  - 双击桌面图标即可启动系统" -ForegroundColor Gray
Write-Host "  - 启动后会自动打开浏览器" -ForegroundColor Gray
Write-Host "  - 登录账号: admin / admin123" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

Start-Sleep -Seconds 2
