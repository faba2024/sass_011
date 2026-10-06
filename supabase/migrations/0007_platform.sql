-- =====================================================================
-- TOP BURGER OS — 0007 PAINEL MASTER (administração da plataforma)
-- Funções agregadas executadas apenas por is_platform_admin().
-- =====================================================================

create or replace function public._require_platform_admin()
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Apenas a administração da plataforma' using errcode = '42501';
  end if;
end $$;

-- Visão geral: empresas, assinaturas, MRR, pedidos processados
create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._require_platform_admin();
  select jsonb_build_object(
    'organizations', (select count(*) from organizations where deleted_at is null),
    'orgs_active', (select count(*) from organizations where deleted_at is null and status = 'active'),
    'orgs_suspended', (select count(*) from organizations where deleted_at is null and status = 'suspended'),
    'new_orgs_30d', (select count(*) from organizations where deleted_at is null and created_at >= now() - interval '30 days'),
    'subs', (select coalesce(jsonb_object_agg(status, n), '{}') from (
               select s.status, count(*) n from subscriptions s join organizations o on o.id = s.organization_id
               where o.deleted_at is null group by s.status) x),
    'mrr', (select coalesce(sum(s.price), 0) from subscriptions s join organizations o on o.id = s.organization_id
            where o.deleted_at is null and o.status = 'active' and s.status = 'active'),
    'mrr_trial_potential', (select coalesce(sum(s.price), 0) from subscriptions s join organizations o on o.id = s.organization_id
            where o.deleted_at is null and s.status = 'trialing'),
    'received_month', (select coalesce(sum(amount), 0) from subscription_payments
                       where status = 'paid' and paid_at >= date_trunc('month', now())),
    'overdue', (select coalesce(sum(amount), 0) from subscription_payments
                where status in ('pending', 'overdue') and due_date < current_date),
    'overdue_count', (select count(*) from subscription_payments
                      where status in ('pending', 'overdue') and due_date < current_date),
    'trials_ending_7d', (select count(*) from subscriptions where status = 'trialing'
                         and trial_ends_at between now() and now() + interval '7 days'),
    'orders_30d', (select count(*) from orders where created_at >= now() - interval '30 days' and status <> 'cancelled'),
    'gmv_30d', (select coalesce(sum(total), 0) from orders where created_at >= now() - interval '30 days' and status = 'delivered'),
    'users', (select count(*) from profiles),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'name', p.name, 'count',
                (select count(*) from subscriptions s join organizations o on o.id = s.organization_id
                 where s.plan_id = p.id and o.deleted_at is null and s.status in ('active', 'trialing'))) order by p.sort), '[]')
              from plans p),
    'growth', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                 'orgs', (select count(*) from organizations o where o.deleted_at is null and date_trunc('month', o.created_at) = m),
                 'revenue', (select coalesce(sum(amount), 0) from subscription_payments sp where sp.status = 'paid' and date_trunc('month', sp.paid_at) = m))
               order by m), '[]')
               from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m)
  ) into v;
  return v;
end $$;

-- Lista de empresas com plano, assinatura, dono e movimento
create or replace function public.platform_organizations(p_search text default null, p_status text default null)
returns table (
  id uuid, name text, slug text, status text, custom_domain text, created_at timestamptz,
  plan_code text, plan_name text, sub_status text, sub_price numeric, trial_ends_at timestamptz, current_period_end date,
  owner_name text, owner_email text, members int, products int, orders_30d int, gmv_30d numeric, last_order_at timestamptz
) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_platform_admin();
  return query
  select o.id, o.name, o.slug, o.status::text, o.custom_domain, o.created_at,
         p.code, p.name, s.status::text, s.price, s.trial_ends_at, s.current_period_end,
         ow.full_name, ow.email,
         (select count(*)::int from organization_members m where m.organization_id = o.id and m.is_active),
         (select count(*)::int from products pr where pr.organization_id = o.id and pr.deleted_at is null),
         (select count(*)::int from orders x where x.organization_id = o.id and x.created_at >= now() - interval '30 days' and x.status <> 'cancelled'),
         (select coalesce(sum(x.total), 0) from orders x where x.organization_id = o.id and x.created_at >= now() - interval '30 days' and x.status = 'delivered'),
         (select max(x.created_at) from orders x where x.organization_id = o.id)
  from organizations o
  left join subscriptions s on s.organization_id = o.id
  left join plans p on p.id = s.plan_id
  left join lateral (
    select pf.full_name, pf.email from organization_members m
    join roles r on r.id = m.role_id and r.key = 'owner'
    join profiles pf on pf.id = m.user_id
    where m.organization_id = o.id order by m.created_at limit 1
  ) ow on true
  where o.deleted_at is null
    and (p_status is null or p_status = '' or o.status::text = p_status or s.status::text = p_status)
    and (p_search is null or p_search = '' or o.name ilike '%' || p_search || '%' or o.slug ilike '%' || p_search || '%'
         or ow.email ilike '%' || p_search || '%')
  order by o.created_at desc;
end $$;

-- Usuários da plataforma com suas empresas
create or replace function public.platform_users(p_search text default null)
returns table (id uuid, email text, full_name text, is_platform_admin boolean, created_at timestamptz, orgs jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_platform_admin();
  return query
  select pf.id, pf.email, pf.full_name, pf.is_platform_admin, pf.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', r.name, 'active', m.is_active) order by o.name)
                   from organization_members m join organizations o on o.id = m.organization_id and o.deleted_at is null
                   join roles r on r.id = m.role_id where m.user_id = pf.id), '[]')
  from profiles pf
  where p_search is null or p_search = '' or pf.email ilike '%' || p_search || '%' or pf.full_name ilike '%' || p_search || '%'
  order by pf.created_at desc
  limit 500;
end $$;

-- Altera plano/assinatura de uma empresa
create or replace function public.platform_update_subscription(
  p_org uuid, p_plan_code text, p_status public.subscription_status, p_price numeric default null,
  p_trial_ends_at timestamptz default null, p_period_end date default null, p_notes text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.plans;
begin
  perform public._require_platform_admin();
  select * into v_plan from plans where code = upper(p_plan_code);
  if not found then raise exception 'Plano inexistente'; end if;
  insert into subscriptions (organization_id, plan_id, status, price, trial_ends_at, current_period_start, current_period_end, notes)
  values (p_org, v_plan.id, p_status, coalesce(p_price, v_plan.price), p_trial_ends_at,
          case when p_status = 'active' then current_date end, p_period_end, p_notes)
  on conflict (organization_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    price = coalesce(p_price, v_plan.price),
    trial_ends_at = coalesce(p_trial_ends_at, subscriptions.trial_ends_at),
    current_period_end = coalesce(p_period_end, subscriptions.current_period_end),
    current_period_start = case when excluded.status = 'active' and subscriptions.status <> 'active' then current_date
                                else subscriptions.current_period_start end,
    cancelled_at = case when excluded.status = 'cancelled' then now() else null end,
    notes = coalesce(p_notes, subscriptions.notes);
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p_org, auth.uid(), 'platform.subscription', 'subscriptions', p_org,
          jsonb_build_object('plan', v_plan.code, 'status', p_status, 'price', coalesce(p_price, v_plan.price)));
end $$;

-- Gera fatura do período para uma empresa
create or replace function public.platform_create_invoice(p_org uuid, p_due date, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; v_id uuid;
begin
  perform public._require_platform_admin();
  select * into s from subscriptions where organization_id = p_org;
  if not found then raise exception 'Empresa sem assinatura'; end if;
  if coalesce(p_amount, s.price) <= 0 then raise exception 'Valor da fatura inválido'; end if;
  if exists (select 1 from subscription_payments where subscription_id = s.id and due_date = p_due and status <> 'cancelled') then
    raise exception 'Já existe fatura com este vencimento';
  end if;
  insert into subscription_payments (organization_id, subscription_id, amount, due_date)
  values (p_org, s.id, coalesce(p_amount, s.price), p_due) returning id into v_id;
  return v_id;
end $$;

-- Baixa de fatura: ativa a assinatura e estende o período em 1 mês
create or replace function public.platform_register_payment(p_payment uuid, p_method text default 'pix', p_paid_at timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.subscription_payments; s public.subscriptions;
begin
  perform public._require_platform_admin();
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if p.status = 'paid' then raise exception 'Fatura já está paga'; end if;
  if p.status = 'cancelled' then raise exception 'Fatura cancelada'; end if;
  update subscription_payments set status = 'paid', paid_at = p_paid_at, method = p_method where id = p.id;
  select * into s from subscriptions where id = p.subscription_id for update;
  update subscriptions set
    status = 'active',
    current_period_start = greatest(coalesce(s.current_period_end, p.due_date), p.due_date),
    current_period_end = (greatest(coalesce(s.current_period_end, p.due_date), p.due_date) + interval '1 month')::date,
    cancelled_at = null
  where id = s.id;
  -- reativa empresa suspensa por inadimplência
  update organizations set status = 'active' where id = p.organization_id and status = 'suspended';
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p.organization_id, auth.uid(), 'platform.payment', 'subscription_payments', p.id,
          jsonb_build_object('amount', p.amount, 'method', p_method));
end $$;

-- Marca faturas vencidas como atrasadas e assinaturas como past_due (rodar diariamente / ao abrir o master)
create or replace function public.platform_refresh_billing()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_overdue int; v_trials int;
begin
  perform public._require_platform_admin();
  update subscription_payments set status = 'overdue' where status = 'pending' and due_date < current_date;
  get diagnostics v_overdue = row_count;
  update subscriptions s set status = 'past_due'
  where s.status = 'active' and exists (select 1 from subscription_payments p where p.subscription_id = s.id and p.status = 'overdue');
  update subscriptions set status = 'pending' where status = 'trialing' and trial_ends_at < now();
  get diagnostics v_trials = row_count;
  return jsonb_build_object('overdue', v_overdue, 'trials_expired', v_trials);
end $$;

revoke all on function public._require_platform_admin(), public.platform_overview(), public.platform_organizations(text, text),
  public.platform_users(text), public.platform_update_subscription(uuid, text, public.subscription_status, numeric, timestamptz, date, text),
  public.platform_create_invoice(uuid, date, numeric), public.platform_register_payment(uuid, text, timestamptz),
  public.platform_refresh_billing() from public, anon;
grant execute on function public.platform_overview(), public.platform_organizations(text, text), public.platform_users(text),
  public.platform_update_subscription(uuid, text, public.subscription_status, numeric, timestamptz, date, text),
  public.platform_create_invoice(uuid, date, numeric), public.platform_register_payment(uuid, text, timestamptz),
  public.platform_refresh_billing() to authenticated;

-- ---------- Configurações da plataforma aplicadas ao cadastro -------
-- platform_settings:
--   signup  = {"enabled": true, "plan_code": "STARTER", "trial_days": 14}
--   support = {"whatsapp": "...", "email": "...", "hours": "..."}
insert into public.platform_settings (key, value) values
  ('signup', '{"enabled": true, "plan_code": "STARTER", "trial_days": 14}'),
  ('support', '{"whatsapp": null, "email": null, "hours": "Seg a sex, 9h às 18h"}')
on conflict (key) do nothing;

create or replace function public.create_my_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cfg jsonb;
begin
  if auth.uid() is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  select value into v_cfg from public.platform_settings where key = 'signup';
  if coalesce((v_cfg->>'enabled')::boolean, true) = false then
    raise exception 'Novos cadastros estão temporariamente fechados. Fale com o suporte.';
  end if;
  if exists (select 1 from public.organization_members m join public.roles r on r.id = m.role_id
             where m.user_id = auth.uid() and r.key = 'owner') then
    raise exception 'Você já possui uma empresa cadastrada';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da hamburgueria'; end if;
  return public._provision_organization(p_name, p_slug, auth.uid(),
    coalesce(nullif(v_cfg->>'plan_code', ''), 'STARTER'),
    greatest(coalesce((v_cfg->>'trial_days')::int, 14), 0), 'trialing');
end $$;

-- Dados públicos da plataforma (landing page): suporte e dias de teste
create or replace function public.platform_public()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'support', coalesce((select value from platform_settings where key = 'support'), '{}'),
    'trial_days', coalesce(((select value from platform_settings where key = 'signup')->>'trial_days')::int, 14),
    'signup_enabled', coalesce(((select value from platform_settings where key = 'signup')->>'enabled')::boolean, true)
  )
$$;
revoke all on function public.platform_public() from public;
grant execute on function public.platform_public() to anon, authenticated;
