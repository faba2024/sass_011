-- =====================================================================
-- REGRAS: horários, estoque baixo / indisponível automático, entrada de
-- estoque com custo médio, despesas recorrentes, fidelidade, plano
-- =====================================================================
\set QUIET on

-- ---------- Horários (fuso America/Bahia, UTC-3) ----------------------
create temp table hz as select tests.levi() as org;
delete from public.opening_hours where organization_id = tests.levi();
delete from public.opening_exceptions where organization_id = tests.levi();
-- sexta 18:00 → 02:00 (cruza meia-noite)
insert into public.opening_hours (organization_id, weekday, opens_at, closes_at) values (tests.levi(), 5, '18:00', '02:00');
-- 2026-10-02 é sexta-feira
select tests.ok(public.is_open_at(tests.levi(), '2026-10-02 19:00-03'), 'sexta 19h: aberto');
select tests.ok(not public.is_open_at(tests.levi(), '2026-10-02 17:59-03'), 'sexta 17h59: fechado');
select tests.ok(public.is_open_at(tests.levi(), '2026-10-03 01:30-03'), 'sábado 01h30: ainda aberto (turno de sexta cruza meia-noite)');
select tests.ok(not public.is_open_at(tests.levi(), '2026-10-03 02:00-03'), 'sábado 02h00: fechado');
select tests.ok(not public.is_open_at(tests.levi(), '2026-10-05 20:00-03'), 'segunda: fechado');
insert into public.opening_exceptions (organization_id, date, is_closed, reason) values (tests.levi(), '2026-10-09', true, 'Feriado');
select tests.ok(not public.is_open_at(tests.levi(), '2026-10-09 20:00-03'), 'exceção: feriado fecha a sexta');
insert into public.opening_exceptions (organization_id, date, is_closed, opens_at, closes_at, reason) values (tests.levi(), '2026-10-07', false, '12:00', '15:00', 'Evento');
select tests.ok(public.is_open_at(tests.levi(), '2026-10-07 13:00-03'), 'exceção: evento abre quarta 12h-15h');
update public.organizations set store_mode = 'open' where id = tests.levi();

-- ---------- Estoque: entrada com custo médio --------------------------
create temp table ing as select id from public.ingredients where organization_id = tests.levi() and name = 'Ovo';
update public.ingredients set stock_qty = 0 where id = (select id from ing); -- zera para o teste (direto, superusuário)
insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost) values (tests.levi(), (select id from ing), 'in', 10, 1.00);
insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost) values (tests.levi(), (select id from ing), 'in', 30, 2.00);
select tests.eq((select cost_per_unit from public.ingredients where id = (select id from ing)), 1.7500, 'custo médio ponderado: (10×1 + 30×2) / 40 = 1,75');
select tests.eq((select stock_qty from public.ingredients where id = (select id from ing)), 40.000, 'saldo atualizado pelas entradas');
select tests.throws($$insert into public.inventory_movements (organization_id, ingredient_id, type, quantity) values (tests.levi(), (select id from ing), 'in', -5)$$, 'check', 'entrada negativa recusada');

-- ---------- Indisponível automático quando falta insumo ----------------
create temp table brownie as select id from public.ingredients where organization_id = tests.levi() and name = 'Brownie';
delete from public.notifications where type = 'low_stock';
insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, notes)
values (tests.levi(), (select id from brownie), 'loss', -(select stock_qty from public.ingredients where id = (select id from brownie)), 'Perda total (teste)');
select tests.eq((select is_available from public.products where id = tests.product('Brownie')), false, 'produto fica INDISPONÍVEL automaticamente sem estoque');
select tests.eq((select unavailable_reason from public.products where id = tests.product('Brownie')), 'stock', 'motivo registrado: estoque');
select tests.eq((select count(*)::int from public.notifications where type = 'low_stock' and title like 'Sem estoque: Brownie'), 1, 'alerta de "sem estoque" gerado');
insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost) values (tests.levi(), (select id from brownie), 'in', 20, 3.5);
select tests.eq((select is_available from public.products where id = tests.product('Brownie')), true, 'produto volta a ficar DISPONÍVEL na reposição');
update public.products set is_available = false, unavailable_reason = 'manual' where id = tests.product('Brownie');
insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost) values (tests.levi(), (select id from brownie), 'in', 5, 3.5);
select tests.eq((select is_available from public.products where id = tests.product('Brownie')), false, 'esgotado MANUAL não é reativado pela reposição');

-- ---------- Despesas: financeiro + recorrência ------------------------
insert into public.expenses (organization_id, category, description, amount, due_date, recurrence)
values (tests.levi(), 'energia', 'Energia (teste)', 500, '2026-10-10', 'monthly');
update public.expenses set status = 'paid' where description = 'Energia (teste)' and due_date = '2026-10-10';
select tests.eq((select count(*)::int from public.financial_entries fe join public.expenses e on e.id = fe.expense_id where e.description = 'Energia (teste)'), 1, 'despesa paga lançada no financeiro');
select tests.eq((select due_date from public.expenses where description = 'Energia (teste)' and status = 'pending'), '2026-11-10'::date, 'despesa mensal gera a próxima ocorrência');
update public.expenses set status = 'paid' where description = 'Energia (teste)' and due_date = '2026-10-10';
select tests.eq((select count(*)::int from public.expenses where description = 'Energia (teste)'), 2, 'recorrência não duplica');
update public.expenses set status = 'pending' where description = 'Energia (teste)' and due_date = '2026-10-10';
select tests.eq((select count(*)::int from public.financial_entries fe join public.expenses e on e.id = fe.expense_id where e.description = 'Energia (teste)'), 0, 'desfazer pagamento remove lançamento');

-- ---------- Fidelidade: resgate ---------------------------------------
create temp table fid as select c.id, la.points_balance from public.customers c join public.loyalty_accounts la on la.customer_id = c.id
  where c.organization_id = tests.levi() order by la.points_balance desc limit 1;
grant select on fid to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', false);
select tests.eq((public.redeem_loyalty_reward((select id from fid), (select id from public.loyalty_rewards where name = 'Batata frita grátis'))->>'balance')::int,
  (select points_balance from fid) - 100, 'caixa resgata recompensa (−100 pontos)');
select tests.throws($$select public.redeem_loyalty_reward((select id from fid), (select id from public.loyalty_rewards where name = 'Levi Especial grátis')) from generate_series(1, 5)$$,
  'Pontos insuficientes', 'resgate sem saldo é recusado');
select tests.throws($$select public.adjust_loyalty_points((select id from fid), 50, 'bônus')$$, 'Sem permissão', 'caixa NÃO ajusta pontos manualmente (loyalty.manage)');
reset role;

-- ---------- Limite de plano -------------------------------------------
update public.plans set limits = jsonb_set(limits, '{max_products}', '13') where code = 'PREMIUM';
select tests.throws($$insert into public.products (organization_id, name, price) values (tests.levi(), 'Produto 14', 10)$$, 'Limite de 13 produtos', 'limite de produtos do plano bloqueia cadastro');
update public.plans set limits = jsonb_set(limits, '{max_products}', '250') where code = 'PREMIUM';
update public.plans set limits = jsonb_set(limits, '{max_members}', '3') where code = 'PREMIUM';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a0ff', 'extra@test');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select tests.throws($$select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a0ff', 'attendant')$$, 'Limite de 3 usuários', 'limite de usuários do plano bloqueia novo funcionário');
reset role;
update public.plans set limits = jsonb_set(limits, '{max_members}', '10') where code = 'PREMIUM';

-- ---------- Integridade -----------------------------------------------
select tests.throws($$insert into public.products (organization_id, name, price, promo_price) values (tests.levi(), 'X', 10, 12)$$, 'check', 'preço promocional maior que o preço é recusado');
select tests.throws($$insert into public.modifier_groups (organization_id, name, min_select, max_select) values (tests.levi(), 'X', 3, 1)$$, 'check', 'mínimo maior que máximo é recusado');
select tests.throws($$insert into public.reviews (organization_id, order_id, rating) values (tests.levi(), (select id from public.orders limit 1), 6)$$, 'check', 'avaliação fora de 1–5 recusada');
insert into public.modifier_groups (organization_id, name) values ((select id from public.organizations where slug = 'brasaburger'), 'Grupo Brasa');
select tests.throws($$insert into public.product_modifier_groups (organization_id, product_id, group_id) values (tests.levi(), tests.product('Brownie'),
  (select id from public.modifier_groups where name = 'Grupo Brasa'))$$, 'organizações diferentes', 'vínculo de grupo de outra organização recusado');
select tests.throws($$insert into public.coupons (organization_id, code, type, value) values (tests.levi(), 'MEIA', 'percent', 150)$$, 'check', 'cupom percentual acima de 100% recusado');
select tests.throws($$insert into public.orders (organization_id, number, type, payment_method) values (tests.levi(), 1, 'delivery', 'pix')$$, 'check', 'pedido de entrega sem endereço recusado');
