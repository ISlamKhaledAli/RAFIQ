@echo off
setlocal
chcp 65001 > nul
title Rafiq POS - Full Offline Setup Builder (Win 7 SP1 .. 11)
cd /d "%~dp0"
echo ========================================================
echo   Rafiq POS - Building Full Offline Edition
echo   Designed for all systems from Windows 7 SP1 to 11
echo ========================================================
echo.
call "%~dp0Build_Installer.bat" full %*
exit /b %errorlevel%
