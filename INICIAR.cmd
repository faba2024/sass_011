@echo off
rem Inicia o TOP BURGER OS em http://localhost:3000
cd /d "%~dp0"
findstr /r /c:"^NEXT_PUBLIC_SUPABASE_ANON_KEY=..........*" .env.local >nul 2>&1 || (echo Chaves do Supabase ausentes no .env.local. Rode CONFIGURAR.cmd primeiro. & pause & exit /b 1)
if not exist node_modules\next call npm install --no-audit --no-fund
start "" http://localhost:3000/login
npm run dev
