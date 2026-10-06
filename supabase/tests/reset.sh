#!/usr/bin/env bash
# Recria o banco de teste local e aplica stub + migrations + seed
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL="psql -h ${PGHOST:-/var/lib/pgtest} -p ${PGPORT:-54322} -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists topburger_test" -c "create database topburger_test"
$PSQL -d topburger_test -f supabase/tests/_supabase_stub.sql
for f in supabase/migrations/*.sql; do $PSQL -d topburger_test -f "$f"; done
if [ "${1:-}" != "--no-seed" ]; then $PSQL -d topburger_test -f supabase/seed.sql; fi
echo "OK: banco recriado"
