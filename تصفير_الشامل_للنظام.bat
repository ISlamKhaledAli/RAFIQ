@echo off
setlocal enabledelayedexpansion

title Rafiq POS - Complete System Reset Tool

echo ======================================================================
echo                 Rafiq POS - Complete System Reset Tool
echo                    [Maintenance and Reset Utility]
echo ======================================================================
echo.
echo [WARNING]
echo This operation will permanently DELETE all local databases, settings,
echo user accounts, PINs, and stored data on this computer,
echo and reset Rafiq POS back to clean factory state (fresh install).
echo.
echo Target cleanup directories on this machine:
echo   - %%ProgramData%%\RafiqPOS (Database, Web Profiles, and Backups)
echo   - %%APPDATA%%\RafiqPOS (Reports data)
echo   - %%LOCALAPPDATA%%\RafiqPOS (Temporary cache and web files)
echo.
set /p CONFIRM="Are you sure you want to completely reset the system on this PC? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo.
    echo Operation canceled by user. No files were deleted.
    echo.
    pause
    exit /b 0
)

echo.
echo [1/4] Stopping Rafiq POS and web runtime processes...
taskkill /f /im RafiqPOS.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1

echo [2/4] Cleaning shared system data (ProgramData)...
if exist "%ProgramData%\RafiqPOS" (
    rmdir /s /q "%ProgramData%\RafiqPOS" >nul 2>&1
    echo   - Successfully deleted Rafiq data folder from ProgramData.
) else (
    echo   - ProgramData\RafiqPOS not found (already clean).
)

echo [3/4] Cleaning user data and cache (AppData)...
if exist "%APPDATA%\RafiqPOS" (
    rmdir /s /q "%APPDATA%\RafiqPOS" >nul 2>&1
    echo   - Successfully cleared AppData.
)
if exist "%LOCALAPPDATA%\RafiqPOS" (
    rmdir /s /q "%LOCALAPPDATA%\RafiqPOS" >nul 2>&1
    echo   - Successfully cleared LocalAppData cache.
)

echo [4/4] Cleaning local development data folders (if present)...
if exist "%~dp0desktop\bin\Release\data" (
    rmdir /s /q "%~dp0desktop\bin\Release\data" >nul 2>&1
    echo   - Cleared Release data folder.
)
if exist "%~dp0desktop\bin\Debug\data" (
    rmdir /s /q "%~dp0desktop\bin\Debug\data" >nul 2>&1
    echo   - Cleared Debug data folder.
)

echo.
echo ======================================================================
echo                System Reset Completed Successfully!
echo ======================================================================
echo All accounts, databases, and local data have been removed from this PC.
echo When you launch Rafiq POS now, the Initial Setup Wizard will start.
echo Default initial credentials:
echo   - Admin:   PIN 1234
echo   - Cashier: PIN 0000
echo ======================================================================
echo.
pause
