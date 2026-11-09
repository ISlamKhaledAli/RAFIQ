@echo off
chcp 65001 > nul
title Rafiq POS - Deploy License Server to Cloudflare
echo ========================================================
echo   Rafiq POS - Deploy License Server to Cloudflare
echo ========================================================
echo.

echo [1/3] Running automated tests...
call npm test
if %errorlevel% neq 0 (
    echo [ERROR] Tests failed! Deployment cancelled.
    pause
    exit /b 1
)
echo [SUCCESS] All tests passed (100%%).
echo.

echo [2/3] Checking Cloudflare login...
call npx wrangler whoami
if %errorlevel% neq 0 (
    echo [NOTE] Please log in to Cloudflare:
    call npx wrangler login
)

echo.
echo [3/3] Deploying to Cloudflare Workers...
call npx wrangler deploy
if %errorlevel% neq 0 (
    echo [ERROR] Deployment to Cloudflare failed.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Rafiq POS License Server deployed successfully!
echo ========================================================
pause
