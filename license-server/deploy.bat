@echo off
chcp 65001 > nul
echo ========================================================
echo   نظام رفيق POS - رفع سيرفر التراخيص إلى Cloudflare
echo ========================================================
echo.

echo [1/3] فحص الاختبارات التلقائية...
call npm test
if %errorlevel% neq 0 (
    echo [خطأ] فشلت الاختبارات! تم إلغاء عملية الرفع.
    pause
    exit /b 1
)
echo [نجاح] جميع الاختبارات نجحت بنسبة 100%%.
echo.

echo [2/3] فحص تسجيل الدخول إلى Cloudflare...
call npx wrangler whoami
if %errorlevel% neq 0 (
    echo [تنبيه] يرجى تسجيل الدخول إلى Cloudflare أولاً:
    call npx wrangler login
)

echo.
echo [3/3] رفع السيرفر إلى Cloudflare Workers...
call npx wrangler deploy
if %errorlevel% neq 0 (
    echo [خطأ] فشل رفع السيرفر إلى Cloudflare.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   تم رفع سيرفر تراخيص رفيق بنجاح إلى شبكة Cloudflare!
echo ========================================================
pause
