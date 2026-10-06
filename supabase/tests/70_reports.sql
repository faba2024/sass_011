-- =====================================================================
-- DASHBOARD / RELATÓRIOS / FINANCEIRO executam com dados reais
-- =====================================================================
\set QUIET on
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a006', false); -- gerente
create temp table d as select public.dashboard_summary(tests.levi()) as j;
select tests.eq(jsonb_array_length((select j->'sales_14d' from d)), 14, 'dashboard: série de 14 dias');
select tests.eq(jsonb_array_length((select j->'by_hour' from d)), 24, 'dashboard: pedidos por hora (24 faixas)');
select tests.ok(jsonb_array_length((select j->'top_products' from d)) > 0, 'dashboard: produtos mais vendidos');
select tests.ok(jsonb_array_length((select j->'recent_orders' from d)) = 8, 'dashboard: pedidos recentes');
create temp table r as select public.report_overview(tests.levi(), current_date - 30, current_date) as j;
select tests.ok(((select j->'totals'->>'revenue' from r))::numeric > 0, 'relatório: faturamento do período');
select tests.eq(jsonb_array_length((select j->'by_weekday' from r)), 7, 'relatório: dias da semana');
select tests.ok(jsonb_array_length((select j->'margins' from r)) > 0, 'relatório: margem por produto');
select tests.ok(jsonb_array_length((select j->'by_payment' from r)) > 0, 'relatório: formas de pagamento');
select tests.ok(jsonb_array_length((select j->'by_type' from r)) > 0, 'relatório: delivery x retirada');
select tests.ok(jsonb_array_length((select j->'cancellations' from r)) > 0, 'relatório: cancelamentos com motivo');
select tests.ok(jsonb_array_length((select j->'coupons' from r)) > 0, 'relatório: uso de cupons');
create temp table f as select public.finance_summary(tests.levi(), current_date - 30, current_date) as j;
select tests.ok(((select j->>'income' from f))::numeric > 0, 'financeiro: receita');
select tests.ok(((select j->>'cmv' from f))::numeric > 0, 'financeiro: CMV pela ficha técnica');
select tests.ok(((select j->>'expenses' from f))::numeric > 0, 'financeiro: despesas pagas');
select tests.throws($$select public.report_overview(tests.levi(), current_date, current_date - 1)$$, 'Período inválido', 'período invertido recusado');
reset role;
