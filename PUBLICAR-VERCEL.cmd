@echo off
title TOP BURGER OS - Publicar na Vercel
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar.ps1"
echo.
pause
