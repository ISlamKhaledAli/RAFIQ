@echo off
setlocal
cd /d "%~dp0"

rem 1. Terminate running instance to release file and DB locks
taskkill /f /im RafiqPOS.exe >nul 2>&1

rem 2. Auto-sync latest frontend dist build if present
if exist "frontend\dist" (
    if exist "desktop\bin\Release" (
        xcopy /s /e /y /q "frontend\dist\*" "desktop\bin\Release\dist\" >nul 2>&1
    )
    if exist "desktop\bin\Debug" (
        xcopy /s /e /y /q "frontend\dist\*" "desktop\bin\Debug\dist\" >nul 2>&1
    )
)

rem 3. Launch Release binary (Production)
if exist "desktop\bin\Release\RafiqPOS.exe" (
    cd "desktop\bin\Release"
    start "" "RafiqPOS.exe"
    exit /b 0
)

rem 4. Launch Debug binary (Fallback)
if exist "desktop\bin\Debug\RafiqPOS.exe" (
    cd "desktop\bin\Debug"
    start "" "RafiqPOS.exe"
    exit /b 0
)

echo [ERROR] RafiqPOS.exe not found in desktop\bin\Release or desktop\bin\Debug.
pause
