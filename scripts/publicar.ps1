# TOP BURGER OS - publica na Vercel a partir DESTA pasta.
# As chaves NAO sao enviadas no upload (.vercelignore); cadastre-as em
# Vercel > Settings > Environment Variables.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host ""
Write-Host "=== TOP BURGER OS - publicar na Vercel ===" -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js nao encontrado. Instale em https://nodejs.org" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "node_modules\next")) { Write-Host "`n[1/3] Instalando dependencias..."; npm install; if ($LASTEXITCODE -ne 0) { exit 1 } }
Write-Host "`n[2/3] Testando o build localmente (o mesmo que a Vercel roda)..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "`nBuild FALHOU. Nada foi publicado. Mande o erro acima para o Claude." -ForegroundColor Red; exit 1 }

Write-Host "`n[3/3] Publicando na Vercel (na primeira vez ele pede login e para escolher/criar o projeto)..."
npx --yes vercel@latest --prod
if ($LASTEXITCODE -ne 0) { Write-Host "`nA publicacao falhou." -ForegroundColor Red; exit 1 }
Write-Host "`nPublicado. Confira as variaveis em Vercel > Settings > Environment Variables" -ForegroundColor Green
Write-Host "e adicione https://SEU-PROJETO.vercel.app/** nas Redirect URLs do Supabase."
