-- =====================================================================
-- PIX AUTOMÁTICO: credenciais protegidas e confirmação só pelo servidor
-- =====================================================================
\set QUIET on

-- Pedido Pix de um cliente (anônimo)
set role anon;
create temp table pixo as select public.place_order('leviburguer', jsonb_build_object(
  'type', 'pickup', 'customer', jsonb_build_object('name', 'Carla Pix', 'phone', '(71) 97777-1234'),
  'payment_method', 'pix', 'items', jsonb_build_array(tests.especial(1)))) as r;
reset role;
grant select on pixo to anon, authenticated, service_role;
create temp view pixorder as select o.* from public.orders o where o.id = ((select r from pixo)->>'id')::uuid;
grant select on pixorder to anon, authenticated, service_role;

-- Gerente (sem settings.manage) não configura; dono configura
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$select public.set_payment_integration(tests.levi(), true, 'TEST-1234567890-abcdef')$$, 'permissão', 'atendente não configura o gateway');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.throws($$select public.set_payment_integration(tests.levi(), true, 'chave-qualquer')$$, 'inválido', 'token com formato errado é recusado');
select tests.ok((public.set_payment_integration(tests.levi(), true, 'TEST-1234567890-abcdefSECRET', 'segredo-webhook')->>'is_enabled')::boolean, 'dono ativa o Pix automático');
select tests.eq(public.payment_integration_status(tests.levi())->>'token_hint', '…CRET', 'status mostra só os 4 últimos caracteres');
select tests.ok(public.payment_integration_status(tests.levi())::text not like '%1234567890%', 'status nunca devolve o token');
select tests.throws($$select access_token from public.payment_integrations$$, 'permission denied', 'nem o dono lê a tabela de credenciais');
select tests.throws($$select public.confirm_provider_payment((select id from pixorder), 'mercadopago', '999', (select total from pixorder))$$, 'permission denied', 'usuário logado não confirma pagamento do gateway');
-- token antigo mantido quando não informado
select public.set_payment_integration(tests.levi(), true, null, null);
reset role;
select tests.eq((select access_token from public.payment_integrations where organization_id = tests.levi()), 'TEST-1234567890-abcdefSECRET', 'token mantido quando o campo vem vazio');

-- Outra empresa não enxerga nada
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
select tests.throws($$select public.payment_integration_status(tests.levi())$$, 'permissão', 'Brasa não consulta o gateway da Levi');
reset role;

-- Anônimo
set role anon;
select tests.throws($$select * from public.payment_integrations$$, 'permission denied', 'anônimo não lê credenciais');
select tests.throws($$select public.confirm_provider_payment((select id from pixorder), 'mercadopago', '999', 1)$$, 'permission denied', 'anônimo não confirma pagamento');
select tests.ok((public.get_order_pix((select public_token from pixorder))->>'online')::boolean, 'página do pedido sabe que o Pix automático está ativo');
reset role;

-- Servidor registra a cobrança e confirma
set role service_role;
insert into public.order_payments (organization_id, order_id, provider, provider_payment_id, amount, qr_code, qr_code_base64, expires_at)
select organization_id, id, 'mercadopago', '123456789', total, '00020126...6304ABCD', 'iVBORw0KGgo=', now() + interval '30 minutes' from pixorder;
reset role;
set role anon;
select tests.eq(public.get_order_pix((select public_token from pixorder))->'charge'->>'qr_code', '00020126...6304ABCD', 'cliente recebe o copia-e-cola da cobrança');
reset role;

set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select tests.throws($$select public.confirm_provider_payment((select id from pixorder), 'mercadopago', '123456789', 1.00)$$, 'diferente', 'valor diferente do pedido é recusado');
select tests.ok((public.confirm_provider_payment((select id from pixorder), 'mercadopago', '123456789', (select total from pixorder))->>'paid')::boolean, 'pagamento aprovado marca o pedido como pago');
select tests.ok((public.confirm_provider_payment((select id from pixorder), 'mercadopago', '123456789', (select total from pixorder))->>'already_paid')::boolean, 'webhook repetido não duplica (idempotente)');
select set_config('request.jwt.claim.role', '', false);
reset role;
select tests.eq((select payment_status::text from pixorder), 'paid', 'pedido pago');
select tests.eq((select payment_ref from pixorder), '123456789', 'referência do Mercado Pago gravada');
select tests.eq((select status from public.order_payments where provider_payment_id = '123456789'), 'approved', 'cobrança aprovada');
select tests.eq((select count(*)::int from public.financial_entries where order_id = (select id from pixorder) and type = 'income'), 1, 'receita lançada uma única vez no financeiro');
select tests.ok(exists (select 1 from public.notifications where title like 'Pix confirmado%'), 'loja notificada do Pix confirmado');

-- Remoção
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select public.remove_payment_integration(tests.levi());
select tests.eq(public.payment_integration_status(tests.levi())->>'configured', 'false', 'integração removida');
reset role;
