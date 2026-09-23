@echo off
setlocal EnableDelayedExpansion

:: Elevate privileges if needed
fltmc >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs" 2>nul
    if %ERRORLEVEL% equ 0 exit /b
    echo.
    echo ======================================================================
    echo  Please right-click this file and select "Run as administrator"
    echo ======================================================================
    pause
    exit /b 1
)

title Rafiq POS - Windows 7 Updates Auto-Installer
color 0B

echo ======================================================================
echo    Rafiq POS - Windows 7 Updates Auto-Installer
echo    Mandatory SHA-2 and SSU Updates for Windows 7
echo ======================================================================
echo.

:: Detect architecture using simple goto (avoids CMD parentheses bugs)
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" goto :arch_x64
if "%PROCESSOR_ARCHITEW6432%"=="AMD64" goto :arch_x64
goto :arch_x86

:arch_x64
echo [*] Detected System: Windows 7 (64-bit / x64)
set "ARCH=x64"
goto :find_files

:arch_x86
echo [*] Detected System: Windows 7 (32-bit / x86)
set "ARCH=x86"
goto :find_files

:find_files
set "PATH_KB1="
set "PATH_KB2="

:: 1. Check clean x64 / x86 folders first
if exist "%~dp0%ARCH%\KB4474419.msu" set "PATH_KB1=%~dp0%ARCH%\KB4474419.msu"
if exist "%~dp0%ARCH%\KB4490628.msu" set "PATH_KB2=%~dp0%ARCH%\KB4490628.msu"

:: 2. Fallback recursive search if not set
if not defined PATH_KB1 (
    for /r "%~dp0" %%F in (*KB4474419*%ARCH%*.msu *KB4474419*.msu) do (
        if not defined PATH_KB1 set "PATH_KB1=%%~fF"
    )
)
if not defined PATH_KB2 (
    for /r "%~dp0" %%F in (*KB4490628*%ARCH%*.msu *KB4490628*.msu) do (
        if not defined PATH_KB2 set "PATH_KB2=%%~fF"
    )
)

if not defined PATH_KB1 (
    color 0C
    echo [!] ERROR: Update file KB4474419 not found!
    echo Looked in: %~dp0%ARCH%
    echo Please make sure the update files are in the folder.
    echo.
    pause
    exit /b 1
)

echo.
echo [1/2] Installing Update KB4474419 (SHA-2 Code Signing Support)...
echo       File: %PATH_KB1%
echo       Please wait, this may take 1 to 2 minutes...
start /wait wusa.exe "%PATH_KB1%" /quiet /norestart
echo       [OK] Update KB4474419 finished.

if defined PATH_KB2 (
    echo.
    echo [2/2] Installing Update KB4490628 (Servicing Stack Update)...
    echo       File: %PATH_KB2%
    echo       Please wait...
    start /wait wusa.exe "%PATH_KB2%" /quiet /norestart
    echo       [OK] Update KB4490628 finished.
)

echo.
color 0A
echo ======================================================================
echo   SUCCESS! Windows 7 updates have been installed successfully!
echo ======================================================================
echo.
echo   [!] IMPORTANT NOTICE:
echo   You MUST restart your computer now for the changes to take effect.
echo   After restart, run Rafiq POS Setup or WebView2 installer.
echo ======================================================================
echo.

:: Popup Arabic dialog box so user sees a friendly Arabic message clearly
echo MsgBox "تم تثبيت تحديثات ويندوز 7 بنجاح تام!" ^& vbCrLf ^& vbCrLf ^& "يجب إعادة تشغيل الكمبيوتر (Restart) الآن لتفعيل التحديثات." ^& vbCrLf ^& "بعد إعادة التشغيل، قم بتشغيل مثبت رفيق POS وسيعمل بدون أي أخطاء.", 64, "رفيق POS - اكتمال التحديثات" > "%TEMP%\rafiq_notify.vbs"
cscript //nologo "%TEMP%\rafiq_notify.vbs" >nul 2>&1
del "%TEMP%\rafiq_notify.vbs" >nul 2>&1

set /p RESTART_CHOICE="Do you want to restart your computer now? (Y/N) [y = restart]: "
if /i "%RESTART_CHOICE%"=="Y" (
    echo Restarting computer in 5 seconds...
    shutdown /r /t 5
) else (
    echo Please remember to restart your computer manually before running setup.
    pause
)

exit /b 0
