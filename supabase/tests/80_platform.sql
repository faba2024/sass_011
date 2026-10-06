-- =====================================================================
-- PAINEL MASTER: somente admin da plataforma; faturamento SaaS
-- =====================================================================
\set QUIET on
set role authenticated;

-- Dono de empresa comum NÃO acessa funções do master
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a006', false);
select tests.throws($$select public.platform_overview()$$, 'plataforma', 'gerente não acessa visão geral do master');
select tests.throws($$select * from public.platform_organizations()$$, 'plataforma', 'gerente não lista empresas da plataforma');
select tests.throws($$select * from public.platform_users()$$, 'plataforma', 'gerente não lista usuários da plataforma');
select tests.throws($$select public.platform_update_subscription(tests.levi(), 'STARTER', 'active')$$, 'plataforma', 'gerente não altera o próprio plano');
select tests.throws($$update public.profiles set is_platform_admin = true where id = auth.uid()$$, 'não permitida', 'usuário não se promove a admin da plataforma');
select tests.eq(tests.affected($$update public.subscriptions set price = 1 where organization_id = tests.levi()$$), 0, 'gerente não altera preço da assinatura direto na tabela');

-- Anônimo
reset role; set role anon;
select tests.throws($$select public.platform_overview()$$, 'permission denied', 'anônimo sem acesso ao master');
reset role;

-- Admin da plataforma
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.ok((public.platform_overview()->>'organizations')::int >= 1, 'admin vê visão geral');
select tests.ok((select count(*) from public.platform_organizations() where slug = 'leviburguer') = 1, 'admin lista a Levi Burguer');
select tests.ok((select owner_email from public.platform_organizations('levi')) is not null, 'lista traz o e-mail do dono');
select tests.ok((select count(*) from public.platform_users()) >= 5, 'admin lista usuários');

-- Muda plano e gera/baixa fatura
select public.platform_update_subscription(tests.levi(), 'PRO', 'active', 179.90, null, current_date + 10, 'desconto de fundador');
select tests.eq((select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = tests.levi()), 'PRO', 'plano alterado para PRO');
select tests.eq((select price from public.subscriptions where organization_id = tests.levi()), 179.90::numeric, 'preço negociado mantido');
create temp table inv as select public.platform_create_invoice(tests.levi(), current_date - 3) as id;
select tests.throws($$select public.platform_create_invoice(tests.levi(), current_date - 3)$$, 'Já existe', 'fatura duplicada no mesmo vencimento é recusada');
select tests.eq((public.platform_refresh_billing()->>'overdue')::int, 1, 'fatura vencida marcada como atrasada');
select tests.eq((select status::text from public.subscriptions where organization_id = tests.levi()), 'past_due', 'assinatura fica inadimplente');
select tests.eq((public.platform_overview()->>'overdue_count')::int, 1, 'visão geral mostra 1 fatura em atraso');
select public.platform_register_payment((select id from inv), 'pix');
select tests.eq((select status from public.subscription_payments where id = (select id from inv)), 'paid', 'fatura baixada');
select tests.eq((select status::text from public.subscriptions where organization_id = tests.levi()), 'active', 'assinatura reativada após pagamento');
select tests.ok((select current_period_end from public.subscriptions where organization_id = tests.levi()) > current_date, 'período estendido');
select tests.throws($$select public.platform_register_payment((select id from inv), 'pix')$$, 'já está paga', 'não baixa a mesma fatura duas vezes');
select tests.ok((public.platform_overview()->>'received_month')::numeric >= 179.90, 'recebido no mês contabilizado');
select tests.ok(exists (select 1 from public.audit_logs where action = 'platform.payment'), 'pagamento registrado na auditoria');

-- Suspensão pelo admin bloqueia o cardápio público
update public.organizations set status = 'suspended' where id = tests.levi();
reset role; set role anon;
select tests.throws($$select public.place_order('leviburguer', jsonb_build_object('type','pickup','customer', jsonb_build_object('name','Ana','phone','(71) 98888-2222'),'payment_method','pix','items', jsonb_build_array(tests.especial(1))))$$, 'não está recebendo', 'loja suspensa não recebe pedidos');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
update public.organizations set status = 'active' where id = tests.levi();
select public.platform_update_subscription(tests.levi(), 'PREMIUM', 'active');
reset role;

-- Configurações de cadastro aplicadas
reset role;
update public.platform_settings set value = '{"enabled": false, "plan_code": "STARTER", "trial_days": 14}' where key = 'signup';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);
select tests.throws($$select public.create_my_organization('Nova Loja', 'nova-loja-x')$$, 'fechados', 'cadastro fechado pela plataforma é respeitado');
reset role;
update public.platform_settings set value = '{"enabled": true, "plan_code": "PRO", "trial_days": 7}' where key = 'signup';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);
create temp table nova as select public.create_my_organization('Nova Loja', 'nova-loja-x') as id;
reset role;
select tests.eq((select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = (select id from nova)), 'PRO', 'plano padrão do cadastro vem das configurações');
select tests.ok((select trial_ends_at from public.subscriptions where organization_id = (select id from nova)) < now() + interval '8 days', 'dias de teste vêm das configurações');
set role anon;
select tests.eq((public.platform_public()->>'trial_days')::int, 7, 'landing lê dias de teste (anônimo)');
reset role;
update public.platform_settings set value = '{"enabled": true, "plan_code": "STARTER", "trial_days": 14}' where key = 'signup';
