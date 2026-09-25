@echo off
chcp 65001 > nul
title Rafiq POS - Desktop Application

echo ===================================================
echo     Starting Rafiq POS Desktop Application...
echo ===================================================
echo.

start "" "%~dp0desktop\bin\Debug\RafiqPOS.exe"

exit
