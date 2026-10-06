-- =====================================================================
-- CAIXA / PDV e MESAS (QR Code)
-- =====================================================================
\set QUIET on

set role authenticated;
-- Cozinha não opera caixa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.throws($$select public.open_cash_register(tests.levi(), 100)$$, 'Sem permissão', 'cozinha não abre caixa');

-- Caixa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', false);
select tests.throws($$select public.create_staff_order(tests.levi(), jsonb_build_object('type','counter','payment_method','cash',
  'items', jsonb_build_array(tests.especial(1))))$$, 'Abra o caixa', 'venda no balcão exige caixa aberto');
create temp table reg as select (public.open_cash_register(tests.levi(), 150, 'Troco inicial')).id;
select tests.ok((select id from reg) is not null, 'caixa aberto com valor inicial 150');
select tests.eq((select opened_by from public.cash_registers where id = (select id from reg)), '00000000-0000-0000-0000-00000000a003'::uuid, 'abertura registra o usuário');
select tests.throws($$select public.open_cash_register(tests.levi(), 10)$$, 'Já existe um caixa aberto', 'não abre dois caixas');

-- Venda no balcão: 2 Especiais em dinheiro com desconto manual de 5
create temp table v1 as select public.create_staff_order(tests.levi(), jsonb_build_object(
  'type', 'counter', 'payment_method', 'cash', 'manual_discount', 5, 'customer', jsonb_build_object('name', 'Balcão'),
  'items', jsonb_build_array(tests.especial(2)))) as r;
select tests.eq((select (r->>'total')::numeric from v1), 60.80, 'venda balcão: 2 × 32,90 − 5,00 de desconto');
select tests.eq((select status::text from public.orders where id = (select (r->>'id')::uuid from v1)), 'confirmed', 'venda do PDV vai direto para a cozinha');
select tests.eq((select payment_status::text from public.orders where id = (select (r->>'id')::uuid from v1)), 'paid', 'venda do PDV já entra paga');
-- Venda Pix e cartão
select public.create_staff_order(tests.levi(), jsonb_build_object('type','counter','payment_method','pix',
  'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Coca-Cola lata'), 'quantity', 2))));
select public.create_staff_order(tests.levi(), jsonb_build_object('type','counter','payment_method','card',
  'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Brownie'), 'quantity', 1))));

-- Sangria / suprimento
select tests.throws($$select public.add_cash_movement(tests.levi(), 'withdrawal', 20, '')$$, 'motivo', 'sangria exige motivo');
select tests.throws($$select public.add_cash_movement(tests.levi(), 'withdrawal', 5000, 'Depósito')$$, 'maior que o dinheiro', 'sangria não pode exceder o dinheiro em caixa');
select public.add_cash_movement(tests.levi(), 'withdrawal', 50, 'Pagamento do gás');
select public.add_cash_movement(tests.levi(), 'supply', 30, 'Reforço de troco');

-- Resumo e fechamento: esperado = 150 + 60,80 − 50 + 30 = 190,80
select tests.eq((public.cash_register_summary((select id from reg))->>'expected_cash')::numeric, 190.80, 'dinheiro esperado em caixa');
select tests.eq((public.cash_register_summary((select id from reg))->>'sales_pix')::numeric, 12.00, 'vendas Pix no caixa');
select tests.eq((public.cash_register_summary((select id from reg))->>'sales_card')::numeric, 12.90, 'vendas cartão no caixa');
create temp table closing as select public.close_cash_register(tests.levi(), 185.80, 'Faltou troco') as s;
select tests.eq((select (s->>'difference')::numeric from closing), -5.00, 'fechamento calcula diferença (informado − esperado)');
select tests.eq((select status from public.cash_registers where id = (select id from reg)), 'closed', 'caixa fechado');
select tests.throws($$select public.add_cash_movement(tests.levi(), 'supply', 10, 'x')$$, 'Nenhum caixa aberto', 'sem movimentação com caixa fechado');
reset role;

-- ---------------- MESAS ------------------------------------------------
create temp table mesa as select id, qr_token, label from public.dining_tables where organization_id = tests.levi() and label = 'Mesa 04';
grant select on mesa to anon, authenticated;
set role anon;
select tests.eq(public.get_table('leviburguer', (select qr_token from mesa))->>'label', 'Mesa 04', 'QR Code identifica a Mesa 04');
create temp table t1 as select public.place_order('leviburguer', jsonb_build_object('type', 'delivery', 'table_token', (select qr_token from mesa),
  'customer', jsonb_build_object('name', 'Mesa Quatro'), 'payment_method', 'card', 'items', jsonb_build_array(tests.especial(1)))) as r;
create temp table t2 as select public.place_order('leviburguer', jsonb_build_object('table_token', (select qr_token from mesa),
  'customer', jsonb_build_object('name', 'Mesa Quatro'), 'payment_method', 'card',
  'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Coca-Cola lata'), 'quantity', 2)))) as r;
reset role;
grant select on t1, t2 to authenticated;
select tests.eq((select type::text from public.orders where id = (select (r->>'id')::uuid from t1)), 'dine_in', 'pedido da mesa é sempre consumo no local (sem endereço)');
select tests.eq((select status::text from public.orders where id = (select (r->>'id')::uuid from t1)), 'confirmed', 'pedido da mesa vai direto para a cozinha');
select tests.eq((select table_session_id from public.orders where id = (select (r->>'id')::uuid from t1)),
                (select table_session_id from public.orders where id = (select (r->>'id')::uuid from t2)), 'pedidos da mesa ficam na mesma conta');
select tests.eq((select status::text from public.dining_tables where id = (select id from mesa)), 'occupied', 'mesa fica ocupada');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$select public.close_table_session((select table_session_id from public.orders where id = (select (r->>'id')::uuid from t1)), 'card')$$,
  'em preparo', 'não fecha conta com pedido em preparo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select public.update_order_status((select (r->>'id')::uuid from t1), 'preparing');
select public.update_order_status((select (r->>'id')::uuid from t1), 'ready');
select public.update_order_status((select (r->>'id')::uuid from t2), 'ready');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.eq((public.close_table_session((select table_session_id from public.orders where id = (select (r->>'id')::uuid from t1)), 'pix')->>'total')::numeric,
  44.90, 'conta da mesa: 32,90 + 2 × 6,00 = 44,90');
reset role;
select tests.eq((select status::text from public.dining_tables where id = (select id from mesa)), 'free', 'mesa liberada após pagamento');
select tests.eq((select count(*)::int from public.orders where table_session_id = (select table_session_id from public.orders where id = (select (r->>'id')::uuid from t1))
                 and status = 'delivered' and payment_status = 'paid' and payment_method = 'pix'), 2, 'pedidos da mesa concluídos e pagos');
select tests.eq((select count(*)::int from public.financial_entries where order_id in ((select (r->>'id')::uuid from t1), (select (r->>'id')::uuid from t2))), 2, 'conta da mesa registrada no financeiro');
