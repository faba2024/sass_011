-- =====================================================================
-- TOP BURGER OS — 0005 SEGURANÇA
-- RLS em todas as tabelas + grants mínimos
-- anon: NENHUM acesso direto a tabelas (só RPCs públicas e planos ativos)
-- =====================================================================

-- ---------- Liga RLS em todas as tabelas do schema public -----------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------- Grants --------------------------------------------------
revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on public.plans to anon;

-- Funções: ninguém executa por padrão; liberamos explicitamente
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

grant execute on function
  public.get_storefront(text), public.quote_order(text, jsonb), public.place_order(text, jsonb),
  public.get_public_order(text), public.submit_review(text, int, text), public.get_table(text, text),
  public.resolve_domain(text), public.slug_available(text)
to anon, authenticated;

grant execute on function
  public.is_platform_admin(), public.is_org_member(uuid), public.has_permission(uuid, text),
  public.my_permissions(uuid), public.store_status(uuid), public.plan_limit(uuid, text), public.org_features(uuid),
  public.create_staff_order(uuid, jsonb), public.update_order_status(uuid, public.order_status, text, boolean),
  public.assign_driver(uuid, uuid), public.mark_order_paid(uuid, public.payment_method),
  public.cash_register_summary(uuid), public.open_cash_register(uuid, numeric, text),
  public.add_cash_movement(uuid, public.cash_movement_type, numeric, text), public.close_cash_register(uuid, numeric, text),
  public.close_table_session(uuid, public.payment_method),
  public.redeem_loyalty_reward(uuid, uuid), public.adjust_loyalty_points(uuid, int, text),
  public.provision_organization(text, text, uuid, text, int, public.subscription_status),
  public.create_my_organization(text, text),
  public.add_member(uuid, uuid, text, text, text), public.update_member(uuid, text, boolean, text, text),
  public.set_role_permissions(uuid, text[]),
  public.set_store_mode(uuid, public.store_mode, text),
  public.dashboard_summary(uuid), public.report_overview(uuid, date, date), public.finance_summary(uuid, date, date),
  public.fmt_brl(numeric), public.only_digits(text), public.is_open_at(uuid, timestamptz)
to authenticated;

grant execute on all functions in schema public to service_role;
grant execute on function public.is_platform_admin() to anon;

-- As views usam security_invoker: herdam a RLS das tabelas base
grant select on public.product_costs, public.customer_segments to authenticated;

-- =====================================================================
-- POLICIES
-- =====================================================================

-- Plataforma -----------------------------------------------------------
create policy plans_read_active on public.plans for select to anon, authenticated using (is_active or public.is_platform_admin());
create policy plans_admin_write on public.plans for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy permissions_read on public.permissions for select to authenticated using (true);

-- Perfis: o próprio, colegas de empresa e admin da plataforma
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_platform_admin() or exists (
    select 1 from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = auth.uid() and a.is_active and b.user_id = profiles.id)
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin()) with check (id = auth.uid() or public.is_platform_admin());

-- Organizações
create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_permission(id, 'settings.manage')) with check (public.has_permission(id, 'settings.manage'));
create policy organizations_admin_insert on public.organizations for insert to authenticated with check (public.is_platform_admin());
create policy organizations_admin_delete on public.organizations for delete to authenticated using (public.is_platform_admin());

-- RBAC
create policy roles_select on public.roles for select to authenticated using (public.is_org_member(organization_id));
create policy roles_write on public.roles for all to authenticated
  using (public.has_permission(organization_id, 'staff.manage') and not is_system)
  with check (public.has_permission(organization_id, 'staff.manage') and not is_system);
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.is_org_member(organization_id));
-- escrita de role_permissions apenas via set_role_permissions()

create policy members_select on public.organization_members for select to authenticated using (public.is_org_member(organization_id));
-- escrita de membros apenas via add_member()/update_member()

-- Assinatura
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_permission(organization_id, 'billing.view'));
create policy subscriptions_admin on public.subscriptions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.has_permission(organization_id, 'billing.view'));
create policy subscription_payments_admin on public.subscription_payments for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------- Política padrão: leitura por membro / escrita por permissão ----------
do $$
declare
  r record;
begin
  for r in select * from (values
    -- tabela,                 leitura,            escrita
    ('opening_hours',          null,               'settings.manage'),
    ('opening_exceptions',     null,               'settings.manage'),
    ('categories',             null,               'menu.manage'),
    ('products',               null,               'menu.manage'),
    ('product_images',         null,               'menu.manage'),
    ('modifier_groups',        null,               'menu.manage'),
    ('modifiers',              null,               'menu.manage'),
    ('product_modifier_groups',null,               'menu.manage'),
    ('combo_groups',           null,               'menu.manage'),
    ('combo_group_options',    null,               'menu.manage'),
    ('suppliers',              'inventory.view',   'inventory.manage'),
    ('ingredients',            'inventory.view',   'inventory.manage'),
    ('product_recipes',        'inventory.view',   'inventory.manage'),
    ('modifier_recipes',       'inventory.view',   'inventory.manage'),
    ('customers',              'customers.view',   'customers.manage'),
    ('customer_addresses',     'customers.view',   'customers.manage'),
    ('delivery_zones',         null,               'delivery.manage'),
    ('dining_tables',          null,               'tables.manage'),
    ('table_sessions',         null,               '__rpc_only__'),
    ('coupons',                'coupons.manage',   'coupons.manage'),
    ('coupon_redemptions',     'coupons.manage',   '__rpc_only__'),
    ('loyalty_programs',       null,               'loyalty.manage'),
    ('loyalty_rewards',        null,               'loyalty.manage'),
    ('loyalty_accounts',       'customers.view',   '__rpc_only__'),
    ('loyalty_transactions',   'customers.view',   '__rpc_only__'),
    ('reviews',                null,               'reviews.manage'),
    ('expenses',               'finance.view',     'finance.manage'),
    ('financial_entries',      'finance.view',     '__rpc_only__'),
    ('cash_registers',         'cash.operate',     '__rpc_only__'),
    ('cash_movements',         'cash.operate',     '__rpc_only__'),
    ('campaigns',              'marketing.manage', 'marketing.manage'),
    ('campaign_recipients',    'marketing.manage', 'marketing.manage'),
    ('whatsapp_templates',     null,               'marketing.manage'),
    ('order_items',            '__orders__',       '__rpc_only__'),
    ('order_item_modifiers',   '__orders__',       '__rpc_only__'),
    ('order_status_history',   '__orders__',       '__rpc_only__')
  ) as t(tbl, read_perm, write_perm)
  loop
    -- leitura
    if r.read_perm is null then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))',
                     r.tbl || '_select', r.tbl);
    elsif r.read_perm = '__orders__' then
      execute format($p$create policy %I on public.%I for select to authenticated using (
        public.has_permission(organization_id, 'orders.view') or public.has_permission(organization_id, 'kitchen.view')
        or exists (select 1 from public.orders o join public.drivers d on d.id = o.driver_id
                   where o.id = %s and d.user_id = auth.uid()))$p$,
        r.tbl || '_select', r.tbl,
        case r.tbl when 'order_items' then 'order_items.order_id'
                   when 'order_status_history' then 'order_status_history.order_id'
                   else '(select oi.order_id from public.order_items oi where oi.id = order_item_modifiers.order_item_id)' end);
    else
      execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(organization_id, %L) or public.has_permission(organization_id, %L))',
                     r.tbl || '_select', r.tbl, r.read_perm, coalesce(nullif(r.write_perm, '__rpc_only__'), r.read_perm));
    end if;
    -- escrita
    if r.write_perm <> '__rpc_only__' then
      execute format('create policy %I on public.%I for insert to authenticated with check (public.has_permission(organization_id, %L))',
                     r.tbl || '_insert', r.tbl, r.write_perm);
      execute format('create policy %I on public.%I for update to authenticated using (public.has_permission(organization_id, %L)) with check (public.has_permission(organization_id, %L))',
                     r.tbl || '_update', r.tbl, r.write_perm, r.write_perm);
      execute format('create policy %I on public.%I for delete to authenticated using (public.has_permission(organization_id, %L))',
                     r.tbl || '_delete', r.tbl, r.write_perm);
    end if;
  end loop;
end $$;

-- ---------- Pedidos ------------------------------------------------
create policy orders_select on public.orders for select to authenticated using (
  public.has_permission(organization_id, 'orders.view')
  or public.has_permission(organization_id, 'kitchen.view')
  or (public.has_permission(organization_id, 'deliveries.own')
      and exists (select 1 from public.drivers d where d.id = orders.driver_id and d.user_id = auth.uid()))
);
-- Atualizações diretas permitidas só para campos operacionais (observação, prazo).
-- Status, pagamento e entregador passam pelas RPCs; o trigger valida transições de qualquer forma.
create policy orders_update on public.orders for update to authenticated
  using (public.has_permission(organization_id, 'orders.manage'))
  with check (public.has_permission(organization_id, 'orders.manage'));
-- sem INSERT/DELETE direto: pedidos nascem por place_order/create_staff_order e nunca são excluídos

create or replace function public.guard_order_direct_update()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and pg_trigger_depth() = 1 then
    if new.status is distinct from old.status or new.payment_status is distinct from old.payment_status
       or new.total is distinct from old.total or new.subtotal is distinct from old.subtotal
       or new.discount is distinct from old.discount or new.delivery_fee is distinct from old.delivery_fee
       or new.driver_id is distinct from old.driver_id or new.customer_id is distinct from old.customer_id
       or new.stock_deducted is distinct from old.stock_deducted or new.loyalty_points_earned is distinct from old.loyalty_points_earned
       or new.customer_stats_applied is distinct from old.customer_stats_applied
       or new.payment_method is distinct from old.payment_method then
      raise exception 'Use as ações do pedido para alterar status, pagamento ou valores' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger orders_a_guard_direct before update on public.orders for each row execute function public.guard_order_direct_update();

-- ---------- Entregadores -------------------------------------------
create policy drivers_select on public.drivers for select to authenticated using (public.is_org_member(organization_id));
create policy drivers_insert on public.drivers for insert to authenticated with check (public.has_permission(organization_id, 'delivery.manage'));
create policy drivers_update on public.drivers for update to authenticated
  using (public.has_permission(organization_id, 'delivery.manage') or user_id = auth.uid())
  with check (public.has_permission(organization_id, 'delivery.manage') or user_id = auth.uid());
create policy drivers_delete on public.drivers for delete to authenticated using (public.has_permission(organization_id, 'delivery.manage'));

-- ---------- Estoque (movimentações) --------------------------------
create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (public.has_permission(organization_id, 'inventory.view') or public.has_permission(organization_id, 'inventory.manage'));
-- usuário só registra entradas/saídas/ajustes/perdas; vendas e estornos vêm do trigger do pedido
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated
  with check (public.has_permission(organization_id, 'inventory.manage') and type in ('in', 'out', 'adjust', 'loss'));

-- ---------- Notificações ------------------------------------------
create policy notifications_select on public.notifications for select to authenticated using (
  public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid())
  and (type <> 'subscription' or public.has_permission(organization_id, 'billing.view'))
  and (type <> 'low_stock' or public.has_permission(organization_id, 'inventory.view'))
  and (type <> 'new_order' or public.has_permission(organization_id, 'orders.view'))
  and (type <> 'review' or public.has_permission(organization_id, 'reviews.manage'))
);
create policy notification_reads_select on public.notification_reads for select to authenticated using (user_id = auth.uid());
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notification_reads_delete on public.notification_reads for delete to authenticated using (user_id = auth.uid());

-- ---------- WhatsApp log -------------------------------------------
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated
  using (public.has_permission(organization_id, 'marketing.manage') or public.has_permission(organization_id, 'orders.manage'));
create policy whatsapp_messages_insert on public.whatsapp_messages for insert to authenticated
  with check (public.has_permission(organization_id, 'marketing.manage') or public.has_permission(organization_id, 'orders.manage')
              or public.has_permission(organization_id, 'deliveries.own'));

-- ---------- Auditoria ----------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission(organization_id, 'staff.manage') or public.is_platform_admin());
