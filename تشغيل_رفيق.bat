@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 > nul
title Rafiq POS - Desktop Application Launcher

rem =====================================================================
rem   Rafiq POS - Desktop Launcher and Manager
rem   Designed for all systems from Windows 7 SP1 to Windows 11
rem =====================================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"

rem ---------------------------------------------------------------------
rem  1. Parse Command Line Arguments
rem ---------------------------------------------------------------------
set "ARG=%~1"
if /i "%ARG%"=="build"    goto :do_rebuild_all
if /i "%ARG%"=="-b"       goto :do_rebuild_all
if /i "%ARG%"=="--build"  goto :do_rebuild_all
if /i "%ARG%"=="rebuild"  goto :do_rebuild_all

if /i "%ARG%"=="quick"    goto :do_fast_launch
if /i "%ARG%"=="fast"     goto :do_fast_launch
if /i "%ARG%"=="-q"       goto :do_fast_launch
if /i "%ARG%"=="--quick"  goto :do_fast_launch

if /i "%ARG%"=="front"    goto :do_build_frontend
if /i "%ARG%"=="frontend" goto :do_build_frontend
if /i "%ARG%"=="-f"       goto :do_build_frontend
if /i "%ARG%"=="--front"  goto :do_build_frontend

if /i "%ARG%"=="dev"      goto :do_dev_mode
if /i "%ARG%"=="-d"       goto :do_dev_mode
if /i "%ARG%"=="--dev"    goto :do_dev_mode

if /i "%ARG%"=="reset"    goto :do_reset

if /i "%ARG%"=="help"     goto :show_help
if /i "%ARG%"=="-h"       goto :show_help
if /i "%ARG%"=="--help"   goto :show_help
if /i "%ARG%"=="/?"       goto :show_help

rem ---------------------------------------------------------------------
rem  2. Check existing executable binary
rem ---------------------------------------------------------------------
set "BIN_EXISTS=0"
if exist "%ROOT%desktop\bin\Release\RafiqPOS.exe" set "BIN_EXISTS=1"
if exist "%ROOT%desktop\bin\Debug\RafiqPOS.exe" set "BIN_EXISTS=1"

if "%BIN_EXISTS%"=="0" (
    echo ======================================================================
    echo   [NOTE] RafiqPOS.exe not found in desktop\bin\Release or Debug.
    echo   Automatically starting full project build [Frontend + C#]...
    echo ======================================================================
    echo.
    goto :do_rebuild_all
)

rem ---------------------------------------------------------------------
rem  3. Interactive Main Menu
rem ---------------------------------------------------------------------
:show_menu
cls
echo ======================================================================
echo                 Rafiq POS - Desktop Launcher and Manager
echo         Windows 7 SP1 .. Windows 11 - Offline Desktop POS System
echo ======================================================================
echo.
echo   [1] Fast Launch (Default)
echo       - Launch current application immediately with dist sync.
echo.
echo   [2] Full Rebuild and Launch (Frontend + C#)
echo       - Rebuild React UI (Vite) + compile C# (Release and Debug) + Run.
echo.
echo   [3] Frontend Only Rebuild and Launch
echo       - Rebuild React UI (Vite) + sync dist + Run.
echo.
echo   [4] Developer Mode (Vite Dev Server)
echo       - Start live development server in browser (npm run dev).
echo.
echo   [5] Reset System Data
echo       - Reset local databases and temporary cache to factory defaults.
echo.
echo   [0] Exit
echo.
echo ======================================================================

set "USER_CHOICE=1"
set /p "USER_CHOICE=Select an option [0-5] and press Enter (Default: 1): "

if "%USER_CHOICE%"=="1" goto :do_fast_launch
if "%USER_CHOICE%"=="2" goto :do_rebuild_all
if "%USER_CHOICE%"=="3" goto :do_build_frontend
if "%USER_CHOICE%"=="4" goto :do_dev_mode
if "%USER_CHOICE%"=="5" goto :do_reset
if "%USER_CHOICE%"=="0" exit /b 0

if "%USER_CHOICE:~0,1%"=="1" goto :do_fast_launch
if "%USER_CHOICE:~0,1%"=="2" goto :do_rebuild_all
if "%USER_CHOICE:~0,1%"=="3" goto :do_build_frontend
if "%USER_CHOICE:~0,1%"=="4" goto :do_dev_mode
if "%USER_CHOICE:~0,1%"=="5" goto :do_reset
if "%USER_CHOICE:~0,1%"=="0" exit /b 0

echo [Invalid option. Please enter a number between 0 and 5]
timeout /t 2 /nobreak >nul 2>&1 || ping -n 3 127.0.0.1 >nul 2>&1
goto :show_menu

rem ---------------------------------------------------------------------
rem  Action 1: Fast Launch
rem ---------------------------------------------------------------------
:do_fast_launch
echo.
echo [1/2] Terminating any running instances to release file/DB locks...
taskkill /f /im RafiqPOS.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

echo [2/2] Synchronizing frontend assets to desktop bin...
call :sync_dist

if exist "%ROOT%desktop\bin\Release\RafiqPOS.exe" (
    echo.
    echo Launching Rafiq POS [Release]...
    cd /d "%ROOT%desktop\bin\Release"
    start "" "RafiqPOS.exe"
    exit /b 0
)

if exist "%ROOT%desktop\bin\Debug\RafiqPOS.exe" (
    echo.
    echo Launching Rafiq POS [Debug]...
    cd /d "%ROOT%desktop\bin\Debug"
    start "" "RafiqPOS.exe"
    exit /b 0
)

echo.
echo [ERROR] RafiqPOS.exe not found in desktop\bin\Release or Debug.
pause
exit /b 1

rem ---------------------------------------------------------------------
rem  Action 2: Full Rebuild and Launch
rem ---------------------------------------------------------------------
:do_rebuild_all
echo.
echo ======================================================================
echo                Starting Full System Rebuild and Launch...
echo ======================================================================
echo.

rem Terminate running instances
taskkill /f /im RafiqPOS.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

rem Detect build tools
call :detect_tools || goto :on_build_error

rem Check frontend node_modules
if not exist "%ROOT%frontend\node_modules" (
    echo [NOTE] frontend\node_modules not found. Running npm install...
    cd /d "%ROOT%frontend"
    call "%NPM_CMD%" install
    if errorlevel 1 goto :on_npm_error
    cd /d "%ROOT%"
)

rem Build frontend UI
echo.
echo [1/3] Building React Frontend [Vite]...
cd /d "%ROOT%frontend"
call "%NPM_CMD%" run build
if errorlevel 1 goto :on_npm_error
cd /d "%ROOT%"

if not exist "%ROOT%frontend\dist\index.html" (
    echo [ERROR] frontend\dist\index.html was not generated.
    goto :on_build_error
)

rem Restore NuGet packages if needed
if not exist "%ROOT%desktop\packages" (
    if defined NUGET_CMD (
        echo.
        echo [NOTE] Restoring NuGet packages...
        "%NUGET_CMD%" restore "%ROOT%desktop\RafiqPOS.csproj" -PackagesDirectory "%ROOT%desktop\packages" -NonInteractive
    )
)

rem Compile C# Release
echo.
echo [2/3] Compiling C# Host in Release Mode [x86]...
"%MSBUILD_CMD%" "%ROOT%desktop\RafiqPOS.csproj" /p:Configuration=Release /p:Platform=x86 /v:m
if errorlevel 1 goto :on_msbuild_error

rem Compile C# Debug (Dual build required per AGENTS.md)
echo.
echo Compiling C# Host in Debug Mode [x86]...
"%MSBUILD_CMD%" "%ROOT%desktop\RafiqPOS.csproj" /p:Configuration=Debug /p:Platform=x86 /v:m >nul 2>&1

rem Sync Dist
echo.
echo [3/3] Synchronizing frontend assets to desktop host...
call :sync_dist

echo.
echo ======================================================================
echo           Build Completed Successfully! Launching Rafiq POS...
echo ======================================================================
cd /d "%ROOT%desktop\bin\Release"
start "" "RafiqPOS.exe"
exit /b 0

rem ---------------------------------------------------------------------
rem  Action 3: Frontend Only Rebuild and Launch
rem ---------------------------------------------------------------------
:do_build_frontend
echo.
echo ======================================================================
echo             Starting Frontend Rebuild [Vite] and Launch...
echo ======================================================================
echo.

taskkill /f /im RafiqPOS.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1
timeout /t 1 /nobreak >nul 2>&1

call :detect_npm || goto :on_build_error

if not exist "%ROOT%frontend\node_modules" (
    echo [NOTE] frontend\node_modules not found. Running npm install...
    cd /d "%ROOT%frontend"
    call "%NPM_CMD%" install
    if errorlevel 1 goto :on_npm_error
    cd /d "%ROOT%"
)

echo [1/2] Building Frontend [npm run build]...
cd /d "%ROOT%frontend"
call "%NPM_CMD%" run build
if errorlevel 1 goto :on_npm_error
cd /d "%ROOT%"

echo.
echo [2/2] Synchronizing frontend assets...
call :sync_dist

if exist "%ROOT%desktop\bin\Release\RafiqPOS.exe" (
    echo.
    echo Launching Rafiq POS [Release]...
    cd /d "%ROOT%desktop\bin\Release"
    start "" "RafiqPOS.exe"
    exit /b 0
)

if exist "%ROOT%desktop\bin\Debug\RafiqPOS.exe" (
    echo.
    echo Launching Rafiq POS [Debug]...
    cd /d "%ROOT%desktop\bin\Debug"
    start "" "RafiqPOS.exe"
    exit /b 0
)

echo [ERROR] RafiqPOS.exe not found. Please choose Full Rebuild [option 2].
pause
exit /b 1

rem ---------------------------------------------------------------------
rem  Action 4: Developer Mode
rem ---------------------------------------------------------------------
:do_dev_mode
echo.
echo ======================================================================
echo         Starting Vite Development Server [npm run dev]...
echo ======================================================================
echo.
call "%ROOT%Run_Dev_Mode.bat"
exit /b %errorlevel%

rem ---------------------------------------------------------------------
rem  Action 5: Reset System Data
rem ---------------------------------------------------------------------
:do_reset
call "%ROOT%Reset_Rafiq_POS.bat"
exit /b %errorlevel%

rem ---------------------------------------------------------------------
rem  Helper: Synchronize Dist Directory
rem ---------------------------------------------------------------------
:sync_dist
if exist "%ROOT%frontend\dist" (
    if not exist "%ROOT%desktop\bin\Release\dist" mkdir "%ROOT%desktop\bin\Release\dist" >nul 2>&1
    if exist "%ROOT%desktop\bin\Release" (
        xcopy /s /e /y /q "%ROOT%frontend\dist\*" "%ROOT%desktop\bin\Release\dist\" >nul 2>&1
        if exist "%ROOT%desktop\bin\Release\dist\videos" rmdir /s /q "%ROOT%desktop\bin\Release\dist\videos" >nul 2>&1
    )
    if not exist "%ROOT%desktop\bin\Debug\dist" mkdir "%ROOT%desktop\bin\Debug\dist" >nul 2>&1
    if exist "%ROOT%desktop\bin\Debug" (
        xcopy /s /e /y /q "%ROOT%frontend\dist\*" "%ROOT%desktop\bin\Debug\dist\" >nul 2>&1
        if exist "%ROOT%desktop\bin\Debug\dist\videos" rmdir /s /q "%ROOT%desktop\bin\Debug\dist\videos" >nul 2>&1
    )
)
exit /b 0

rem ---------------------------------------------------------------------
rem  Helper: Detect Tools (npm, MSBuild, NuGet)
rem ---------------------------------------------------------------------
:detect_tools
call :detect_npm || exit /b 1
call :detect_msbuild || exit /b 1
call :detect_nuget
exit /b 0

:detect_npm
set "NPM_CMD="
for /f "delims=" %%N in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%N"
if not defined NPM_CMD (
    echo [ERROR] npm.cmd not found in system PATH.
    echo Please make sure Node.js is installed.
    exit /b 1
)
exit /b 0

:detect_msbuild
set "MSBUILD_CMD="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" set "MSBUILD_CMD=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe"
if not defined MSBUILD_CMD if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe" set "MSBUILD_CMD=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe"
if not defined MSBUILD_CMD for /f "delims=" %%M in ('where MSBuild.exe 2^>nul') do if not defined MSBUILD_CMD set "MSBUILD_CMD=%%M"
if not defined MSBUILD_CMD (
    echo [ERROR] MSBuild.exe was not found.
    exit /b 1
)
exit /b 0

:detect_nuget
set "NUGET_CMD="
for /f "delims=" %%N in ('where nuget.exe 2^>nul') do if not defined NUGET_CMD set "NUGET_CMD=%%N"
if not defined NUGET_CMD if exist "%ROOT%tools\nuget.exe" set "NUGET_CMD=%ROOT%tools\nuget.exe"
exit /b 0

rem ---------------------------------------------------------------------
rem  Error Handlers
rem ---------------------------------------------------------------------
:on_npm_error
echo.
echo ======================================================================
echo [ERROR] npm execution failed. Please check the error messages above.
echo ======================================================================
pause
exit /b 1

:on_msbuild_error
echo.
echo ======================================================================
echo [ERROR] MSBuild compilation failed. Please check the compiler errors.
echo ======================================================================
pause
exit /b 1

:on_build_error
echo.
echo ======================================================================
echo [ERROR] Build cannot proceed due to missing tools or files.
echo ======================================================================
pause
exit /b 1

rem ---------------------------------------------------------------------
rem  Help Message
rem ---------------------------------------------------------------------
:show_help
echo ======================================================================
echo             Rafiq POS - Desktop Launcher and Manager
echo ======================================================================
echo.
echo Usage:
echo   Run_Rafiq.bat  [command]
echo.
echo Available Commands:
echo   (no argument)          Show interactive options menu (default option 1)
echo   build   or  -b         Full rebuild (Frontend + C#) and launch
echo   quick   or  -q         Fast launch current build with dist sync
echo   front   or  -f         Rebuild frontend (Vite) and launch
echo   dev     or  -d         Start Vite development server
echo   reset                  Run complete system reset utility
echo   help    or  -h         Show this help message
echo.
exit /b 0
