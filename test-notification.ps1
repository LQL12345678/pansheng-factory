# 登录获取会话
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3001/api/users/login" -Method POST -ContentType "application/json" -Body $body -SessionVariable session
Write-Host "登录结果:"
$loginResult | ConvertTo-Json

# 获取通知配置
Write-Host "`n=== 获取通知配置 ==="
$config = Invoke-RestMethod -Uri "http://localhost:3001/api/notifications/config" -WebSession $session
$config | ConvertTo-Json -Depth 5

# 发送测试通知
Write-Host "`n=== 发送测试通知 ==="
$testResult = Invoke-RestMethod -Uri "http://localhost:3001/api/notifications/test" -Method POST -WebSession $session
$testResult | ConvertTo-Json
