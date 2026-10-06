#!/usr/bin/env bash
# Executa a suíte de testes do banco em um Postgres local.
# Uso: PGHOST=/var/lib/pgtest PGPORT=54322 ./supabase/tests/run.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
PSQL="psql -h ${PGHOST:-/var/lib/pgtest} -p ${PGPORT:-54322} -U postgres -v ON_ERROR_STOP=1 -q -d topburger_test"
./supabase/tests/reset.sh --no-seed >/dev/null 2>&1 || { echo "Falha ao recriar banco"; exit 1; }
$PSQL -f supabase/tests/00_bootstrap_users.sql >/dev/null
$PSQL -f supabase/seed.sql >/dev/null 2>&1 || { echo "Falha no seed"; $PSQL -f supabase/seed.sql; exit 1; }
$PSQL -f supabase/tests/_helpers.sql >/dev/null
total_pass=0; failed=0
for f in supabase/tests/[0-9][0-9]_*.sql; do
  [ "$(basename "$f")" = "00_bootstrap_users.sql" ] && continue
  out=$($PSQL -f "$f" 2>&1); code=$?
  pass=$(echo "$out" | grep -c "PASS:")
  total_pass=$((total_pass + pass))
  if [ $code -ne 0 ]; then
    failed=$((failed + 1))
    echo "✗ $(basename "$f") — $pass ok antes da falha"
    echo "$out" | grep -E "FAIL|ERROR|CONTEXT" | head -8 | sed 's/^/    /'
  else
    echo "✓ $(basename "$f") — $pass verificações"
  fi
done
for f in supabase/tests/[0-9][0-9]_*.sh; do
  [ -e "$f" ] || continue
  out=$(bash "$f" 2>&1); code=$?
  pass=$(echo "$out" | grep -c "PASS:")
  total_pass=$((total_pass + pass))
  if [ $code -ne 0 ]; then failed=$((failed + 1)); echo "✗ $(basename "$f")"; echo "$out" | grep -E "FAIL|ERROR" | head -8 | sed 's/^/    /';
  else echo "✓ $(basename "$f") — $pass verificações"; fi
done
echo "--------------------------------------------"
echo "Verificações aprovadas: $total_pass · arquivos com falha: $failed"
[ $failed -eq 0 ]
