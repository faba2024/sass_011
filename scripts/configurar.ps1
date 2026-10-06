# TOP BURGER OS - configura as chaves do Supabase no .env.local e inicia o sistema.
# As chaves sao digitadas/coladas aqui e gravadas SOMENTE no .env.local deste computador.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path (Get-Location) ".env.local"
$url = "https://wdktoipuwrqzezmhgwft.supabase.co"

Write-Host ""
Write-Host "TOP BURGER OS - configuracao do Supabase" -ForegroundColor Yellow
Write-Host "Abra no navegador: https://supabase.com/dashboard/project/wdktoipuwrqzezmhgwft/settings/api-keys"
Write-Host ""

function Ler-Chave($titulo, $secreta) {
  while ($true) {
    if ($secreta) {
      $s = Read-Host "$titulo (cole com clique direito e Enter; nao aparece na tela)" -AsSecureString
      $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    } else {
      $v = Read-Host "$titulo (cole com clique direito e Enter)"
    }
    $v = ($v -replace '\s', '')
    if ($v.Length -ge 30) { return $v }
    Write-Host "  Chave vazia ou curta demais. Tente de novo." -ForegroundColor Red
  }
}

$anon = Ler-Chave "1/2  Chave anon / publishable" $false
$service = Ler-Chave "2/2  Chave service_role / secret" $true
if ($anon -eq $service) { Write-Host "As duas chaves sao iguais. Confira: a primeira e a publica (anon/publishable), a segunda a secreta." -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }

# Confere as chaves no proprio Supabase (sem mostrar nada)
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$url/rest/v1/rpc/platform_public" -Method Post -Body "{}" -ContentType "application/json" -Headers @{ apikey = $anon; Authorization = "Bearer $anon" }
  Write-Host "  Chave publica OK" -ForegroundColor Green
} catch { Write-Host "  O Supabase recusou a chave publica. Confira se copiou a anon/publishable correta." -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$url/rest/v1/platform_settings?select=key&limit=1" -Headers @{ apikey = $service; Authorization = "Bearer $service" }
  Write-Host "  Chave secreta OK" -ForegroundColor Green
} catch { Write-Host "  O Supabase recusou a chave secreta. Confira se copiou a service_role/secret correta." -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }

$conteudo = @"
# TOP BURGER OS - variaveis locais (NAO compartilhe este arquivo)
NEXT_PUBLIC_SUPABASE_URL=$url
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ROOT_DOMAIN=
"@
[IO.File]::WriteAllText($envFile, $conteudo, (New-Object Text.UTF8Encoding $false))
$anon = $null; $service = $null
Write-Host ""
Write-Host ".env.local salvo." -ForegroundColor Green

# Encerra servidores Next antigos DESTE projeto (porta 3000)
try {
  $pids = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
  foreach ($p in $pids) {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").CommandLine
    if ($cmd -match "next") { Stop-Process -Id $p -Force; Write-Host "Servidor antigo encerrado (PID $p)." }
  }
} catch {}

Write-Host "Iniciando o sistema em http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process "http://localhost:3000/login"
npm run dev
