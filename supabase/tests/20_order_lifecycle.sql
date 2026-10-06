-- =====================================================================
-- CICLO DO PEDIDO: status, histórico, estoque (ficha técnica), entregador,
-- financeiro, CRM, fidelidade, cancelamento e avaliação
-- =====================================================================
\set QUIET on

-- Equipe da Levi (adicionada pelo dono = admin a001)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a002', 'kitchen', 'Cozinheiro');
select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a003', 'cashier', 'Caixa');
select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a004', 'driver', 'Entregador App', '71977776666');
select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a005', 'attendant', 'Atendente');
select tests.ok((select count(*) from public.drivers where user_id = '00000000-0000-0000-0000-00000000a004') = 1, 'função Entregador cria cadastro de entregador vinculado');
reset role;

-- Estoque inicial para comparação
create temp table s0 as select name, stock_qty from public.ingredients where organization_id = tests.levi();

-- Cliente faz o pedido: 2× Levi Especial (2 carnes, + bacon, sem cebola) + 1 batata + 1 coca
set role anon;
create temp table o1 as select public.place_order('leviburguer', jsonb_build_object(
  'type', 'delivery', 'zone_id', tests.zone('Centro'),
  'customer', jsonb_build_object('name', 'Cliente Fluxo', 'phone', '71966665555'),
  'address', jsonb_build_object('street', 'Rua A', 'number', '10', 'district', 'Centro'),
  'payment_method', 'pix',
  'items', jsonb_build_array(
    jsonb_build_object('product_id', tests.product('Levi Especial'), 'quantity', 2, 'options', jsonb_build_array(
      jsonb_build_object('modifier_id', tests.modifier('2 carnes')),
      jsonb_build_object('modifier_id', tests.modifier('Ao ponto')),
      jsonb_build_object('modifier_id', tests.modifier('Pão brioche')),
      jsonb_build_object('modifier_id', tests.modifier('Sem cebola')),
      jsonb_build_object('modifier_id', tests.modifier('Bacon extra')))),
    jsonb_build_object('product_id', tests.product('Batata frita'), 'quantity', 1),
    jsonb_build_object('product_id', tests.product('Coca-Cola lata'), 'quantity', 1)))) as r;
reset role;
grant select on o1, s0 to authenticated, anon;
create or replace function pg_temp.oid1() returns uuid language sql as $$ select (r->>'id')::uuid from o1 $$;

select tests.eq((select count(*)::int from public.inventory_movements where order_id = pg_temp.oid1()), 0, 'pedido NOVO ainda não baixa estoque');

-- Cozinha NÃO pode confirmar (só preparar/pronto)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.throws($$select public.update_order_status((select (r->>'id')::uuid from o1), 'confirmed')$$, 'Sem permissão', 'cozinha não confirma pedido');
select tests.throws($$select public.update_order_status((select (r->>'id')::uuid from o1), 'cancelled', 'teste')$$, 'Sem permissão', 'cozinha não cancela pedido');

-- Atendente confirma
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$select public.update_order_status((select (r->>'id')::uuid from o1), 'delivered')$$, 'Transição de status inválida', 'NOVO → ENTREGUE é transição inválida');
select tests.eq((public.update_order_status((select (r->>'id')::uuid from o1), 'confirmed')).status::text, 'confirmed', 'atendente confirma o pedido');
reset role;

-- Estoque baixado pela ficha técnica:
-- por Especial: brioche 1, carne 180 + 180 (2 carnes), cheddar 2, bacon 30 + 30 (extra), cebola 20 − 20 (sem cebola), tomate 20, picles 10, molho 20, embalagem 1
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Blend bovino'), 720.000, 'carne: 2 × (180 + 180 da variação 2 carnes) = 720 g');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Bacon'), 120.000, 'bacon: 2 × (30 + 30 do adicional) = 120 g');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Cebola'), 0.000, 'cebola: "sem cebola" anula o consumo');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Pão brioche'), 2.000, 'pão: 2 unidades');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Cheddar fatiado'), 4.000, 'cheddar: 4 fatias');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Batata pré-frita'), 200.000, 'batata: 200 g');
select tests.eq((select s0.stock_qty - i.stock_qty from public.ingredients i join s0 using (name) where i.name = 'Coca-Cola lata 350ml'), 1.000, 'coca: 1 lata');
select tests.ok((select bool_and(stock_deducted) from public.orders where id = pg_temp.oid1()), 'pedido marcado com stock_deducted');
create temp table m_count as select count(*) c from public.inventory_movements where order_id = pg_temp.oid1();

-- Cozinha prepara e finaliza (mesmo pedido real)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.eq((select count(*)::int from public.orders where id = (select (r->>'id')::uuid from o1)), 1, 'cozinha enxerga o pedido real');
select tests.eq((public.update_order_status((select (r->>'id')::uuid from o1), 'preparing')).status::text, 'preparing', 'cozinha: INICIAR PREPARO');
select tests.eq((public.update_order_status((select (r->>'id')::uuid from o1), 'ready')).status::text, 'ready', 'cozinha: PRONTO');
reset role;
select tests.eq((select count(*) from public.inventory_movements where order_id = pg_temp.oid1()), (select c from m_count), 'avançar status NÃO baixa estoque de novo');

-- Entregador: só vê pedidos atribuídos a ele
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);
select tests.eq((select count(*)::int from public.orders), 0, 'entregador não vê pedidos não atribuídos');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select public.assign_driver((select (r->>'id')::uuid from o1), (select id from public.drivers where user_id = '00000000-0000-0000-0000-00000000a004'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);
select tests.eq((select count(*)::int from public.orders), 1, 'entregador vê apenas o pedido atribuído');
select tests.eq((select count(*)::int from public.order_items where order_id = (select (r->>'id')::uuid from o1)), 3, 'entregador vê os itens do seu pedido');
select tests.eq((public.update_order_status((select (r->>'id')::uuid from o1), 'out_for_delivery')).status::text, 'out_for_delivery', 'entregador: SAIU PARA ENTREGA');
select tests.eq((select status::text from public.drivers where user_id = '00000000-0000-0000-0000-00000000a004'), 'on_delivery', 'entregador fica "em entrega"');
select tests.eq((public.update_order_status((select (r->>'id')::uuid from o1), 'delivered')).status::text, 'delivered', 'entregador: ENTREGUE');
reset role;

select tests.eq((select status::text from public.drivers where user_id = '00000000-0000-0000-0000-00000000a004'), 'available', 'entregador volta a ficar disponível');
select tests.eq((select payment_status::text from public.orders where id = pg_temp.oid1()), 'paid', 'entrega concluída marca pagamento');
select tests.eq((select amount from public.financial_entries where order_id = pg_temp.oid1() and type = 'income'), (select (r->>'total')::numeric from o1), 'FINANCEIRO registra a receita do pedido');
select tests.eq((select orders_count from public.customers where phone = '71966665555'), 1, 'CRM: pedidos do cliente = 1');
select tests.eq((select total_spent from public.customers where phone = '71966665555'), (select (r->>'total')::numeric from o1), 'CRM: total gasto atualizado');
select tests.eq((select la.points_balance from public.loyalty_accounts la join public.customers c on c.id = la.customer_id where c.phone = '71966665555'),
                (select floor(subtotal - discount)::int from public.orders where id = pg_temp.oid1()), 'FIDELIDADE: pontos = R$ 1 → 1 ponto (sem taxa de entrega)');
select tests.eq((select array_agg(to_status::text order by created_at) from public.order_status_history where order_id = pg_temp.oid1()),
  array['new','confirmed','preparing','ready','out_for_delivery','delivered'], 'histórico completo de status');
select tests.ok((select bool_and(changed_by is not null) from public.order_status_history where order_id = pg_temp.oid1() and from_status is not null), 'histórico registra quem alterou');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$select public.update_order_status((select (r->>'id')::uuid from o1), 'cancelled', 'tarde demais')$$, 'já finalizado', 'pedido entregue não pode ser cancelado');
reset role;

-- Avaliação pelo cliente
set role anon;
select tests.eq((public.submit_review((select r->>'token' from o1), 5, 'Muito bom!'))->>'ok', 'true', 'cliente avalia pedido entregue');
select tests.throws($$select public.submit_review((select r->>'token' from o1), 4, 'de novo')$$, 'já foi avaliado', 'avaliação única por pedido');
select tests.eq((public.get_storefront('leviburguer')->'rating'->>'count')::int, 1, 'cardápio mostra avaliação real');
reset role;

-- ---------------- CANCELAMENTO -----------------------------------------
create or replace function pg_temp.new_order(p_phone text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.place_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','PRIMEIRA',
       'customer', jsonb_build_object('name','Cancela', 'phone', p_phone), 'payment_method','pix',
       'items', jsonb_build_array(tests.especial(1))));
  return (v->>'id')::uuid;
end $$;

create temp table c1 as select pg_temp.new_order('71933330001') id;
create temp table c2 as select pg_temp.new_order('71933330002') id;
create temp table c3 as select pg_temp.new_order('71933330003') id;
grant select on c1, c2, c3 to authenticated;
create temp table s1 as select stock_qty from public.ingredients where organization_id = tests.levi() and name = 'Blend bovino';
create temp table coupon_before as select uses_count from public.coupons where code = 'PRIMEIRA' and organization_id = tests.levi();

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select public.update_order_status((select id from c1), 'confirmed');
select public.update_order_status((select id from c2), 'confirmed');
select public.update_order_status((select id from c2), 'preparing');
select public.update_order_status((select id from c3), 'confirmed');
select public.update_order_status((select id from c3), 'preparing');
select tests.throws($$select public.update_order_status((select id from c1), 'cancelled')$$, 'motivo', 'cancelamento exige motivo');
select public.update_order_status((select id from c1), 'cancelled', 'Cliente desistiu');
select public.update_order_status((select id from c2), 'cancelled', 'Endereço errado');
select public.update_order_status((select id from c3), 'cancelled', 'Pedido duplicado', true);
reset role;

select tests.eq((select stock_qty from public.ingredients where organization_id = tests.levi() and name = 'Blend bovino'),
  (select stock_qty from s1) - 180, 'estorno: cancelado antes do preparo devolve; cancelado em preparo com p_restock=true devolve');
select tests.eq((select count(*)::int from public.inventory_movements where order_id = (select id from c2) and type = 'sale_reversal'), 0,
  'regra padrão: cancelado após iniciar preparo NÃO estorna estoque (insumo consumido)');
select tests.eq((select count(*)::int from public.inventory_movements where order_id = (select id from c1) and type = 'sale_reversal'), 9, 'estorno gera movimentação por ingrediente');
select tests.ok((select cancel_reason = 'Cliente desistiu' and cancelled_by is not null and cancelled_at is not null from public.orders where id = (select id from c1)), 'cancelamento registra motivo, usuário e horário');
select tests.eq((select count(*)::int from public.orders where id in ((select id from c1), (select id from c2), (select id from c3))), 3, 'pedido cancelado não é excluído');
select tests.eq((select uses_count from public.coupons where code = 'PRIMEIRA' and organization_id = tests.levi()), (select uses_count from coupon_before) - 3, 'cancelamento devolve uso do cupom');
select tests.eq((select to_status::text from public.order_status_history where order_id = (select id from c1) order by created_at desc limit 1), 'cancelled', 'histórico registra cancelamento');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$select public.update_order_status((select id from c1), 'confirmed')$$, 'já finalizado', 'cancelado não volta a andar');

-- Edição direta de valores é bloqueada (mesmo para quem gerencia pedidos)
select tests.throws($$update public.orders set total = 1 where id = (select id from c1)$$, 'Use as ações do pedido', 'UPDATE direto em total é bloqueado');
select tests.throws($$update public.orders set status = 'confirmed' where id = (select id from c1)$$, 'Use as ações do pedido', 'UPDATE direto em status é bloqueado');
select tests.eq(tests.affected($$update public.orders set notes = 'obs interna' where id = (select id from c1)$$), 1, 'campos operacionais (observação) podem ser editados');
select tests.eq(tests.affected($$delete from public.orders where id = (select id from c1)$$), 0, 'DELETE em pedidos não afeta linhas');
reset role;

-- Pix: pagamento só com confirmação humana
create temp table p1 as select pg_temp.new_order('71933330009') id;
grant select on p1 to authenticated;
select tests.eq((select payment_status::text from public.orders where id = (select id from p1)), 'pending', 'pedido Pix nasce pendente (sem baixa automática)');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.throws($$select public.mark_order_paid((select id from p1))$$, 'Sem permissão', 'cozinha não confirma pagamento');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.eq((public.mark_order_paid((select id from p1))).payment_status::text, 'paid', 'atendente confirma Pix recebido');
reset role;
select tests.eq((select count(*)::int from public.financial_entries where order_id = (select id from p1)), 1, 'Pix confirmado gera receita uma única vez');
