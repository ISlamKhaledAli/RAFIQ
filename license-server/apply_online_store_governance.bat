@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Rafiq POS - One-Time Online Store Governance Setup
echo ============================================================
echo   Rafiq POS - One-Time License Server Governance Setup
echo ============================================================
echo.

echo [1/4] Running automated license-server tests...
call npm test
if %errorlevel% neq 0 (
    echo [ERROR] Tests failed! Setup cancelled.
    pause
    exit /b 1
)

echo.
echo [2/4] Applying D1 Migration 0003 (online_store_enabled/plan/expires_at/slug)...
call npx wrangler d1 migrations apply rafiq-licenses --remote
if %errorlevel% neq 0 (
    echo [ERROR] D1 migration failed. Make sure your Cloudflare API token for khaledislam9003@gmail.com has "D1: Edit" and "Workers Scripts: Edit", or run "npx wrangler login".
    pause
    exit /b 1
)

echo.
echo [3/4] Uploading shared GOVERNANCE_WEBHOOK_SECRET to rafiq-license-server...
if not exist ".secrets\governance.secret.json" (
    echo [ERROR] Missing .secrets\governance.secret.json!
    pause
    exit /b 1
)
call npx wrangler secret bulk .secrets\governance.secret.json
if %errorlevel% neq 0 (
    echo [ERROR] Failed to upload GOVERNANCE_WEBHOOK_SECRET.
    pause
    exit /b 1
)

echo.
echo [4/4] Deploying updated rafiq-license-server...
call npx wrangler deploy
if %errorlevel% neq 0 (
    echo [ERROR] Deployment failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS! Cross-account Kill-Switch is now LIVE!
echo   You never need to run this script again.
echo ============================================================
pause
