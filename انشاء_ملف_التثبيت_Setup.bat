@echo off
chcp 65001 > nul
title بناء وتجميع ملف التثبيت — رفيق نقاط البيع

echo ========================================================
echo        جاري تجميع وبناء ملف تثبيت رفيق (Single Setup .exe)
echo ========================================================
echo.

echo [1/4] بناء واجهة المستخدم (React + Vite)...
cd /d "%~dp0frontend"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [خطأ] فشل بناء الواجهة الأمامية!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] تجميع النواة المكتوبة بـ C# في وضع Release...
cd /d "%~dp0"
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" "desktop\RafiqPOS.csproj" /p:Configuration=Release /p:Platform=x86 /v:m
if %ERRORLEVEL% neq 0 (
    echo [خطأ] فشل تجميع مشروع C#!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] نسخ ملفات الواجهة إلى مجلد الإصدار...
if not exist "desktop\bin\Release\dist" mkdir "desktop\bin\Release\dist"
xcopy /E /Y /Q "frontend\dist\*" "desktop\bin\Release\dist\"

echo.
echo [4/4] حزم وضغط البرنامج في ملف تثبيت واحد عبر Inno Setup...
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" "installer\RafiqPOS_Setup.iss"
if %ERRORLEVEL% neq 0 (
    echo [خطأ] فشل إنشاء ملف التثبيت عبر Inno Setup!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   ✅ تم إنشاء ملف التثبيت بنجاح تام!
echo   المسار: installer\Output\RafiqPOS_Setup_v1.0.0.exe
echo ========================================================
echo.

explorer "%~dp0installer\Output"
pause
