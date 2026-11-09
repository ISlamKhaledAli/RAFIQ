@echo off
call "%~dp0Build_Installer.bat" %*
exit /b %errorlevel%
