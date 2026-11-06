@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 > nul
title Rafiq POS - Setup Builder

rem =====================================================================
rem  Rafiq POS - Offline installer builder (Windows 7 SP1 .. Windows 11)
rem  Output: installer\Output\RafiqPOS_Setup_v1.0.0.exe
rem
rem  Optional environment variables:
rem    RAFIQ_PREREQ_DIR      folder with the downloaded Microsoft prerequisites (default: installer\prerequisites).
rem                          Hashes are ALWAYS read from the repository: installer\prerequisites\SHA256SUMS.txt
rem    RAFIQ_FIXED109_DIR    pre-extracted WebView2 Fixed Runtime 109 x86 folder (skips the CAB hash). Requires
rem                          RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES; every .exe/.dll is still Authenticode-checked.
rem    RAFIQ_NUGET           full path to nuget.exe   (default: PATH, then tools\nuget.exe)
rem    RAFIQ_MSBUILD         full path to MSBuild.exe (default: .NET Framework 4 MSBuild)
rem    RAFIQ_ISCC            full path to Inno Setup ISCC.exe (6.7.4+; default: standard install folders)
rem    RAFIQ_SIGN_THUMBPRINT SHA1 thumbprint of the code-signing certificate in the Windows certificate store
rem                          (or hardware token). When set, Setup and uninstaller are signed and the build FAILS
rem                          if signing fails. Password/PFX-file signing is not supported.
rem    RAFIQ_SIGNTOOL        full path to signtool.exe (default: PATH, then Windows Kits 10)
rem    RAFIQ_NO_PAUSE=1      do not wait for a key press (automation)
rem =====================================================================

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "SYS=%SystemRoot%\System32"
set "CERTUTIL=%SYS%\certutil.exe"
set "FINDSTR=%SYS%\findstr.exe"
set "XCOPY=%SYS%\xcopy.exe"
set "EXPAND=%SYS%\expand.exe"
set "POWERSHELL=%SYS%\WindowsPowerShell\v1.0\powershell.exe"
set "VERIFY_PS1=%ROOT%installer\verify_signatures.ps1"

if not defined RAFIQ_PREREQ_DIR set "RAFIQ_PREREQ_DIR=%ROOT%installer\prerequisites"
set "PREREQ=%RAFIQ_PREREQ_DIR%"
rem Trusted pins come from the repository only (never from RAFIQ_PREREQ_DIR)
set "SUMS=%ROOT%installer\prerequisites\SHA256SUMS.txt"
set "DOTNET_FILE=ndp48-x86-x64-allos-enu.exe"
set "FIXED_CAB=Microsoft.WebView2.FixedVersionRuntime.109.0.1518.140.x86.cab"
set "FIXED_DIR_NAME=Microsoft.WebView2.FixedVersionRuntime.109.0.1518.140.x86"
set "FIXED_VERSION=109.0.1518.140"
set "WV2_BOOTSTRAPPER=MicrosoftEdgeWebview2Setup.exe"
set "RELEASE_DIR=%ROOT%desktop\bin\Release"
set "STAGING="
set "SIGN_ENABLED="

rem --- Setup Edition Selection (Full Offline vs Slim Modern) ---
set "BUILD_MODE=FULL"
if /i "%~1"=="slim" set "BUILD_MODE=SLIM"
if /i "%~1"=="lite" set "BUILD_MODE=SLIM"
if /i "%~1"=="full" set "BUILD_MODE=FULL"
if /i "%RAFIQ_BUILD_SLIM%"=="1" set "BUILD_MODE=SLIM"

if "%~1"=="" if not defined RAFIQ_NO_PAUSE goto :ask_edition
goto :edition_chosen
:ask_edition
echo ========================================================
echo   Choose Build Edition / اختر نوع ملف التثبيت
echo ========================================================
echo   [1] Full Offline Edition (Win 7 SP1 .. Win 11) [Default]
echo       النسخة الشاملة الأوفلاين (تعمل بدون إنترنت)
echo.
echo   [2] Slim Modern Edition  (Win 10 and Win 11) ~13MB
echo       النسخة الخفيفة الحديثة (لويندوز 10 و 11 بحجم صغير)
echo ========================================================
set /p "USER_EDITION=Select edition [1 or 2] (Default: 1): "
if "%USER_EDITION%"=="2" set "BUILD_MODE=SLIM"
echo.
:edition_chosen

if /i "%BUILD_MODE%"=="SLIM" (
    set "SETUP_EXE=%ROOT%installer\Output\RafiqPOS_Setup_Slim_v1.0.0.exe"
    set "ISCC_EDITION_FLAG=/DSlim=1"
    set "EDITION_TITLE=Slim Modern Edition (Windows 10 and 11)"
) else (
    set "SETUP_EXE=%ROOT%installer\Output\RafiqPOS_Setup_v1.0.0.exe"
    set "ISCC_EDITION_FLAG="
    set "EDITION_TITLE=Full Offline Edition (Windows 7 SP1 .. 11)"
)

rem Auto-detect pre-existing extracted WebView2 Fixed Runtime 109 if CAB is not present (Full build only)
if /i not "%BUILD_MODE%"=="SLIM" (
    if not defined RAFIQ_FIXED109_DIR if not exist "%PREREQ%\%FIXED_CAB%" (
        if exist "%ROOT%desktop\bin\Debug\runtimes\fixed109\msedgewebview2.exe" (
            set "RAFIQ_FIXED109_DIR=%ROOT%desktop\bin\Debug\runtimes\fixed109"
            set "RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES"
        ) else if exist "%RELEASE_DIR%\runtimes\fixed109\msedgewebview2.exe" (
            set "RAFIQ_FIXED109_DIR=%RELEASE_DIR%\runtimes\fixed109"
            set "RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES"
        )
    )
)

echo ========================================================
echo        Rafiq POS - Setup Builder (Inno Setup)
echo        Edition: %EDITION_TITLE%
echo ========================================================
echo.

rem Close any running RafiqPOS instance to prevent file lock errors (MSB3021 / MSB3027)
"%SYS%\tasklist.exe" /FI "IMAGENAME eq RafiqPOS.exe" 2>nul | "%SYS%\find.exe" /I "RafiqPOS.exe" >nul
if not errorlevel 1 echo [NOTE] RafiqPOS.exe is running - closing it to release files... / جاري إغلاق برنامج رفيق المفتوح لتحرير الملفات...
if not errorlevel 1 "%SYS%\taskkill.exe" /F /IM RafiqPOS.exe >nul 2>&1
if not errorlevel 1 "%SYS%\timeout.exe" /t 2 /nobreak >nul

rem ---------------------------------------------------------------------
echo [1/8] Locating build tools...
rem ---------------------------------------------------------------------
if not exist "%CERTUTIL%" goto :err_systool
if not exist "%POWERSHELL%" goto :err_systool
if not exist "%VERIFY_PS1%" goto :err_systool

set "NPM_CMD="
for /f "delims=" %%N in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%N"
if not defined NPM_CMD goto :err_npm
echo       npm     : %NPM_CMD%

if not defined RAFIQ_MSBUILD if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" set "RAFIQ_MSBUILD=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe"
if not defined RAFIQ_MSBUILD if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe" set "RAFIQ_MSBUILD=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe"
if not defined RAFIQ_MSBUILD goto :err_msbuild
if not exist "%RAFIQ_MSBUILD%" goto :err_msbuild
echo       MSBuild : %RAFIQ_MSBUILD%

if not defined RAFIQ_NUGET for /f "delims=" %%N in ('where nuget.exe 2^>nul') do if not defined RAFIQ_NUGET set "RAFIQ_NUGET=%%N"
if not defined RAFIQ_NUGET if exist "%ROOT%tools\nuget.exe" set "RAFIQ_NUGET=%ROOT%tools\nuget.exe"
if defined RAFIQ_NUGET echo       NuGet   : %RAFIQ_NUGET%
if not defined RAFIQ_NUGET echo       NuGet   : not found

if not defined RAFIQ_ISCC if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "RAFIQ_ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined RAFIQ_ISCC if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "RAFIQ_ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined RAFIQ_ISCC if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set "RAFIQ_ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not defined RAFIQ_ISCC for /f "delims=" %%I in ('where ISCC.exe 2^>nul') do if not defined RAFIQ_ISCC set "RAFIQ_ISCC=%%I"
if not defined RAFIQ_ISCC goto :err_iscc
if not exist "%RAFIQ_ISCC%" goto :err_iscc
echo       ISCC    : %RAFIQ_ISCC%

rem --- Code signing (certificate store thumbprint only) ---
if exist "%ROOT%RafiqCert.pfx" if not defined RAFIQ_SIGN_THUMBPRINT goto :err_pfx
if exist "%ROOT%RafiqCert.pfx" echo [WARN] RafiqCert.pfx found in the repository folder - move it out; it is not used. / احذف ملف الشهادة من مجلد المشروع.
if not defined RAFIQ_SIGN_THUMBPRINT goto :sign_config_done
call :check_thumbprint || goto :fail
if not defined RAFIQ_SIGNTOOL for /f "delims=" %%S in ('where signtool.exe 2^>nul') do if not defined RAFIQ_SIGNTOOL set "RAFIQ_SIGNTOOL=%%S"
if not defined RAFIQ_SIGNTOOL for /d %%K in ("%ProgramFiles(x86)%\Windows Kits\10\bin\10.*") do if exist "%%~K\x64\signtool.exe" set "RAFIQ_SIGNTOOL=%%~K\x64\signtool.exe"
if not defined RAFIQ_SIGNTOOL goto :err_signtool
if not exist "%RAFIQ_SIGNTOOL%" goto :err_signtool
set "SIGN_ENABLED=1"
echo       Signing : %RAFIQ_SIGNTOOL% (thumbprint %RAFIQ_SIGN_THUMBPRINT%)
:sign_config_done
if not defined SIGN_ENABLED echo       Signing : disabled (RAFIQ_SIGN_THUMBPRINT not set) - see قرار_التوقيع_الرقمي_Code_Signing.md

rem ---------------------------------------------------------------------
echo.
echo [2/8] Verifying downloaded prerequisites in: %PREREQ%
rem ---------------------------------------------------------------------
if not exist "%SUMS%" goto :err_sums
call :check_hash "%PREREQ%\%WV2_BOOTSTRAPPER%" "%WV2_BOOTSTRAPPER%" || goto :fail
call :check_sig "%PREREQ%\%WV2_BOOTSTRAPPER%" || goto :fail

if /i "%BUILD_MODE%"=="SLIM" (
    echo       Slim build selected - skipping .NET 4.8 and Fixed 109 prerequisites verification.
    goto :early_done
)

call :check_hash "%PREREQ%\%DOTNET_FILE%" "%DOTNET_FILE%" || goto :fail
call :check_sig "%PREREQ%\%DOTNET_FILE%" || goto :fail
if defined RAFIQ_FIXED109_DIR goto :early_fixed_dir
call :check_hash "%PREREQ%\%FIXED_CAB%" "%FIXED_CAB%" || goto :fail
goto :early_done
:early_fixed_dir
if /i not "%RAFIQ_ALLOW_UNVERIFIED_FIXED109%"=="YES" goto :err_fixed_optin
echo [WARN] RAFIQ_FIXED109_DIR is used - the CAB hash is NOT checked; Authenticode + version are checked instead.
:early_done

rem ---------------------------------------------------------------------
echo.
echo [3/8] Restoring NuGet packages (desktop\packages)...
rem ---------------------------------------------------------------------
if defined RAFIQ_NUGET goto :do_restore
if exist "%ROOT%desktop\packages\Microsoft.Web.WebView2.1.0.1518.46\lib\net45\Microsoft.Web.WebView2.Core.dll" goto :skip_restore
goto :err_nuget
:do_restore
"%RAFIQ_NUGET%" restore "desktop\RafiqPOS.csproj" -PackagesDirectory "desktop\packages" -NonInteractive
if errorlevel 1 goto :err_restore
goto :restore_done
:skip_restore
echo [WARN] nuget.exe not found; desktop\packages already exists, skipping restore.
echo [تنبيه] لم يتم العثور على nuget.exe؛ مجلد الحزم موجود مسبقاً فسيتم تخطي الاستعادة.
:restore_done

rem ---------------------------------------------------------------------
echo.
echo [4/8] Building Frontend UI (React + Vite)...
rem ---------------------------------------------------------------------
if not exist "%ROOT%frontend\node_modules" goto :err_node_modules
cd /d "%ROOT%frontend"
call "%NPM_CMD%" run build
if errorlevel 1 goto :err_frontend
cd /d "%ROOT%"
if not exist "%ROOT%frontend\dist\index.html" goto :err_frontend

rem ---------------------------------------------------------------------
echo.
echo [5/8] Compiling C# Host in Release Mode (x86)...
rem ---------------------------------------------------------------------
"%RAFIQ_MSBUILD%" "desktop\RafiqPOS.csproj" /p:Configuration=Release /p:Platform=x86 /v:m
if errorlevel 1 goto :err_msbuild_failed
if not exist "%RELEASE_DIR%\RafiqPOS.exe" goto :err_msbuild_failed

rem ---------------------------------------------------------------------
echo.
echo [6/8] Copying Frontend Assets to desktop\bin\Release\dist ...
rem ---------------------------------------------------------------------
if exist "%RELEASE_DIR%\dist" rmdir /S /Q "%RELEASE_DIR%\dist"
"%XCOPY%" /E /I /Y /Q "%ROOT%frontend\dist" "%RELEASE_DIR%\dist" >nul
if errorlevel 1 goto :err_dist
if not exist "%RELEASE_DIR%\dist\index.html" goto :err_dist
if exist "%RELEASE_DIR%\dist\videos" rmdir /S /Q "%RELEASE_DIR%\dist\videos"

rem ---------------------------------------------------------------------
echo.
echo [7/8] Staging prerequisites and dependencies...
rem  npm/MSBuild ran third-party code since step 2, so the files are copied into a fresh staging folder and
rem  re-verified there; ISCC and the CAB extraction only use the verified staged copies.
rem ---------------------------------------------------------------------
set "STAGING=%TEMP%\rafiq_setup_staging_%RANDOM%%RANDOM%%RANDOM%"
if exist "%STAGING%" goto :err_staging
mkdir "%STAGING%" 2>nul
if errorlevel 1 goto :err_staging
if not exist "%STAGING%\" goto :err_staging

copy /Y /B "%PREREQ%\%WV2_BOOTSTRAPPER%" "%STAGING%\%WV2_BOOTSTRAPPER%" >nul || goto :err_staging_copy
call :check_hash "%STAGING%\%WV2_BOOTSTRAPPER%" "%WV2_BOOTSTRAPPER%" || goto :fail
call :check_sig "%STAGING%\%WV2_BOOTSTRAPPER%" || goto :fail

if /i "%BUILD_MODE%"=="SLIM" (
    echo       Slim build: .NET 4.8 offline installer and Fixed 109 runtime omitted.
    goto :staging_cleanup
)

copy /Y /B "%PREREQ%\%DOTNET_FILE%" "%STAGING%\%DOTNET_FILE%" >nul || goto :err_staging_copy
call :check_hash "%STAGING%\%DOTNET_FILE%" "%DOTNET_FILE%" || goto :fail
call :check_sig "%STAGING%\%DOTNET_FILE%" || goto :fail

set "FIXED_SOURCE="
if defined RAFIQ_FIXED109_DIR goto :fixed_from_dir
copy /Y /B "%PREREQ%\%FIXED_CAB%" "%STAGING%\%FIXED_CAB%" >nul || goto :err_staging_copy
call :check_hash "%STAGING%\%FIXED_CAB%" "%FIXED_CAB%" || goto :fail
mkdir "%STAGING%\fixed109_extract" 2>nul
if errorlevel 1 goto :err_staging
"%EXPAND%" "%STAGING%\%FIXED_CAB%" -F:* "%STAGING%\fixed109_extract" >nul
if errorlevel 1 goto :err_fixed_extract
if exist "%STAGING%\fixed109_extract\%FIXED_DIR_NAME%\msedgewebview2.exe" set "FIXED_SOURCE=%STAGING%\fixed109_extract\%FIXED_DIR_NAME%"
if not defined FIXED_SOURCE if exist "%STAGING%\fixed109_extract\msedgewebview2.exe" set "FIXED_SOURCE=%STAGING%\fixed109_extract"
if not defined FIXED_SOURCE goto :err_fixed_extract
goto :fixed_verify
:fixed_from_dir
if /i not "%RAFIQ_ALLOW_UNVERIFIED_FIXED109%"=="YES" goto :err_fixed_optin
if not exist "%RAFIQ_FIXED109_DIR%\msedgewebview2.exe" goto :err_fixed_dir
set "FIXED_SOURCE=%RAFIQ_FIXED109_DIR%"
:fixed_verify
call :check_tree "%FIXED_SOURCE%" || goto :fail
if /i "%FIXED_SOURCE%"=="%RELEASE_DIR%\runtimes\fixed109" goto :fixed_skip_copy
if exist "%RELEASE_DIR%\runtimes\fixed109" rmdir /S /Q "%RELEASE_DIR%\runtimes\fixed109"
if exist "%RELEASE_DIR%\runtimes\fixed109" goto :err_fixed_copy
"%XCOPY%" /E /I /Y /Q "%FIXED_SOURCE%" "%RELEASE_DIR%\runtimes\fixed109" >nul
if errorlevel 1 goto :err_fixed_copy
:fixed_skip_copy
rem Re-verify the copy that ISCC will pack
call :check_tree "%RELEASE_DIR%\runtimes\fixed109" || goto :fail

:staging_cleanup
rem Never package developer data (Audit F-33): remove any database/WAL/backup files from the Release folder
if exist "%RELEASE_DIR%\data" del /F /Q "%RELEASE_DIR%\data\*.db" "%RELEASE_DIR%\data\*.db-wal" "%RELEASE_DIR%\data\*.db-shm" 2>nul
if exist "%RELEASE_DIR%\data\backups" rmdir /S /Q "%RELEASE_DIR%\data\backups"
if exist "%RELEASE_DIR%\data\pre_restore" rmdir /S /Q "%RELEASE_DIR%\data\pre_restore"
if exist "%RELEASE_DIR%\data\webview_profile" rmdir /S /Q "%RELEASE_DIR%\data\webview_profile"
if exist "%RELEASE_DIR%\logs" rmdir /S /Q "%RELEASE_DIR%\logs"
if exist "%RELEASE_DIR%\rollback_backup" rmdir /S /Q "%RELEASE_DIR%\rollback_backup"
if exist "%RELEASE_DIR%\update_staging" rmdir /S /Q "%RELEASE_DIR%\update_staging"
if exist "%RELEASE_DIR%\نسخة_تلقائية_أمان_قبل_التحديث_v1.0.0" rmdir /S /Q "%RELEASE_DIR%\نسخة_تلقائية_أمان_قبل_التحديث_v1.0.0"
del /F /Q "%RELEASE_DIR%\*_test_output.json" 2>nul

rem ---------------------------------------------------------------------
echo.
echo [8/8] Packaging Single Executable via Inno Setup...
rem ---------------------------------------------------------------------
if exist "%SETUP_EXE%" del /F /Q "%SETUP_EXE%"
if defined SIGN_ENABLED goto :iscc_signed
"%RAFIQ_ISCC%" "/DPrereqDir=%STAGING%" %ISCC_EDITION_FLAG% "installer\RafiqPOS_Setup.iss"
if errorlevel 1 goto :err_iscc_failed
goto :iscc_done
:iscc_signed
"%RAFIQ_ISCC%" "/DPrereqDir=%STAGING%" %ISCC_EDITION_FLAG% "/DSignEnabled=1" "/Srafiqsign=$q%RAFIQ_SIGNTOOL%$q sign /sha1 %RAFIQ_SIGN_THUMBPRINT% /fd sha256 /tr http://timestamp.digicert.com /td sha256 /d $qRafiq POS$q $f" "installer\RafiqPOS_Setup.iss"
if errorlevel 1 goto :err_sign_failed
"%RAFIQ_SIGNTOOL%" verify /pa /q "%SETUP_EXE%"
if errorlevel 1 goto :err_sign_failed
echo       OK  Setup and uninstaller signed and verified.
:iscc_done
if not exist "%SETUP_EXE%" goto :err_iscc_failed
if exist "%STAGING%" rmdir /S /Q "%STAGING%"

for %%S in ("%SETUP_EXE%") do set "SETUP_SIZE=%%~zS"
echo.
echo ========================================================
echo   [SUCCESS] Rafiq POS Setup Created Successfully!
echo   تم إنشاء ملف التثبيت بنجاح
echo   Edition : %EDITION_TITLE%
echo   Location: %SETUP_EXE%
echo   Size    : %SETUP_SIZE% bytes
if not defined SIGN_ENABLED echo   Signed  : NO
if defined SIGN_ENABLED echo   Signed  : YES
echo ========================================================
echo.
if not defined RAFIQ_NO_PAUSE explorer "%ROOT%installer\Output"
if not defined RAFIQ_NO_PAUSE pause
exit /b 0

rem =====================================================================
rem  Subroutines (return errorlevel 1 and set ERR_EN / ERR_AR on failure)
rem =====================================================================

rem check_hash FULL_PATH FILE_NAME: SHA256 of the file must equal the verified pin in the repository SHA256SUMS.txt
:check_hash
set "CH_PATH=%~1"
set "CH_NAME=%~2"
set "CH_EXPECTED="
set "CH_ACTUAL="
for /f "usebackq eol=# tokens=1,2" %%A in ("%SUMS%") do if /i "%%B"=="%CH_NAME%" set "CH_EXPECTED=%%A"
if not exist "%CH_PATH%" goto :ch_missing
if not defined CH_EXPECTED goto :ch_nopin
if /i "%CH_EXPECTED:~0,10%"=="UNVERIFIED" goto :ch_unverified
for /f "skip=1 delims=" %%H in ('call "%CERTUTIL%" -hashfile "%CH_PATH%" SHA256') do if not defined CH_ACTUAL set "CH_ACTUAL=%%H"
if not defined CH_ACTUAL goto :ch_nohash
set "CH_ACTUAL=%CH_ACTUAL: =%"
if /i not "%CH_ACTUAL%"=="%CH_EXPECTED%" goto :ch_mismatch
echo       OK  SHA256 %CH_PATH%
exit /b 0
:ch_missing
set "ERR_EN=Missing prerequisite file: %CH_PATH%  - see installer\prerequisites\README.md for the official download link."
set "ERR_AR=ملف متطلبات ناقص: %CH_NAME% - ضعه في مجلد المتطلبات - راجع README.md لرابط التحميل الرسمي."
exit /b 1
:ch_nopin
set "ERR_EN=%CH_NAME% has no active SHA256 line in %SUMS%."
set "ERR_AR=لا توجد بصمة SHA256 للملف %CH_NAME% في SHA256SUMS.txt."
exit /b 1
:ch_unverified
set "ERR_EN=The SHA256 pin for %CH_NAME% is marked UNVERIFIED. Follow the pin verification procedure in installer\prerequisites\README.md (two independent downloads, valid Microsoft signature, expected version, second-person review) before building."
set "ERR_AR=بصمة الملف %CH_NAME% غير موثقة بعد - اتبع إجراء التحقق في README.md قبل البناء."
exit /b 1
:ch_nohash
set "ERR_EN=certutil could not hash %CH_PATH%."
set "ERR_AR=تعذر حساب بصمة الملف %CH_NAME% بواسطة certutil."
exit /b 1
:ch_mismatch
set "ERR_EN=SHA256 mismatch for %CH_PATH%: expected %CH_EXPECTED% got %CH_ACTUAL%. Do NOT just replace the pin - see installer\prerequisites\README.md."
set "ERR_AR=بصمة الملف %CH_NAME% غير مطابقة - الملف تالف أو ليس النسخة الرسمية. لا تغيّر البصمة دون إجراء التحقق في README.md."
exit /b 1

rem check_sig FULL_PATH: valid Authenticode signature by Microsoft Corporation chaining to a Microsoft root
:check_sig
"%POWERSHELL%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%VERIFY_PS1%" -Path "%~1"
if errorlevel 1 goto :cs_fail
exit /b 0
:cs_fail
set "ERR_EN=Microsoft Authenticode signature check failed for %~1."
set "ERR_AR=فشل التحقق من التوقيع الرقمي لمايكروسوفت للملف %~nx1."
exit /b 1

rem check_tree FOLDER: every .exe/.dll signed by Microsoft, no reparse points, msedgewebview2.exe version = FIXED_VERSION
:check_tree
"%POWERSHELL%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%VERIFY_PS1%" -Path "%~1" -Tree -VersionFile msedgewebview2.exe -ExpectedVersion %FIXED_VERSION%
if errorlevel 1 goto :ct_fail
exit /b 0
:ct_fail
set "ERR_EN=WebView2 Fixed Runtime verification failed in %~1 - signatures or version %FIXED_VERSION%."
set "ERR_AR=فشل التحقق من تواقيع أو إصدار مشغل العرض WebView2 Fixed 109."
exit /b 1

rem check_thumbprint: exactly 40 hexadecimal characters
:check_thumbprint
set "TP=%RAFIQ_SIGN_THUMBPRINT: =%"
set "RAFIQ_SIGN_THUMBPRINT=%TP%"
if "%TP:~39,1%"=="" goto :tp_bad
if not "%TP:~40,1%"=="" goto :tp_bad
echo %TP%| "%FINDSTR%" /r /x /i "[0-9a-f]*" >nul
if errorlevel 1 goto :tp_bad
exit /b 0
:tp_bad
set "ERR_EN=RAFIQ_SIGN_THUMBPRINT must be the 40-character SHA1 thumbprint of the signing certificate."
set "ERR_AR=قيمة RAFIQ_SIGN_THUMBPRINT يجب أن تكون بصمة الشهادة SHA1 من 40 حرفاً."
exit /b 1

rem =====================================================================
rem  Errors (each subsystem has its own precise message)
rem =====================================================================
:err_systool
set "ERR_EN=A required Windows tool or script is missing: certutil.exe, powershell.exe or installer\verify_signatures.ps1."
set "ERR_AR=أداة نظام أو سكربت تحقق مطلوب غير موجود - certutil أو powershell أو verify_signatures.ps1."
goto :fail
:err_npm
set "ERR_EN=npm.cmd (Node.js) was not found in PATH. Install Node.js 22 LTS."
set "ERR_AR=لم يتم العثور على npm - ثبّت Node.js 22 LTS."
goto :fail
:err_msbuild
set "ERR_EN=MSBuild.exe for .NET Framework 4 was not found. Install .NET Framework 4.8 Developer Pack or set RAFIQ_MSBUILD."
set "ERR_AR=لم يتم العثور على MSBuild - ثبّت .NET Framework 4.8 Developer Pack أو حدّد المسار في RAFIQ_MSBUILD."
goto :fail
:err_iscc
set "ERR_EN=Inno Setup 6 (ISCC.exe) was not found. Install Inno Setup 6.7.4 or newer, or set RAFIQ_ISCC."
set "ERR_AR=لم يتم العثور على Inno Setup - ثبّت الإصدار 6.7.4 أو أحدث أو حدّد المسار في RAFIQ_ISCC."
goto :fail
:err_pfx
set "ERR_EN=RafiqCert.pfx found but password/PFX signing is no longer supported. Import the certificate into the Windows certificate store or use the hardware token, set RAFIQ_SIGN_THUMBPRINT, and move the .pfx out of the repository folder."
set "ERR_AR=التوقيع بملف PFX وكلمة مرور لم يعد مدعوماً - استورد الشهادة لمخزن شهادات ويندوز وحدد RAFIQ_SIGN_THUMBPRINT ثم انقل ملف pfx خارج مجلد المشروع."
goto :fail
:err_signtool
set "ERR_EN=Signing was requested (RAFIQ_SIGN_THUMBPRINT) but signtool.exe was not found. Install the Windows 10/11 SDK or set RAFIQ_SIGNTOOL."
set "ERR_AR=التوقيع مطلوب لكن signtool.exe غير موجود - ثبّت Windows SDK أو حدد RAFIQ_SIGNTOOL."
goto :fail
:err_sign_failed
set "ERR_EN=Inno Setup packaging or code signing failed, or the signature did not verify. Signing was requested, so the build is stopped."
set "ERR_AR=فشل إنشاء ملف التثبيت أو توقيعه رقمياً أو التحقق من التوقيع - تم إيقاف البناء لأن التوقيع مطلوب."
goto :fail
:err_sums
set "ERR_EN=Checksum list not found: %SUMS%"
set "ERR_AR=ملف البصمات SHA256SUMS.txt غير موجود في المستودع."
goto :fail
:err_nuget
set "ERR_EN=nuget.exe not found (PATH, tools\nuget.exe or RAFIQ_NUGET) and desktop\packages is empty. Download https://dist.nuget.org/win-x86-commandline/latest/nuget.exe into tools\"
set "ERR_AR=لم يتم العثور على nuget.exe ومجلد الحزم فارغ - ضع nuget.exe في مجلد tools."
goto :fail
:err_restore
set "ERR_EN=NuGet restore failed. On an offline machine copy a complete desktop\packages folder from a connected machine."
set "ERR_AR=فشلت استعادة حزم NuGet - على جهاز بدون إنترنت انسخ مجلد desktop\packages كاملاً من جهاز آخر."
goto :fail
:err_node_modules
set "ERR_EN=frontend\node_modules is missing. Run npm ci inside the frontend folder first."
set "ERR_AR=مجلد frontend\node_modules غير موجود - شغّل npm ci داخل مجلد frontend."
goto :fail
:err_frontend
cd /d "%ROOT%"
set "ERR_EN=Frontend build failed (npm run build) or frontend\dist\index.html is missing."
set "ERR_AR=فشل بناء الواجهة npm run build."
goto :fail
:err_msbuild_failed
set "ERR_EN=C# host compilation failed (MSBuild Release x86)."
set "ERR_AR=فشل بناء برنامج رفيق C# - راجع أخطاء MSBuild بالأعلى."
goto :fail
:err_dist
set "ERR_EN=Copying frontend\dist to desktop\bin\Release\dist failed."
set "ERR_AR=فشل نسخ ملفات الواجهة إلى مجلد Release\dist."
goto :fail
:err_staging
set "ERR_EN=Could not create a NEW empty staging folder: %STAGING% - it must not exist beforehand."
set "ERR_AR=تعذر إنشاء مجلد مؤقت جديد وفارغ للتحقق من المتطلبات."
goto :fail
:err_staging_copy
set "ERR_EN=Copying prerequisites into the staging folder failed: %STAGING%"
set "ERR_AR=فشل نسخ ملفات المتطلبات إلى المجلد المؤقت."
goto :fail
:err_fixed_optin
set "ERR_EN=RAFIQ_FIXED109_DIR is set but RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES is not. Using an unhashed runtime folder needs this explicit second opt-in."
set "ERR_AR=استخدام مجلد مشغل عرض غير موثق البصمة يتطلب موافقة صريحة RAFIQ_ALLOW_UNVERIFIED_FIXED109=YES."
goto :fail
:err_fixed_extract
set "ERR_EN=Extracting %FIXED_CAB% failed or msedgewebview2.exe not found in it."
set "ERR_AR=فشل فك ضغط مشغل العرض WebView2 Fixed 109 أو الملف msedgewebview2.exe غير موجود بداخله."
goto :fail
:err_fixed_dir
set "ERR_EN=RAFIQ_FIXED109_DIR does not contain msedgewebview2.exe: %RAFIQ_FIXED109_DIR%"
set "ERR_AR=المجلد المحدد في RAFIQ_FIXED109_DIR لا يحتوي على msedgewebview2.exe."
goto :fail
:err_fixed_copy
set "ERR_EN=Copying WebView2 Fixed Runtime 109 into desktop\bin\Release\runtimes\fixed109 failed."
set "ERR_AR=فشل نسخ مشغل العرض إلى مجلد runtimes\fixed109."
goto :fail
:err_iscc_failed
set "ERR_EN=Inno Setup packaging failed - see ISCC output above."
set "ERR_AR=فشل إنشاء ملف التثبيت بواسطة Inno Setup - راجع الأخطاء بالأعلى."
goto :fail

:fail
cd /d "%ROOT%"
if defined STAGING if exist "%STAGING%" rmdir /S /Q "%STAGING%"
echo.
echo ========================================================
echo [ERROR] %ERR_EN%
echo [خطأ] %ERR_AR%
echo ========================================================
echo.
if not defined RAFIQ_NO_PAUSE pause
exit /b 1
