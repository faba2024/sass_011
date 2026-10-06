-- =====================================================================
-- TESTE GRÁTIS DE 15 DIAS: tudo liberado no teste, plano depois, sem perder dados
-- =====================================================================
\set QUIET on

-- Empresas de teste (dono = admin a001, que vira "owner" de cada uma)
create temp table t_orgs as
select 'dia1'::text k, public._provision_organization('Teste Dia 1', 'trial-dia1', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing') id
union all select 'dia14', public._provision_organization('Teste Dia 14', 'trial-dia14', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing')
union all select 'dia15', public._provision_organization('Teste Dia 15', 'trial-dia15', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing')
union all select 'vencido', public._provision_organization('Teste Vencido', 'trial-vencido', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing')
union all select 'upgrade', public._provision_organization('Teste Upgrade', 'trial-upgrade', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing')
union all select 'pago', public._provision_organization('Teste Pago', 'trial-pago', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing')
union all select 'legado', public._provision_organization('Teste Legado', 'trial-legado', '00000000-0000-0000-0000-00000000a001', 'STARTER', 15, 'trialing');
create function pg_temp.o(p text) returns uuid language sql as $$ select id from t_orgs where k = p $$;
grant select on t_orgs to authenticated, service_role;

-- ---------- Empresa nova (dia 1) ---------------------------------------
select tests.ok((select trial_started_at is not null and trial_active and status = 'trialing'
                 and abs(extract(epoch from trial_ends_at - (trial_started_at + interval '15 days'))) < 1
                 from public.subscriptions where organization_id = pg_temp.o('dia1')), 'nova empresa: trial_started_at, trial_ends_at = +15 dias, trial_active');
select tests.ok(public.trial_is_on(pg_temp.o('dia1')), 'teste valendo no dia 1');
select tests.ok(public.org_features(pg_temp.o('dia1')) @> array['estoque','caixa','fidelidade','mesas','relatorios','marketing','dominio_proprio','financeiro'],
                'dia 1: recursos Starter, Pro e Premium liberados (plano contratado é Starter)');
select tests.ok(public.plan_limit(pg_temp.o('dia1'), 'max_products') is null and public.plan_limit(pg_temp.o('dia1'), 'max_members') is null,
                'dia 1: sem limites (igual ao Premium)');
insert into public.products (organization_id, name, price) select pg_temp.o('dia1'), 'Produto ' || g, 10 from generate_series(1, 65) g;
select tests.eq((select count(*)::int from public.products where organization_id = pg_temp.o('dia1') and deleted_at is null), 65, 'dia 1: cadastra 65 produtos (acima do limite Starter de 60)');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
create temp table st1 as select public.org_plan_state(pg_temp.o('dia1')) j;
select tests.eq((select (j->>'trial_days_left')::int from st1), 15, 'painel: faltam 15 dias');
select tests.ok((select (j->>'trial_active')::boolean and not (j->>'needs_plan')::boolean from st1), 'painel: teste ativo, sem tela de escolha');
select tests.ok((select (j->'features') ? 'marketing' and (j->'features') ? 'mesas' from st1), 'painel recebe recurso Premium (marketing) e Pro (mesas)');
select tests.eq((select j->>'plan_code' from st1), 'STARTER', 'plano registrado continua sendo o Starter');
reset role;

-- ---------- Dia 14 e dia 15 ---------------------------------------------
update public.subscriptions set trial_started_at = now() - interval '13 days', trial_ends_at = now() - interval '13 days' + interval '15 days'
where organization_id = pg_temp.o('dia14');
update public.subscriptions set trial_started_at = now() - interval '14 days 1 hour', trial_ends_at = now() - interval '14 days 1 hour' + interval '15 days'
where organization_id = pg_temp.o('dia15');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.eq((public.org_plan_state(pg_temp.o('dia14'))->>'trial_days_left')::int, 2, 'dia 14: faltam 2 dias');
select tests.ok((public.org_plan_state(pg_temp.o('dia14'))->'features') ? 'dominio_proprio', 'dia 14: Premium ainda liberado');
select tests.eq((public.org_plan_state(pg_temp.o('dia15'))->>'trial_days_left')::int, 1, 'dia 15: último dia (falta 1)');
select tests.ok((public.org_plan_state(pg_temp.o('dia15'))->>'trial_active')::boolean, 'dia 15: teste ainda ativo');
reset role;

-- ---------- Teste vencido sem plano escolhido ---------------------------
insert into public.products (organization_id, name, price) select pg_temp.o('vencido'), 'Item ' || g, 10 from generate_series(1, 62) g;
insert into public.customers (organization_id, name, phone) values (pg_temp.o('vencido'), 'Cliente Teste', '11999990000');
update public.subscriptions set trial_started_at = now() - interval '16 days', trial_ends_at = now() - interval '1 day'
where organization_id = pg_temp.o('vencido');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
create temp table stv as select public.org_plan_state(pg_temp.o('vencido')) j;
select tests.ok((select not (j->>'trial_active')::boolean from stv), 'vencido: teste encerrado');
select tests.ok((select (j->>'needs_plan')::boolean from stv), 'vencido sem plano: painel pede para escolher o plano');
select tests.ok((select not ((j->'features') ? 'marketing') and not ((j->'features') ? 'estoque') from stv), 'vencido: recursos voltam ao plano registrado (Starter)');
reset role;
select tests.ok((select not trial_active and status = 'pending' from public.subscriptions where organization_id = pg_temp.o('vencido')), 'vencido: trial_active = false e assinatura pendente');
select tests.eq((select count(*)::int from public.products where organization_id = pg_temp.o('vencido') and deleted_at is null), 62, 'vencido: nenhum produto apagado (62 continuam)');
select tests.eq((select count(*)::int from public.customers where organization_id = pg_temp.o('vencido')), 1, 'vencido: clientes preservados');
select tests.eq(public.plan_limit(pg_temp.o('vencido'), 'max_products'), 60, 'vencido: limite do Starter volta a valer');
select tests.throws($$insert into public.products (organization_id, name, price) values ((select id from t_orgs where k = 'vencido'), 'Novo', 10)$$, 'Limite de 60', 'vencido no Starter: não cadastra além do limite (os 62 continuam)');

-- escolhe o Premium depois do vencimento
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
create temp table stc as select public.choose_plan(pg_temp.o('vencido'), 'premium') j;
select tests.ok((select not (j->>'needs_plan')::boolean and (j->'features') ? 'marketing' from stc), 'escolheu Premium: tela de escolha some e Premium liberado');
reset role;

-- ---------- Upgrade durante o teste e downgrade depois ----------------
update public.subscriptions set trial_started_at = now() - interval '5 days', trial_ends_at = now() + interval '10 days'
where organization_id = pg_temp.o('upgrade');
insert into public.ingredients (organization_id, name, unit) values (pg_temp.o('upgrade'), 'Pão brioche', 'un');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
create temp table stu as select public.choose_plan(pg_temp.o('upgrade'), 'PRO') j;
select tests.ok((select (j->>'trial_active')::boolean and (j->>'plan_chosen')::boolean and j->>'plan_code' = 'PRO' from stu), 'upgrade no teste: plano Pro salvo e teste continua');
select tests.ok((select (j->'features') ? 'marketing' from stu), 'upgrade no teste: Premium continua liberado até o fim dos 15 dias');
reset role;
select tests.eq((select price from public.subscriptions where organization_id = pg_temp.o('upgrade')), 199.00::numeric(12,2), 'preço da assinatura passa a ser o do Pro');
update public.subscriptions set trial_ends_at = now() - interval '1 minute' where organization_id = pg_temp.o('upgrade');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
create temp table stu2 as select public.org_plan_state(pg_temp.o('upgrade')) j;
select tests.ok((select not (j->>'trial_active')::boolean and not (j->>'needs_plan')::boolean from stu2), 'fim do teste com plano escolhido: aplica o Pro sem pedir escolha');
select tests.ok((select (j->'features') ? 'estoque' and not ((j->'features') ? 'marketing') from stu2), 'fim do teste: Pro (estoque sim, marketing não)');
create temp table stu3 as select public.choose_plan(pg_temp.o('upgrade'), 'STARTER') j;
select tests.ok((select not ((j->'features') ? 'estoque') from stu3), 'downgrade para Starter: estoque bloqueado');
reset role;
select tests.eq((select count(*)::int from public.ingredients where organization_id = pg_temp.o('upgrade')), 1, 'downgrade não apaga o estoque cadastrado');

-- ---------- Pagou durante o teste ---------------------------------------
update public.subscriptions set trial_started_at = now() - interval '3 days', trial_ends_at = now() + interval '12 days'
where organization_id = pg_temp.o('pago');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select public.choose_plan(pg_temp.o('pago'), 'PREMIUM');
create temp table invp as select public.billing_open_invoice(pg_temp.o('pago')) j;
reset role;
grant select on invp to service_role;
select tests.eq((select (j->>'due_date')::date from invp), (now() + interval '12 days')::date, 'fatura no teste vence no fim do teste');
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select public.confirm_subscription_pix(((select j from invp)->>'id')::uuid, 'mp-trial-1', 299);
select set_config('request.jwt.claim.role', '', false);
reset role;
select tests.ok((select status = 'active' and trial_active and current_period_start = (now() + interval '12 days')::date
                 from public.subscriptions where organization_id = pg_temp.o('pago')), 'pagou no teste: assinatura ativa, teste continua e o mês pago começa no fim do teste');
select tests.ok(public.trial_is_on(pg_temp.o('pago')), 'pagou no teste: acesso completo mantido');

-- ---------- Empresa antiga sem dados de teste ---------------------------
update public.subscriptions set trial_started_at = null, trial_active = false where organization_id = pg_temp.o('legado');
select tests.ok(public.trial_is_on(pg_temp.o('legado')), 'linha antiga (sem trial_started_at) em teste continua com tudo liberado');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.ok(not (public.org_plan_state(tests.levi())->>'needs_plan')::boolean and not (public.org_plan_state(tests.levi())->>'trial_active')::boolean,
                'Levi (assinante antigo, Premium ativo): sem teste e sem tela de escolha');
reset role;

-- ---------- Segurança ----------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
select tests.throws($$select public.org_plan_state((select id from t_orgs where k = 'dia1'))$$, 'Sem acesso', 'outra empresa não vê o plano/teste');
select tests.throws($$select public.choose_plan((select id from t_orgs where k = 'dia1'), 'PREMIUM')$$, 'permissão', 'outra empresa não troca o plano');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.ok(public.org_plan_state(tests.levi()) ? 'features', 'cozinha (membro) lê os recursos liberados');
select tests.throws($$select public.choose_plan(tests.levi(), 'STARTER')$$, 'permissão', 'cozinha não troca o plano');
select tests.throws($$select public.trial_is_on(tests.levi())$$, 'permission denied', 'funções internas não expostas');
reset role;
set role anon;
select tests.throws($$select public.org_plan_state(tests.levi())$$, 'permission denied', 'anônimo sem acesso');
reset role;
