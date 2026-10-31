@echo off
setlocal
cd /d "%~dp0"

taskkill /f /im RafiqPOS.exe >nul 2>&1

if exist "desktop\bin\Release\RafiqPOS.exe" (
    cd "desktop\bin\Release"
    start "" "RafiqPOS.exe"
    exit /b 0
)

if exist "desktop\bin\Debug\RafiqPOS.exe" (
    cd "desktop\bin\Debug"
    start "" "RafiqPOS.exe"
    exit /b 0
)

echo [ERROR] RafiqPOS.exe not found in desktop\bin\Release or desktop\bin\Debug.
pause
