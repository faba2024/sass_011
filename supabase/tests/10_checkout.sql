-- =====================================================================
-- CHECKOUT: preço recalculado no servidor, validações, cupom, entrega
-- Executado como ANON (cliente sem conta)
-- =====================================================================
\set QUIET on
set role anon;
select set_config('request.jwt.claim.sub', '', false);

-- Cardápio público
select tests.ok(public.get_storefront('leviburguer') is not null, 'anon lê o cardápio público via RPC');
select tests.eq(jsonb_array_length(public.get_storefront('leviburguer')->'products'), 13, 'cardápio traz 13 produtos ativos');
select tests.ok(public.get_storefront('nao-existe') is null, 'slug inexistente retorna null');
select tests.throws('select * from public.products', 'permission denied', 'anon NÃO lê tabela products diretamente');
select tests.throws('select * from public.orders', 'permission denied', 'anon NÃO lê tabela orders');
select tests.throws('select * from public.customers', 'permission denied', 'anon NÃO lê tabela customers');
select tests.throws($$select public.dashboard_summary(tests.levi())$$, 'permission denied', 'anon NÃO executa RPC interna');
select tests.throws($$select public._create_order(tests.levi(), '{}', 'pdv', 'confirmed', true)$$, 'permission denied', 'anon NÃO executa _create_order');

-- Motor de preço: Levi Especial 32,90 + 2 carnes (8) + 2x bacon (5) + sem cebola (0) = 50,90
select tests.eq(
  (public.quote_order('leviburguer', jsonb_build_object('type', 'pickup', 'items', jsonb_build_array(
    jsonb_build_object('product_id', tests.product('Levi Especial'), 'quantity', 2, 'options', jsonb_build_array(
      jsonb_build_object('modifier_id', tests.modifier('2 carnes')),
      jsonb_build_object('modifier_id', tests.modifier('Ao ponto')),
      jsonb_build_object('modifier_id', tests.modifier('Pão brioche')),
      jsonb_build_object('modifier_id', tests.modifier('Sem cebola')),
      jsonb_build_object('modifier_id', tests.modifier('Bacon extra'), 'quantity', 2)))))) ->> 'subtotal')::numeric,
  101.80, 'subtotal = 2 × (32,90 + 8 + 2×5) calculado no servidor');

-- Preço enviado pelo navegador é ignorado
select tests.eq(
  (public.quote_order('leviburguer', jsonb_build_object('type', 'pickup', 'total', 1, 'subtotal', 1,
    'items', jsonb_build_array(tests.especial(1) || '{"price": 0.01, "unit_price": 0.01}'))) ->> 'total')::numeric,
  32.90, 'campos de preço/total enviados pelo cliente são ignorados');

-- Produto em promoção usa preço promocional atual
select tests.eq(
  (public.quote_order('leviburguer', jsonb_build_object('type', 'pickup', 'items', jsonb_build_array(
    jsonb_build_object('product_id', tests.product('Cheddar Duplo'), 'quantity', 1, 'options', jsonb_build_array(
      jsonb_build_object('modifier_id', tests.modifier('Ao ponto'))))))) ->> 'total')::numeric,
  29.90, 'preço promocional aplicado');

-- Regras de personalização
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  jsonb_build_object('product_id', tests.product('Levi Especial'), 'quantity', 1))))$$,
  'Escolha a carne', 'grupo obrigatório não selecionado é recusado');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  tests.especial(1, jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('2 carnes')))))))$$,
  'máximo de 1', 'escolha única não aceita duas opções');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  tests.especial(1, jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Bacon extra'), 'quantity', 4))))))$$,
  'máximo 3', 'quantidade acima do máximo por opção é recusada');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  tests.especial(1, jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Barbecue')))))))$$,
  'não está mais disponível', 'opção de outro produto (molho do combo) é recusada');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  jsonb_build_object('product_id', gen_random_uuid(), 'quantity', 1))))$$,
  'não está mais disponível', 'produto inexistente é recusado');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  tests.especial(0))))$$, 'Quantidade inválida', 'quantidade zero é recusada');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', '[]'::jsonb))$$,
  'vazio', 'carrinho vazio é recusado');

-- Combo
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  jsonb_build_object('product_id', tests.product('Combo Levi'), 'quantity', 1,
    'options', jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Maionese verde'))),
    'combo', jsonb_build_array(jsonb_build_object('combo_group_id', tests.cg('Escolha seu burger'), 'product_id', tests.product('Levi Especial')))))))$$,
  'Combo "Combo Levi": escolha', 'combo sem bebida/acompanhamento é recusado');
select tests.throws($$select public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array(
  jsonb_build_object('product_id', tests.product('Combo Levi'), 'quantity', 1,
    'options', jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Maionese verde'))),
    'combo', jsonb_build_array(jsonb_build_object('combo_group_id', tests.cg('Escolha seu burger'), 'product_id', tests.product('Brownie')))))))$$,
  'Escolha inválida', 'produto fora das opções do combo é recusado');

create temp table combo_payload as select jsonb_build_object('product_id', tests.product('Combo Levi'), 'quantity', 1,
    'options', jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Barbecue'))),
    'combo', jsonb_build_array(
      jsonb_build_object('combo_group_id', tests.cg('Escolha seu burger'), 'product_id', tests.product('Cheddar Duplo')),
      jsonb_build_object('combo_group_id', tests.cg('Acompanhamento'), 'product_id', tests.product('Batata frita')),
      jsonb_build_object('combo_group_id', tests.cg('Escolha a bebida'), 'product_id', tests.product('Guaraná lata')))) as item;
reset role;
grant select on combo_payload to anon, authenticated;
set role anon;
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','items', jsonb_build_array((select item from combo_payload))))->>'total')::numeric,
  47.90, 'combo com Cheddar Duplo (+3) = 47,90');

-- Entrega: zona, taxa, pedido mínimo
select tests.throws($$select public._price_cart(tests.levi(), '{}', true)$$, 'permission denied', 'anon não chama motor interno');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Jardim Primavera'),
  'items', jsonb_build_array(tests.especial(1))))->>'delivery_fee')::numeric, 6.00, 'taxa da zona Jardim Primavera = 6,00');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Alto da Colina'),
  'items', jsonb_build_array(tests.especial(1))))->>'below_minimum')::boolean, true, 'cotação indica pedido abaixo do mínimo da zona (R$ 40)');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup',
  'items', jsonb_build_array(tests.especial(1))))->>'delivery_fee')::numeric, 0.00, 'retirada não cobra taxa');

-- Cupons (validados no servidor)
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','LEVI10',
  'customer', jsonb_build_object('name','Sem Fone'), 'payment_method','pix', 'items', jsonb_build_array(tests.especial(1))))$$,
  'telefone', 'cupom com limite por cliente exige telefone');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','levi10',
  'customer', jsonb_build_object('phone','71955554444'), 'items', jsonb_build_array(tests.especial(1))))->>'discount')::numeric, 3.29, 'LEVI10 = 10% de 32,90');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','LEVI10',
  'customer', jsonb_build_object('phone','71955554444'), 'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Brownie'), 'quantity', 1))))->>'coupon_error'),
  'Cupom válido para pedidos a partir de R$ 30,00', 'cupom respeita pedido mínimo');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','FRETEGRATIS',
  'items', jsonb_build_array(tests.especial(2))))->>'coupon_error'), 'Cupom de frete grátis vale apenas para entrega', 'frete grátis só vale para entrega');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','NAOEXISTE',
  'items', jsonb_build_array(tests.especial(1))))->>'coupon_error'), 'Cupom inválido', 'cupom inexistente');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','PRIMEIRA',
  'customer', jsonb_build_object('phone', '71990000001'), 'items', jsonb_build_array(tests.especial(1))))->>'coupon_error'),
  'Cupom válido apenas para a primeira compra', 'cupom de primeira compra recusado para cliente recorrente');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','PRIMEIRA',
  'customer', jsonb_build_object('phone', '71988887777'), 'items', jsonb_build_array(tests.especial(1))))->>'discount')::numeric,
  8.00, 'cupom de primeira compra aceito para cliente novo');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','BATATAFREE',
  'items', jsonb_build_array(tests.especial(2))))->>'coupon_error'), 'Adicione "Batata frita" ao carrinho para usar este cupom', 'cupom de produto grátis exige o produto');
select tests.eq((public.quote_order('leviburguer', jsonb_build_object('type','pickup','coupon_code','BATATAFREE',
  'items', jsonb_build_array(tests.especial(2), jsonb_build_object('product_id', tests.product('Batata frita'), 'quantity', 1))))->>'discount')::numeric,
  14.90, 'cupom de produto grátis desconta a batata');

-- Pedido real (transacional)
create temp table placed as
select public.place_order('leviburguer', jsonb_build_object(
  'type', 'delivery', 'zone_id', tests.zone('Centro'),
  'customer', jsonb_build_object('name', 'Fabricio Teste', 'phone', '(71) 98888-1111'),
  'address', jsonb_build_object('zip', '40000-000', 'street', 'Rua das Flores', 'number', '120', 'district', 'Centro', 'reference', 'Portão azul'),
  'payment_method', 'cash', 'change_for', 100, 'coupon_code', 'LEVI10', 'notes', 'Caprichar no molho',
  'total', 0.01,
  'items', jsonb_build_array(
    tests.especial(2, jsonb_build_array(jsonb_build_object('modifier_id', tests.modifier('Sem cebola')), jsonb_build_object('modifier_id', tests.modifier('Bacon extra')))),
    jsonb_build_object('product_id', tests.product('Batata frita'), 'quantity', 1, 'notes', 'bem sequinha'),
    jsonb_build_object('product_id', tests.product('Coca-Cola lata'), 'quantity', 1)))) as r;
reset role;
grant select on placed to anon, authenticated;

select tests.eq((select (r->>'total')::numeric from placed), round((2 * 37.90 + 14.90 + 6.00) * 0.9, 2) + 4.00, 'total = produtos − 10% + taxa 4,00 (valor 0,01 do cliente ignorado)');
select tests.eq((select status::text from public.orders where id = (select (r->>'id')::uuid from placed)), 'new', 'pedido nasce como NOVO');
select tests.eq((select count(*)::int from public.order_items where order_id = (select (r->>'id')::uuid from placed)), 3, 'order_items gravados');
select tests.eq((select count(*)::int from public.order_item_modifiers m join public.order_items i on i.id = m.order_item_id where i.order_id = (select (r->>'id')::uuid from placed)), 5, 'order_item_modifiers gravados (3 variações + sem cebola + bacon)');
select tests.eq((select count(*)::int from public.order_status_history where order_id = (select (r->>'id')::uuid from placed)), 1, 'histórico registra criação');
select tests.eq((select phone from public.customers where id = (select customer_id from public.orders where id = (select (r->>'id')::uuid from placed))), '71988881111', 'cliente criado/atualizado pelo telefone normalizado');
select tests.eq((select count(*)::int from public.customer_addresses a join public.customers c on c.id = a.customer_id where c.phone = '71988881111'), 1, 'endereço salvo para cliente recorrente');
select tests.eq((select uses_count from public.coupons where code = 'LEVI10'), 1, 'uso do cupom contabilizado');
select tests.eq((select count(*)::int from public.notifications where type = 'new_order' and link like '%' || (select r->>'id' from placed)), 1, 'notificação de novo pedido criada');
select tests.ok((select number from public.orders where id = (select (r->>'id')::uuid from placed)) > 1000, 'número sequencial do pedido gerado');

set role anon;
select tests.eq((public.get_public_order((select r->>'token' from placed))->>'status'), 'new', 'cliente acompanha o pedido pelo token');
select tests.ok(public.get_public_order('token-invalido') is null, 'token inválido não revela pedido');

-- Validações no momento de confirmar
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Centro'),
  'customer', jsonb_build_object('name','A','phone','71911112222'), 'payment_method','pix',
  'address', jsonb_build_object('street','Rua X','number','1','district','Centro'), 'items', jsonb_build_array(tests.especial(1))))$$,
  'Informe seu nome', 'nome obrigatório');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Centro'),
  'customer', jsonb_build_object('name','Ana'), 'payment_method','pix',
  'address', jsonb_build_object('street','Rua X','number','1','district','Centro'), 'items', jsonb_build_array(tests.especial(1))))$$,
  'telefone', 'telefone obrigatório');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Centro'),
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'address', jsonb_build_object('street','Rua X','district','Centro'), 'items', jsonb_build_array(tests.especial(1))))$$,
  'Endereço incompleto', 'endereço sem número recusado');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','delivery',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'address', jsonb_build_object('street','Rua X','number','1','district','Centro'), 'items', jsonb_build_array(tests.especial(1))))$$,
  'bairro de entrega', 'entrega sem zona recusada');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','delivery','zone_id', tests.zone('Alto da Colina'),
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'address', jsonb_build_object('street','Rua X','number','1','district','Alto'), 'items', jsonb_build_array(tests.especial(1))))$$,
  'pedido mínimo', 'pedido mínimo da zona bloqueia confirmação');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','cash', 'change_for', 10,
  'items', jsonb_build_array(tests.especial(1))))$$, 'troco', 'troco menor que o total recusado');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','card_online',
  'items', jsonb_build_array(tests.especial(1))))$$, 'online ainda não', 'cartão online ainda não aceito');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup', 'coupon_code', 'NAOEXISTE',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'items', jsonb_build_array(tests.especial(1))))$$, 'Cupom inválido', 'cupom inválido bloqueia confirmação (sem desconto silencioso)');

-- Produto esgotado / inativo
reset role;
update public.products set is_available = false, unavailable_reason = 'manual' where id = tests.product('Frango Crispy');
update public.products set is_active = false where id = tests.product('Smash Clássico');
set role anon;
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Frango Crispy'), 'quantity', 1))))$$,
  'esgotado', 'produto esgotado recusado');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'items', jsonb_build_array(jsonb_build_object('product_id', tests.product('Smash Clássico'), 'quantity', 1))))$$,
  'não está mais disponível', 'produto inativo recusado');
reset role;
update public.products set is_available = true, unavailable_reason = null where id = tests.product('Frango Crispy');
update public.products set is_active = true where id = tests.product('Smash Clássico');

-- Loja fechada / agendamento
update public.organizations set store_mode = 'closed', closed_message = 'Hoje estamos fechados.' where id = tests.levi();
set role anon;
select tests.eq((public.get_storefront('leviburguer')->'status'->>'is_open')::boolean, false, 'cardápio mostra loja fechada');
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'items', jsonb_build_array(tests.especial(1))))$$, 'Hoje estamos fechados', 'loja fechada manualmente bloqueia pedidos');
reset role;
update public.organizations set store_mode = 'auto' where id = tests.levi();
-- horário garantido: abre todos os dias 00:00-23:59 para testar agendamento
delete from public.opening_hours where organization_id = tests.levi();
insert into public.opening_hours (organization_id, weekday, opens_at, closes_at) select tests.levi(), d, '00:00', '23:59' from generate_series(0, 6) d;
set role anon;
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup', 'scheduled_for', now() + interval '5 minutes',
  'customer', jsonb_build_object('name','Ana','phone','71911112222'), 'payment_method','pix',
  'items', jsonb_build_array(tests.especial(1))))$$, 'agendamento inválido', 'agendamento muito próximo recusado');
select tests.ok((public.place_order('leviburguer', jsonb_build_object('type','pickup', 'scheduled_for', now() + interval '2 hours',
  'customer', jsonb_build_object('name','Ana Agendada','phone','71911113333'), 'payment_method','pix',
  'items', jsonb_build_array(tests.especial(1))))->>'id') is not null, 'pedido agendado aceito dentro do expediente');

-- Anti-flood: 5 pedidos por telefone em 10 minutos
do $$ begin
  for i in 1..4 loop
    perform public.place_order('leviburguer', jsonb_build_object('type','pickup',
      'customer', jsonb_build_object('name','Flood','phone','71900009999'), 'payment_method','pix',
      'items', jsonb_build_array(tests.especial(1))));
  end loop;
end $$;
select tests.ok(true, '4 pedidos seguidos aceitos');
select public.place_order('leviburguer', jsonb_build_object('type','pickup',
      'customer', jsonb_build_object('name','Flood','phone','71900009999'), 'payment_method','pix',
      'items', jsonb_build_array(tests.especial(1))));
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup',
  'customer', jsonb_build_object('name','Flood','phone','71900009999'), 'payment_method','pix',
  'items', jsonb_build_array(tests.especial(1))))$$, 'Muitos pedidos', '6º pedido em sequência bloqueado (anti-flood)');
reset role;
