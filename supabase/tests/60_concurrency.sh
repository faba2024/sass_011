#!/usr/bin/env bash
# =====================================================================
# CONCORRÊNCIA: sessões paralelas reais no Postgres
# =====================================================================
set -uo pipefail
PSQL="psql -h ${PGHOST:-/var/lib/pgtest} -p ${PGPORT:-54322} -U postgres -q -t -A -d topburger_test"
fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "PASS: $1"; }

$PSQL -c "update public.organizations set store_mode = 'open' where slug = 'leviburguer'" >/dev/null

# 1) 30 pedidos simultâneos → números únicos e sequenciais
before=$($PSQL -c "select order_seq from public.organizations where slug = 'leviburguer'")
for i in $(seq 1 30); do
  $PSQL -c "set role anon; select public.place_order('leviburguer', jsonb_build_object('type','pickup','payment_method','pix',
    'customer', jsonb_build_object('name','Paralelo $i','phone','7192000$(printf %04d $i)'),
    'items', jsonb_build_array(tests.especial(1))))" >/dev/null 2>&1 &
done
wait
after=$($PSQL -c "select order_seq from public.organizations where slug = 'leviburguer'")
dups=$($PSQL -c "select count(*) from (select number from public.orders where organization_id = tests.levi() group by number having count(*) > 1) x")
created=$($PSQL -c "select count(*) from public.orders where customer_name like 'Paralelo %'")
[ "$created" = "30" ] || fail "30 pedidos paralelos criados (obtido $created)"
pass "30 pedidos simultâneos gravados"
[ "$dups" = "0" ] || fail "números de pedido duplicados: $dups"
[ $((after - before)) -eq 30 ] || fail "sequência avançou $((after - before))"
pass "números de pedido únicos e sequenciais sob concorrência"

# 2) Cupom com 1 uso disputado por 8 clientes ao mesmo tempo
$PSQL -c "insert into public.coupons (organization_id, code, type, value, max_uses) values (tests.levi(), 'ULTIMO', 'fixed', 5, 1)" >/dev/null
for i in $(seq 1 8); do
  $PSQL -c "set role anon; select public.place_order('leviburguer', jsonb_build_object('type','pickup','payment_method','pix','coupon_code','ULTIMO',
    'customer', jsonb_build_object('name','Cupom $i','phone','7193000$(printf %04d $i)'),
    'items', jsonb_build_array(tests.especial(1))))" >/dev/null 2>&1 &
done
wait
used=$($PSQL -c "select uses_count from public.coupons where code = 'ULTIMO'")
withc=$($PSQL -c "select count(*) from public.orders where coupon_code = 'ULTIMO'")
[ "$used" = "1" ] && [ "$withc" = "1" ] || fail "cupom de uso único usado $withc vezes (uses_count=$used)"
pass "cupom de uso único não é usado duas vezes em corrida"

# 3) Duas pessoas confirmam o mesmo pedido ao mesmo tempo → estoque baixa uma vez
oid=$($PSQL -c "set role anon; select public.place_order('leviburguer', jsonb_build_object('type','pickup','payment_method','pix',
    'customer', jsonb_build_object('name','Duplo Clique','phone','71940000001'), 'items', jsonb_build_array(tests.especial(1))))->>'id'" | tail -1)
for u in a005 a001; do
  $PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000$u', false);
            select public.update_order_status('$oid', 'confirmed')" >/dev/null 2>&1 &
done
wait
moves=$($PSQL -c "select count(*) from public.inventory_movements where order_id = '$oid' and type = 'sale'")
hist=$($PSQL -c "select count(*) from public.order_status_history where order_id = '$oid' and to_status = 'confirmed'")
[ "$moves" = "9" ] || fail "baixa de estoque duplicada/ausente: $moves movimentos"
[ "$hist" = "1" ] || fail "histórico de confirmação duplicado: $hist"
pass "confirmação simultânea baixa estoque uma única vez"

# 4) Dois caixas abertos ao mesmo tempo → apenas um
$PSQL -c "update public.cash_registers set status = 'closed', closed_at = now() where status = 'open'" >/dev/null
for i in 1 2 3; do
  $PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', false);
            select public.open_cash_register(tests.levi(), 100)" >/dev/null 2>&1 &
done
wait
open=$($PSQL -c "select count(*) from public.cash_registers where organization_id = tests.levi() and status = 'open'")
[ "$open" = "1" ] || fail "caixas abertos simultaneamente: $open"
pass "apenas um caixa aberto mesmo com cliques simultâneos"
