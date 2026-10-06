# TOP BURGER OS — instala dependências e verifica o projeto (Windows)
# Gera o relatório "verificacao.txt" na raiz do projeto.
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
$log = Join-Path (Get-Location) "verificacao.txt"
"TOP BURGER OS - verificacao $(Get-Date -Format 'dd/MM/yyyy HH:mm')" | Out-File $log -Encoding utf8

function Etapa($nome, $cmd) {
  Write-Host ""
  Write-Host "==> $nome" -ForegroundColor Yellow
  "`n==================== $nome ====================" | Out-File $log -Append -Encoding utf8
  $saida = cmd /c "$cmd 2>&1"
  $codigo = $LASTEXITCODE
  $saida | Out-File $log -Append -Encoding utf8
  if ($codigo -eq 0) { Write-Host "    OK" -ForegroundColor Green; "RESULTADO: OK" | Out-File $log -Append -Encoding utf8 }
  else { Write-Host "    FALHOU (veja verificacao.txt)" -ForegroundColor Red; "RESULTADO: FALHOU (codigo $codigo)" | Out-File $log -Append -Encoding utf8 }
  return $codigo
}

$node = (cmd /c "node --version 2>&1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo." -ForegroundColor Red
  "Node.js nao encontrado" | Out-File $log -Append -Encoding utf8
  Read-Host "Enter para sair"; exit 1
}
"Node $node" | Out-File $log -Append -Encoding utf8
Write-Host "Node $node"

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Criado .env.local a partir do .env.example (preencha as chaves do Supabase depois)." -ForegroundColor Cyan
}

$r = @{}
if (Test-Path "node_modules\next") { Write-Host "==> npm install (ja instalado, pulando)" -ForegroundColor Yellow; $r.install = 0 }
else { $r.install = Etapa "npm install" "npm install --no-audit --no-fund" }
$r.bundle    = Etapa "Gerar SQL (bundle)" "npm run db:bundle -- --seed"
$r.typecheck = Etapa "TypeScript"         "npm run typecheck"
$r.lint      = Etapa "ESLint"             "npm run lint"
$r.test      = Etapa "Testes unitarios"   "npm test"
$r.build     = Etapa "Build de producao"  "npm run build"

Write-Host ""
Write-Host "Resumo:" -ForegroundColor Yellow
"`n==================== RESUMO ====================" | Out-File $log -Append -Encoding utf8
foreach ($k in "install","bundle","typecheck","lint","test","build") {
  $s = if ($r[$k] -eq 0) { "OK" } else { "FALHOU" }
  Write-Host ("  {0,-10} {1}" -f $k, $s)
  ("{0,-10} {1}" -f $k, $s) | Out-File $log -Append -Encoding utf8
}
Write-Host ""
Write-Host "Relatorio completo: $log" -ForegroundColor Cyan
Write-Host "Mande esse arquivo (ou peca para o Claude ler a pasta) para corrigir o que falhou."
Write-Host "Esta janela fecha sozinha em 20 segundos."
Start-Sleep -Seconds 20
