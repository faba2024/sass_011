-- =====================================================================
-- MENSALIDADE ONLINE: fatura da loja, credencial da plataforma e baixa pelo gateway
-- =====================================================================
\set QUIET on

-- Brasa (trial, criada no 40_) gera a fatura para pagar
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
create temp table brasa_org as select id from public.organizations where slug = 'brasaburger';
create temp table inv1 as select public.billing_open_invoice((select id from brasa_org)) as j;
select tests.ok(((select j from inv1)->>'amount')::numeric > 0, 'dono da loja gera a fatura da mensalidade');
select tests.eq(((public.billing_open_invoice((select id from brasa_org)))->>'id'), (select j->>'id' from inv1), 'chamar de novo reaproveita a mesma fatura (sem duplicar)');
select tests.throws($$select public.billing_open_invoice(tests.levi())$$, 'permissão', 'dono da Brasa não gera fatura da Levi');
select tests.throws($$select public.platform_payment_status()$$, 'plataforma', 'loja não vê a conta de recebimento da plataforma');
select tests.throws($$select * from public.platform_secrets$$, 'permission denied', 'loja não lê credenciais da plataforma');
select tests.throws($$select public.confirm_subscription_pix(((select j from inv1)->>'id')::uuid, '1', 1)$$, 'permission denied', 'loja não dá baixa na própria fatura');
reset role;
grant select on inv1, brasa_org to authenticated, service_role, anon;

-- funcionário sem billing.view (cozinha da Levi)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.throws($$select public.billing_open_invoice(tests.levi())$$, 'permissão', 'cozinha não acessa a cobrança');

-- Admin configura a conta Mercado Pago da plataforma
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.throws($$select public.set_platform_payment('qualquer')$$, 'inválido', 'token com formato errado é recusado');
select tests.eq(public.set_platform_payment('TEST-9876543210-plataformaXYZW', 'segredo-plataforma')->>'token_hint', '…XYZW', 'admin salva token; status mostra só o final');
select tests.ok(public.platform_payment_status()::text not like '%9876543210%', 'status nunca devolve o token');
select tests.throws($$select value from public.platform_secrets$$, 'permission denied', 'nem o admin lê o token pela API');
reset role;

-- Gateway confirma (service_role)
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);
select tests.throws($$select public.confirm_subscription_pix(((select j from inv1)->>'id')::uuid, 'mp-1', 1.00)$$, 'diferente', 'valor diferente da fatura é recusado');
select tests.ok((public.confirm_subscription_pix(((select j from inv1)->>'id')::uuid, 'mp-1', ((select j from inv1)->>'amount')::numeric)->>'paid')::boolean, 'pagamento confirmado pelo gateway');
select tests.ok((public.confirm_subscription_pix(((select j from inv1)->>'id')::uuid, 'mp-1', ((select j from inv1)->>'amount')::numeric)->>'already_paid')::boolean, 'confirmação repetida não duplica');
select set_config('request.jwt.claim.role', '', false);
reset role;
select tests.eq((select status from public.subscription_payments where id = ((select j from inv1)->>'id')::uuid), 'paid', 'fatura paga');
select tests.eq((select status::text from public.subscriptions where organization_id = (select id from brasa_org)), 'active', 'assinatura ativada');
select tests.ok((select current_period_end from public.subscriptions where organization_id = (select id from brasa_org)) >= current_date + 27, 'período de 1 mês liberado');
select tests.ok(exists (select 1 from public.notifications where organization_id = (select id from brasa_org) and title = 'Mensalidade paga'), 'loja notificada');

-- Em dia: não gera nova fatura antes da hora
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
select tests.throws($$select public.billing_open_invoice((select id from brasa_org))$$, 'já está paga', 'assinatura em dia não gera fatura antecipada');
reset role;

-- remove credencial
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.eq(public.set_platform_payment(null, null, true)->>'configured', 'false', 'admin desconecta a conta de recebimento');
reset role;
