@echo off
chcp 65001 > nul
title Rafiq POS - Setup Builder

echo ========================================================
echo        Rafiq POS - Single Setup Builder (Inno Setup)
echo ========================================================
echo.

echo [1/4] Building Frontend UI (React + Vite)...
cd /d "%~dp0frontend"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] Compiling C# Host in Release Mode (x86)...
cd /d "%~dp0"
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" "desktop\RafiqPOS.csproj" /p:Configuration=Release /p:Platform=x86 /v:m
if %ERRORLEVEL% neq 0 (
    echo [ERROR] C# Host compilation failed!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] Copying Frontend Assets to Release Directory...
if not exist "desktop\bin\Release\dist" mkdir "desktop\bin\Release\dist"
xcopy /E /Y /Q "frontend\dist\*" "desktop\bin\Release\dist\"

echo.
echo [4/4] Packaging Single Executable via Inno Setup...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" "installer\RafiqPOS_Setup.iss"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Inno Setup packaging failed!
    pause
    exit /b %ERRORLEVEL%
)

:: Step 5: Digital Code Signing (Feature #152 / Task 152-2)
if exist "%~dp0RafiqCert.pfx" (
    echo.
    echo [5/5] Digitally signing installer with Authenticode...
    signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /f "%~dp0RafiqCert.pfx" /p "%CERT_PASS%" "%~dp0installer\Output\RafiqPOS_Setup_v1.0.0.exe"
) else (
    echo [NOTE] No RafiqCert.pfx certificate found; skipping signing as documented in قرار_التوقيع_الرقمي_Code_Signing.md.
)

echo.
echo ========================================================
echo   [SUCCESS] Rafiq POS Setup Created Successfully!
echo   Location: installer\Output\RafiqPOS_Setup_v1.0.0.exe
echo ========================================================
echo.

explorer "%~dp0installer\Output"
pause
