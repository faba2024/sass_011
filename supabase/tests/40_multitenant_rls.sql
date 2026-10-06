-- =====================================================================
-- MULTIEMPRESA + RLS + RBAC
-- Dono da "Brasa Burger" tenta ler/alterar/excluir dados da Levi Burguer.
-- Funcionários da Levi tentam acessar módulos sem permissão.
-- =====================================================================
\set QUIET on

-- Brasa Burger: cadastro self-service de outra hamburgueria
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
create temp table brasa as select public.create_my_organization('Brasa Burger', 'brasaburger') as id;
select tests.ok((select id from brasa) is not null, 'Brasa Burger criada pelo próprio dono (trial)');
select tests.throws($$select public.create_my_organization('Outra', 'outra-loja')$$, 'já possui', 'um dono não cria várias empresas pelo self-service');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a006', false);
select tests.throws($$select public.create_my_organization('Copia', 'leviburguer')$$, 'já está em uso', 'slug duplicado recusado');
select tests.throws($$select public.create_my_organization('Painel', 'app')$$, 'reservado', 'slug reservado recusado');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
reset role;
grant select on brasa to authenticated;

-- Brasa cria um produto e um cliente próprios
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
insert into public.products (organization_id, category_id, name, price)
values ((select id from brasa), (select id from public.categories where organization_id = (select id from brasa) limit 1), 'Brasa Smash', 22);
select tests.eq((select count(*)::int from public.products), 1, 'Brasa enxerga somente o próprio produto');

-- ---------- LEITURA de dados da Levi: tudo vazio --------------------
select tests.eq(tests.count($$select 1 from public.products where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê produtos da Levi');
select tests.eq(tests.count($$select 1 from public.orders where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê pedidos da Levi');
select tests.eq(tests.count($$select 1 from public.order_items where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê itens de pedidos da Levi');
select tests.eq(tests.count($$select 1 from public.customers where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê clientes da Levi');
select tests.eq(tests.count($$select 1 from public.customer_addresses where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê endereços da Levi');
select tests.eq(tests.count($$select 1 from public.financial_entries where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê financeiro da Levi');
select tests.eq(tests.count($$select 1 from public.expenses where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê despesas da Levi');
select tests.eq(tests.count($$select 1 from public.ingredients where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê estoque da Levi');
select tests.eq(tests.count($$select 1 from public.inventory_movements where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê movimentações da Levi');
select tests.eq(tests.count($$select 1 from public.cash_registers where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê caixa da Levi');
select tests.eq(tests.count($$select 1 from public.coupons where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê cupons da Levi');
select tests.eq(tests.count($$select 1 from public.loyalty_accounts where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê fidelidade da Levi');
select tests.eq(tests.count($$select 1 from public.organizations where id = tests.levi()$$), 0, 'Brasa NÃO lê a organização Levi');
select tests.eq(tests.count($$select 1 from public.organization_members where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê a equipe da Levi');
select tests.eq(tests.count($$select 1 from public.product_costs where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê custos (view) da Levi');
select tests.eq(tests.count($$select 1 from public.customer_segments where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê segmentos (view) da Levi');
select tests.eq(tests.count($$select 1 from public.notifications where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê notificações da Levi');
select tests.eq(tests.count($$select 1 from public.audit_logs where organization_id = tests.levi()$$), 0, 'Brasa NÃO lê auditoria da Levi');

-- ---------- ESCRITA em dados da Levi: 0 linhas / erro ---------------
select tests.eq(tests.affected($$update public.products set price = 0.01 where organization_id = tests.levi()$$), 0, 'Brasa NÃO altera preços da Levi');
select tests.eq(tests.affected($$delete from public.products where organization_id = tests.levi()$$), 0, 'Brasa NÃO exclui produtos da Levi');
select tests.eq(tests.affected($$update public.customers set name = 'hack' where organization_id = tests.levi()$$), 0, 'Brasa NÃO altera clientes da Levi');
select tests.eq(tests.affected($$delete from public.customers where organization_id = tests.levi()$$), 0, 'Brasa NÃO exclui clientes da Levi');
select tests.eq(tests.affected($$update public.orders set notes = 'hack' where organization_id = tests.levi()$$), 0, 'Brasa NÃO altera pedidos da Levi');
select tests.eq(tests.affected($$update public.ingredients set stock_qty = 0 where organization_id = tests.levi()$$), 0, 'Brasa NÃO altera estoque da Levi');
select tests.eq(tests.affected($$delete from public.expenses where organization_id = tests.levi()$$), 0, 'Brasa NÃO exclui despesas da Levi');
select tests.eq(tests.affected($$update public.organizations set name = 'hack' where id = tests.levi()$$), 0, 'Brasa NÃO altera configurações da Levi');
select tests.throws($$insert into public.products (organization_id, name, price) values (tests.levi(), 'Invasor', 1)$$, 'row-level security', 'Brasa NÃO insere produto na Levi');
select tests.throws($$insert into public.expenses (organization_id, category, description, amount, due_date) values (tests.levi(), 'outras', 'hack', 1, current_date)$$, 'row-level security', 'Brasa NÃO lança despesa na Levi');
select tests.throws($$insert into public.inventory_movements (organization_id, ingredient_id, type, quantity) values (tests.levi(), (select id from public.ingredients limit 1), 'in', 1)$$, '', 'Brasa NÃO movimenta estoque da Levi');
select tests.throws($$insert into public.customers (organization_id, name, phone) values (tests.levi(), 'x', '71900000000')$$, 'row-level security', 'Brasa NÃO cria cliente na Levi');

-- ---------- RPCs com organização alheia ----------------------------
select tests.throws($$select public.update_order_status((select id from public.orders where organization_id = tests.levi() limit 1), 'cancelled', 'hack')$$, '', 'Brasa NÃO muda status de pedido da Levi');
select tests.throws($$select public.create_staff_order(tests.levi(), jsonb_build_object('type','counter','payment_method','cash','items', jsonb_build_array(tests.especial(1))))$$, 'Sem permissão', 'Brasa NÃO lança venda na Levi');
select tests.throws($$select public.dashboard_summary(tests.levi())$$, 'Sem permissão', 'Brasa NÃO vê dashboard da Levi');
select tests.throws($$select public.report_overview(tests.levi(), current_date - 30, current_date)$$, 'Sem permissão', 'Brasa NÃO vê relatórios da Levi');
select tests.throws($$select public.finance_summary(tests.levi(), current_date - 30, current_date)$$, 'Sem permissão', 'Brasa NÃO vê financeiro da Levi');
select tests.throws($$select public.open_cash_register(tests.levi(), 1)$$, 'Sem permissão', 'Brasa NÃO abre caixa da Levi');
select tests.throws($$select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000b001', 'owner')$$, 'Sem permissão', 'Brasa NÃO se adiciona à equipe da Levi');
select tests.throws($$select public.redeem_loyalty_reward((select id from public.customers limit 1), gen_random_uuid())$$, '', 'Brasa NÃO resgata pontos de clientes da Levi');
select tests.throws($$select public.provision_organization('X', 'xpto', '00000000-0000-0000-0000-00000000b001')$$, 'plataforma', 'dono comum NÃO usa provisionamento do master');

-- ---------- Proteções de campos ------------------------------------
select tests.throws($$update public.profiles set is_platform_admin = true where id = auth.uid()$$, 'não permitida', 'usuário NÃO vira admin da plataforma');
select tests.throws($$update public.organizations set status = 'active', slug = 'novo-slug' where id = (select id from brasa)$$, 'administração da plataforma', 'dono NÃO altera status/slug da própria org');
select tests.eq(tests.affected($$update public.subscriptions set price = 0$$), 0, 'dono NÃO altera o preço da própria assinatura');
select tests.eq(tests.count($$select 1 from public.subscriptions$$), 1, 'dono vê a própria assinatura');
reset role;

-- ---------- RBAC dentro da Levi ------------------------------------
set role authenticated;
-- Cozinha: sem financeiro, sem clientes, sem configurações
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.eq(tests.count($$select 1 from public.financial_entries$$), 0, 'cozinha NÃO vê financeiro');
select tests.eq(tests.count($$select 1 from public.expenses$$), 0, 'cozinha NÃO vê despesas');
select tests.eq(tests.count($$select 1 from public.customers$$), 0, 'cozinha NÃO vê clientes');
select tests.eq(tests.count($$select 1 from public.cash_registers$$), 0, 'cozinha NÃO vê caixa');
select tests.eq(tests.count($$select 1 from public.subscriptions$$), 0, 'cozinha NÃO vê assinatura');
select tests.ok(tests.count($$select 1 from public.ingredients$$) > 0, 'cozinha VÊ estoque (leitura)');
select tests.eq(tests.affected($$update public.ingredients set min_qty = 0$$), 0, 'cozinha NÃO altera estoque');
select tests.throws($$select public.finance_summary(tests.levi(), current_date - 7, current_date)$$, 'Sem permissão', 'cozinha NÃO chama resumo financeiro');
select tests.throws($$select public.dashboard_summary(tests.levi())$$, 'Sem permissão', 'cozinha NÃO vê dashboard');
select tests.eq(tests.affected($$update public.organizations set name = 'x' where id = tests.levi()$$), 0, 'cozinha NÃO altera configurações');
select tests.eq(tests.affected($$update public.products set price = 1$$), 0, 'cozinha NÃO altera preços');
select tests.eq((select count(*)::int from public.notifications where type = 'subscription'), 0, 'cozinha NÃO recebe notificações de assinatura');

-- Caixa: opera caixa, NÃO altera configurações nem cardápio
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a003', false);
select tests.eq(tests.affected($$update public.organizations set store_mode = 'closed' where id = tests.levi()$$), 0, 'caixa NÃO altera configurações');
select tests.eq(tests.affected($$update public.products set price = 1$$), 0, 'caixa NÃO altera cardápio');
select tests.eq(tests.count($$select 1 from public.financial_entries$$), 0, 'caixa NÃO vê financeiro geral');
select tests.ok(tests.count($$select 1 from public.cash_registers$$) > 0, 'caixa VÊ seus caixas');
select tests.throws($$select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000b001', 'manager')$$, 'Sem permissão', 'caixa NÃO cadastra funcionários');

-- Atendente
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a005', false);
select tests.throws($$insert into public.inventory_movements (organization_id, ingredient_id, type, quantity) values (tests.levi(), (select id from public.ingredients limit 1), 'sale', -1)$$, '', 'atendente NÃO registra movimentação de estoque');
select tests.eq(tests.count($$select 1 from public.coupons$$), 0, 'atendente NÃO vê cupons (sem coupons.manage)');

-- Entregador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a004', false);
select tests.eq(tests.count($$select 1 from public.customers$$), 0, 'entregador NÃO vê base de clientes');
select tests.eq(tests.affected($$update public.drivers set status = 'offline' where user_id = auth.uid()$$), 1, 'entregador altera o próprio status');
select tests.eq(tests.affected($$update public.drivers set status = 'offline' where user_id is distinct from auth.uid()$$), 0, 'entregador NÃO altera outros entregadores');

-- Gerente/dono: nem com staff.manage altera dono
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000a006', 'manager', 'Gerente');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a006', false);
select tests.throws($$select public.update_member((select id from public.organization_members where user_id = '00000000-0000-0000-0000-00000000a001' and organization_id = tests.levi()), 'cashier')$$,
  'Apenas o dono', 'gerente NÃO rebaixa o dono');
select tests.throws($$select public.add_member(tests.levi(), '00000000-0000-0000-0000-00000000b001', 'owner')$$, 'Apenas o dono', 'gerente NÃO cria outro dono');
select tests.throws($$select public.set_role_permissions((select id from public.roles where organization_id = tests.levi() and key = 'cashier'), array['billing.view'])$$, 'exclusiva do dono', 'assinatura não pode ser delegada');
select public.set_role_permissions((select id from public.roles where organization_id = tests.levi() and key = 'kitchen'), array['orders.view','kitchen.view','menu.view','inventory.view','inventory.manage']);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', false);
select tests.ok(public.has_permission(tests.levi(), 'inventory.manage'), 'permissão customizada por função aplicada imediatamente (RBAC real)');
reset role;

-- Último dono não pode sair
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
select tests.throws($$select public.update_member((select id from public.organization_members where user_id = auth.uid()), null, false)$$, 'próprio acesso', 'dono não desativa a si mesmo');
reset role;

-- Storage: caminho de outra organização
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
select tests.throws(format($$insert into storage.objects (bucket_id, name) values ('org-assets', '%s/products/x.webp')$$, tests.levi()), 'row-level security', 'Brasa NÃO envia arquivo para a pasta da Levi');
select tests.eq(tests.affected(format($$insert into storage.objects (bucket_id, name) values ('org-assets', '%s/products/x.webp')$$, (select id from brasa))), 1, 'Brasa envia arquivo para a própria pasta');
reset role;
