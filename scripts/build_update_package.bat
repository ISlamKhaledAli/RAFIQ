@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_update_package.ps1" %*
exit /b %errorlevel%
