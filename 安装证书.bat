@echo off
echo 正在安装攀升工厂系统 HTTPS 证书...
certutil -addstore -user Root "%~dp0rootCA.crt"
echo 安装完成！请重启浏览器。
pause
