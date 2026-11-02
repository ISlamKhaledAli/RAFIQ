@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem =====================================================================
rem  Rafiq POS - Windows 7 SP1 prerequisite updates (offline)
rem  Order (Microsoft): 1) KB4490628 Servicing Stack Update
rem                     2) KB4474419 SHA-2 code signing support
rem                     3) KB4019990 D3DCompiler_47 (needed by .NET Framework 4.8, optional here)
rem
rem  Security: only these exact files are used (no searching):
rem     x64\KB4490628.msu  x64\KB4474419.msu  x64\KB4019990.msu
rem     x86\KB4490628.msu  x86\KB4474419.msu  x86\KB4019990.msu
rem  Each file is copied to an administrator-only temporary folder, its SHA256 is compared with the
rem  pin below, and only that verified copy is installed. A pin starting with UNVERIFIED blocks the
rem  update until the maintainer confirms it (see the instructions file and installer\prerequisites\README.md).
rem
rem  Console text is ASCII on purpose (Windows 7 console code pages cannot show UTF-8 Arabic).
rem  Arabic dialogs come from rafiq_messages.vbs (UTF-16 file in this folder).
rem  Log: %TEMP%\rafiq_win7_updates.log (of the administrator account)
rem =====================================================================

rem --- SHA256 pins (version-controlled). Replace UNVERIFIED-... only via the pin verification procedure. ---
set "PIN_KB4490628_x64=UNVERIFIED-dcbfdbefb2ea62d5bb41eb0579e0ec8ae1288219c63ad0aaee3387b99c759451"
set "PIN_KB4490628_x86=UNVERIFIED-4236dc99b82f0a1c1d7bbefcb6fc9444b706c9b33a08d249f3e589e47761066c"
set "PIN_KB4474419_x64=UNVERIFIED-a931215b244795e1e75dbcf55e37890f5b99a544c0383187a414168798bf1291"
set "PIN_KB4474419_x86=UNVERIFIED-0b904d9a83eb720d20d7ee80d322b79c6b84000ee741630c70fa5113cf3e8395"
set "PIN_KB4019990_x64=UNVERIFIED"
set "PIN_KB4019990_x86=UNVERIFIED"

set "SYS=%SystemRoot%\System32"
"%SYS%\fltmc.exe" >nul 2>&1
if errorlevel 1 goto :elevate

title Rafiq POS - Windows 7 Updates Installer
color 0B
set "HERE=%~dp0"
set "MSG=%~dp0rafiq_messages.vbs"
set "CSCRIPT=%SYS%\cscript.exe"
set "CERTUTIL=%SYS%\certutil.exe"
set "LOG=%TEMP%\rafiq_win7_updates.log"
set "NEED_REBOOT=0"
set "FAILED=0"
set "RC="
>> "%LOG%" echo ==== Rafiq Win7 updates run ====

echo ======================================================================
echo    Rafiq POS - Windows 7 SP1 Updates Installer (offline)
echo    KB4490628 (SSU) -^> KB4474419 (SHA-2) -^> KB4019990 (D3DCompiler)
echo ======================================================================
echo.

rem --- Windows 7 / Server 2008 R2 only (version 6.1) ---
ver | "%SYS%\findstr.exe" /r /c:" 6\.1\." >nul
if errorlevel 1 goto :not_win7

rem --- wusa.exe (use Sysnative when running as a 32-bit process on 64-bit Windows) ---
set "WUSA=%SYS%\wusa.exe"
if exist "%SystemRoot%\Sysnative\wusa.exe" set "WUSA=%SystemRoot%\Sysnative\wusa.exe"

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" goto :arch_x64
if "%PROCESSOR_ARCHITEW6432%"=="AMD64" goto :arch_x64
set "ARCH=x86"
echo [*] Detected: Windows 7 32-bit (x86)
goto :arch_done
:arch_x64
set "ARCH=x64"
echo [*] Detected: Windows 7 64-bit (x64)
:arch_done
>> "%LOG%" echo Arch: %ARCH%

rem --- Administrator-only working folder (fresh) ---
set "WORK=%TEMP%\rafiq_w7_updates_%RANDOM%%RANDOM%"
if exist "%WORK%" goto :work_failed
mkdir "%WORK%" 2>nul
if errorlevel 1 goto :work_failed

echo.
call :install_kb KB4490628 1/3 required
if "%FAILED%"=="1" goto :failed
call :install_kb KB4474419 2/3 required
if "%FAILED%"=="1" goto :failed
call :install_kb KB4019990 3/3 optional
if "%FAILED%"=="1" goto :failed
if exist "%WORK%" rmdir /S /Q "%WORK%"

echo.
color 0A
echo ======================================================================
echo   SUCCESS - Windows 7 updates are installed.
if "%NEED_REBOOT%"=="1" echo   A RESTART IS REQUIRED before running the Rafiq POS Setup.
echo ======================================================================
>> "%LOG%" echo SUCCESS reboot=%NEED_REBOOT%
if "%NEED_REBOOT%"=="0" goto :done_no_reboot

"%CSCRIPT%" //nologo "%MSG%" ask_restart
set "ANSWER=%ERRORLEVEL%"
if "%ANSWER%"=="6" goto :restart_now
if "%ANSWER%"=="7" goto :restart_later
rem Dialog could not be shown: ask in the console
set "RESTART_CHOICE="
set /p RESTART_CHOICE="Restart the computer now? (Y/N): "
if /i "%RESTART_CHOICE%"=="Y" goto :restart_now
:restart_later
echo Please restart the computer manually before running the Rafiq POS Setup.
pause
exit /b 0
:restart_now
echo Restarting in 10 seconds...
"%SYS%\shutdown.exe" /r /t 10
exit /b 0

:done_no_reboot
"%CSCRIPT%" //nologo "%MSG%" done_ok >nul 2>&1
echo You can now run the Rafiq POS Setup.
pause
exit /b 0

rem =====================================================================
rem  install_kb KBNUMBER STEP required^|optional
rem  Arguments are fixed literals from this script; file paths are only used inside quotes.
rem =====================================================================
:install_kb
set "KB=%~1"
set "STEP=%~2"
set "KIND=%~3"
set "SRC=%HERE%%ARCH%\%KB%.msu"
set "DST=%WORK%\%KB%.msu"
set "PIN="
call set "PIN=%%PIN_%KB%_%ARCH%%%"
echo [%STEP%] %KB% (%ARCH%)
if not exist "%SRC%" goto :ik_missing
if /i "%PIN:~0,10%"=="UNVERIFIED" goto :ik_unverified
copy /Y /B "%SRC%" "%DST%" >nul
if errorlevel 1 goto :ik_copy_failed
set "ACTUAL="
for /f "skip=1 delims=" %%H in ('call "%CERTUTIL%" -hashfile "%DST%" SHA256') do if not defined ACTUAL set "ACTUAL=%%H"
if not defined ACTUAL goto :ik_hash_failed
set "ACTUAL=%ACTUAL: =%"
if /i not "%ACTUAL%"=="%PIN%" goto :ik_hash_mismatch

echo       Installing - this can take several minutes. Do not turn off the computer.
"%WUSA%" "%DST%" /quiet /norestart
set "RC=%ERRORLEVEL%"
>> "%LOG%" echo %KB% exit=%RC%
del /F /Q "%DST%" >nul 2>&1
if "%RC%"=="0" goto :ik_ok
if "%RC%"=="3010" goto :ik_reboot
if "%RC%"=="2359302" goto :ik_already
if "%RC%"=="-2145124329" goto :ik_not_applicable
if "%RC%"=="1618" goto :ik_busy
echo       [ERROR] wusa.exe failed with exit code %RC%.
set "FAILED=1"
exit /b 1
:ik_ok
echo       [OK] Installed.
exit /b 0
:ik_reboot
echo       [OK] Installed - restart required.
set "NEED_REBOOT=1"
exit /b 0
:ik_already
echo       [OK] Already installed.
exit /b 0
:ik_not_applicable
echo       [SKIP] Not applicable to this computer (superseded by a newer update or wrong 32/64-bit file).
exit /b 0
:ik_busy
echo       [ERROR] Another installation is in progress. Wait, restart, and run this file again.
set "FAILED=1"
exit /b 1
:ik_missing
>> "%LOG%" echo %KB% missing
if /i "%KIND%"=="optional" echo       [SKIP] File not found: %ARCH%\%KB%.msu (optional; the Rafiq setup warns if it is needed).
if /i "%KIND%"=="optional" exit /b 0
echo       [ERROR] Required file not found: %ARCH%\%KB%.msu
set "RC=missing"
set "FAILED=1"
"%CSCRIPT%" //nologo "%MSG%" missing >nul 2>&1
exit /b 1
:ik_unverified
>> "%LOG%" echo %KB% pin unverified
echo       [BLOCKED] The SHA256 pin for %KB% %ARCH% is not verified yet in this script.
echo                 The maintainer must confirm it (see the instructions file) before it can be installed.
if /i "%KIND%"=="optional" exit /b 0
set "RC=unverified-pin"
set "FAILED=1"
exit /b 1
:ik_copy_failed
echo       [ERROR] Could not copy the update file to the working folder.
set "RC=copy"
set "FAILED=1"
exit /b 1
:ik_hash_failed
echo       [ERROR] Could not compute the SHA256 of the update file.
set "RC=hash"
set "FAILED=1"
exit /b 1
:ik_hash_mismatch
>> "%LOG%" echo %KB% hash mismatch
del /F /Q "%DST%" >nul 2>&1
echo       [ERROR] The update file is not the expected official file (SHA256 mismatch). Not installed.
set "RC=hash-mismatch"
set "FAILED=1"
exit /b 1

rem =====================================================================
:work_failed
echo [ERROR] Could not create a new temporary working folder.
pause
exit /b 1

:failed
if defined WORK if exist "%WORK%" rmdir /S /Q "%WORK%"
color 0C
echo.
echo [ERROR] Windows 7 updates were not completed (%RC%). Details: %LOG%
echo         Restart the computer and run this file again. If it keeps failing,
echo         install the .msu files manually in the order shown above.
>> "%LOG%" echo FAILED rc=%RC%
"%CSCRIPT%" //nologo "%MSG%" failed >nul 2>&1
pause
exit /b 1

:not_win7
echo This computer is not running Windows 7 - these updates are not needed.
"%SYS%\cscript.exe" //nologo "%~dp0rafiq_messages.vbs" not_win7 >nul 2>&1
pause
exit /b 0

:elevate
echo [!] Requesting administrator privileges...
rem The script path is passed through an environment variable, never inside the PowerShell command text
set "RAFIQ_W7_SELF=%~f0"
"%SYS%\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:RAFIQ_W7_SELF -Verb RunAs" >nul 2>&1
if not errorlevel 1 exit /b 0
echo.
echo ======================================================================
echo  Please right-click this file and choose "Run as administrator".
echo ======================================================================
pause
exit /b 1
