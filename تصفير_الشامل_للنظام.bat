@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title أداة تصفير رفيق الشاملة (Rafiq POS Reset Tool)

echo ======================================================================
echo             أداة التصفير الشامل والتهيئة لمشروع رفيق (Rafiq POS)
echo                       [أداة صيانة وفلاشة متنقلة]
echo ======================================================================
echo.
echo [تحذير هام]
echo هذه العملية ستقوم بحذف كافة قواعد البيانات المحلية والإعدادات
echo وكلمات المرور والحسابات القديمة المخزنة على هذا الجهاز نهائياً،
echo وإعادة النظام لحالة المصنع النقية (كأنه مثبت لأول مرة).
echo.
echo المسارات المستهدفة للتنظيف على هذا الجهاز:
echo   - %%ProgramData%%\RafiqPOS (قاعدة البيانات والبروفايل والنسخ)
echo   - %%APPDATA%%\RafiqPOS (بيانات التقارير)
echo   - %%LOCALAPPDATA%%\RafiqPOS (الملفات المؤقتة والكاش)
echo.
set /p CONFIRM="هل أنت متأكد من رغبتك في تصفير النظام على هذا الجهاز بالكامل؟ (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo.
    echo تم إلغاء العملية بناءً على طلبك. لم يتم حذف أي ملفات.
    echo.
    pause
    exit /b 0
)

echo.
echo [1/4] إيقاف تشغيل رفيق ومشغل الويب إن كان قيد العمل...
taskkill /f /im RafiqPOS.exe >nul 2>&1
taskkill /f /im msedgewebview2.exe >nul 2>&1

echo [2/4] تنظيف بيانات النظام المشتركة (ProgramData)...
if exist "%ProgramData%\RafiqPOS" (
    rmdir /s /q "%ProgramData%\RafiqPOS" >nul 2>&1
    echo   - تم حذف مجلد بيانات رفيق بالكامل من ProgramData.
)

echo [3/4] تنظيف بيانات المستخدم والكاش (AppData)...
if exist "%APPDATA%\RafiqPOS" (
    rmdir /s /q "%APPDATA%\RafiqPOS" >nul 2>&1
    echo   - تم تنظيف بيانات AppData.
)
if exist "%LOCALAPPDATA%\RafiqPOS" (
    rmdir /s /q "%LOCALAPPDATA%\RafiqPOS" >nul 2>&1
    echo   - تم تنظيف ملفات الكاش المحلية LocalAppData.
)

echo [4/4] تنظيف مجلدات التطوير المحلية إن وجدت بجانب الملف...
if exist "%~dp0desktop\bin\Release\data" (
    rmdir /s /q "%~dp0desktop\bin\Release\data" >nul 2>&1
)
if exist "%~dp0desktop\bin\Debug\data" (
    rmdir /s /q "%~dp0desktop\bin\Debug\data" >nul 2>&1
)

echo.
echo ======================================================================
echo               اكتمل التصفير الشامل للنظام بنجاح تام
echo ======================================================================
echo تم مسح كافة الحسابات والبيانات السابقة من هذا الجهاز.
echo عند تشغيل البرنامج الآن على هذا الجهاز، سيبدأ معالج الإعداد كأول مرة،
echo وستكون حسابات الدخول الافتراضية هي:
echo   - المسؤول (Admin): PIN 1234
echo   - الكاشير (Cashier): PIN 0000
echo ======================================================================
echo.
pause
