-- =====================================================================
-- TOP BURGER OS — 0010 TESTE GRÁTIS DE 15 DIAS (acesso Premium completo)
-- Toda hamburgueria nova ganha 15 dias com TODOS os recursos. Depois vale
-- o plano contratado; sem plano escolhido, o painel pede a escolha.
-- Nada é apagado quando o teste acaba. Idempotente: pode rodar de novo.
-- =====================================================================

-- ---------- Colunas (o plano continua em subscriptions.plan_id) -------
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_active boolean not null default false,
  add column if not exists plan_chosen_at timestamptz;

comment on column public.subscriptions.trial_active is 'Teste grátis em andamento (vale só enquanto trial_ends_at > now()).';
comment on column public.subscriptions.plan_chosen_at is 'Quando a loja escolheu/contratou o plano; null = ainda não escolheu.';

-- ---------- Empresas antigas: preencher sem quebrar -------------------
-- trial sem data de fim → 15 dias a partir da criação
update public.subscriptions
set trial_ends_at = created_at + interval '15 days'
where status = 'trialing' and trial_ends_at is null;

update public.subscriptions
set trial_started_at = coalesce(trial_started_at, created_at)
where trial_ends_at is not null and trial_started_at is null;

update public.subscriptions
set trial_active = (status = 'trialing' and trial_ends_at > now())
where trial_started_at is not null and status = 'trialing';

-- quem já paga (ou já pagou alguma fatura) tem plano escolhido
update public.subscriptions s
set plan_chosen_at = coalesce(s.current_period_start::timestamptz, s.created_at)
where s.plan_chosen_at is null
  and (s.status in ('active', 'past_due')
       or exists (select 1 from public.subscription_payments p where p.subscription_id = s.id and p.status = 'paid'));

-- novo padrão de dias de teste
update public.platform_settings
set value = jsonb_set(value, '{trial_days}', '15'), updated_at = now()
where key = 'signup' and coalesce((value->>'trial_days')::int, 14) = 14;

-- ---------- Regra central: o teste está valendo? ----------------------
create or replace function public.trial_is_on(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  -- linhas antigas (sem trial_started_at) em teste também contam, sem precisar de migração de dados
  select coalesce((select (s.trial_active or (s.status = 'trialing' and s.trial_started_at is null))
                          and s.trial_ends_at is not null and s.trial_ends_at > now()
                   from public.subscriptions s where s.organization_id = p_org), false)
$$;

-- Todos os recursos existentes (o teste equivale ao Premium e libera tudo)
create or replace function public.all_features()
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct f order by f), '{}') from (
    select unnest(features) f from public.plans
    union select unnest(array['cardapio_online','pedidos','cozinha','delivery','clientes','cupons','estoque',
                              'caixa','financeiro','fidelidade','mesas','relatorios','marketing','dominio_proprio'])
  ) t
$$;

-- 1º teste ativo → tudo; depois → recursos do plano contratado
create or replace function public.org_features(p_org uuid)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.trial_is_on(p_org) then public.all_features()
              else coalesce((select p.features from public.subscriptions s join public.plans p on p.id = s.plan_id
                             where s.organization_id = p_org), '{}') end
$$;

-- Limites: durante o teste não há limite (igual ao Premium)
create or replace function public.plan_limit(p_org uuid, p_key text)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.trial_is_on(p_org) then null
              else (select nullif(p.limits->>p_key, '')::int
                    from public.subscriptions s join public.plans p on p.id = s.plan_id
                    where s.organization_id = p_org) end
$$;

-- Encerra testes vencidos (marca trial_active = false; status vai para "pendente"
-- quando nada foi pago — a loja escolhe/paga o plano sem perder nenhum dado)
create or replace function public._expire_trials(p_org uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v int;
begin
  update public.subscriptions
  set trial_active = false,
      status = case when status = 'trialing' then 'pending'::public.subscription_status else status end
  where (trial_active or status = 'trialing')
    and trial_ends_at <= now() and (p_org is null or organization_id = p_org);
  get diagnostics v = row_count;
  return v;
end $$;

-- Estado do plano para o painel (qualquer membro da empresa)
create or replace function public.org_plan_state(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; p public.plans; v_on boolean; v_left int;
begin
  if not public.is_org_member(p_org) then raise exception 'Sem acesso a esta empresa' using errcode = '42501'; end if;
  perform public._expire_trials(p_org);
  select * into s from subscriptions where organization_id = p_org;
  if not found then
    return jsonb_build_object('has_subscription', false, 'trial_active', false, 'needs_plan', false, 'features', '[]'::jsonb);
  end if;
  select * into p from plans where id = s.plan_id;
  v_on := public.trial_is_on(p_org);
  v_left := case when v_on then greatest(1, ceil(extract(epoch from (s.trial_ends_at - now())) / 86400.0)::int) else 0 end;
  return jsonb_build_object(
    'has_subscription', true,
    'status', s.status,
    'trial_active', v_on,
    'trial_started_at', s.trial_started_at,
    'trial_ends_at', s.trial_ends_at,
    'trial_days_left', v_left,
    'plan_code', p.code,
    'plan_name', p.name,
    'plan_price', s.price,
    'plan_features', to_jsonb(coalesce(p.features, '{}')),
    'plan_chosen', s.plan_chosen_at is not null,
    'needs_plan', not v_on and s.plan_chosen_at is null and s.status <> 'cancelled',
    'features', to_jsonb(public.org_features(p_org))
  );
end $$;

-- ---------- Loja escolhe/troca o plano (upgrade/downgrade) ------------
-- Não apaga nada. Durante o teste, tudo continua liberado até o fim dos 15 dias.
create or replace function public.choose_plan(p_org uuid, p_plan_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.plans; s public.subscriptions;
begin
  perform public.require_permission(p_org, 'billing.view');
  select * into v_plan from plans where code = upper(trim(coalesce(p_plan_code, ''))) and is_active;
  if not found then raise exception 'Plano inválido'; end if;
  select * into s from subscriptions where organization_id = p_org for update;
  if not found then raise exception 'Assinatura não encontrada. Fale com o suporte.'; end if;
  if s.status = 'cancelled' then raise exception 'Assinatura cancelada. Fale com o suporte para reativar.'; end if;

  update subscriptions set plan_id = v_plan.id, price = v_plan.price, plan_chosen_at = now()
  where id = s.id;
  -- faturas em aberto passam a ter o valor do novo plano
  update subscription_payments set amount = v_plan.price
  where subscription_id = s.id and status in ('pending', 'overdue') and amount <> v_plan.price;

  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p_org, auth.uid(), 'subscription.choose_plan', 'subscriptions', s.id::text,
          jsonb_build_object('from', (select code from plans where id = s.plan_id), 'to', v_plan.code, 'trial_active', public.trial_is_on(p_org)));
  return public.org_plan_state(p_org);
end $$;

-- ---------- Novas empresas: 15 dias de teste --------------------------
create or replace function public._subscription_trial_defaults()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'trialing' then
      new.trial_started_at := coalesce(new.trial_started_at, now());
      new.trial_ends_at := coalesce(new.trial_ends_at, new.trial_started_at + interval '15 days');
      new.trial_active := new.trial_ends_at > now();
    elsif new.status in ('active', 'past_due') then
      new.plan_chosen_at := coalesce(new.plan_chosen_at, now());
    end if;
  else
    -- admin alterou a data de fim do teste
    if new.trial_ends_at is distinct from old.trial_ends_at and new.trial_ends_at is not null and new.status <> 'cancelled' then
      new.trial_started_at := coalesce(new.trial_started_at, old.created_at);
      new.trial_active := new.trial_ends_at > now();
    end if;
    if new.status = 'cancelled' then new.trial_active := false; end if;
    -- pagou / ativado pelo admin / plano trocado pelo admin → plano escolhido
    if new.plan_chosen_at is null and (new.status in ('active', 'past_due') or new.plan_id <> old.plan_id) then
      new.plan_chosen_at := now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists subscriptions_trial_defaults on public.subscriptions;
create trigger subscriptions_trial_defaults before insert or update on public.subscriptions
for each row execute function public._subscription_trial_defaults();

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
    greatest(coalesce((v_cfg->>'trial_days')::int, 15), 1), 'trialing');
end $$;

create or replace function public.platform_public()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'support', coalesce((select value from platform_settings where key = 'support'), '{}'),
    'trial_days', coalesce(((select value from platform_settings where key = 'signup')->>'trial_days')::int, 15),
    'signup_enabled', coalesce(((select value from platform_settings where key = 'signup')->>'enabled')::boolean, true)
  )
$$;

-- ---------- Vencimentos: também encerra testes ------------------------
create or replace function public.platform_refresh_billing()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_overdue int; v_trials int;
begin
  perform public._require_platform_admin();
  update subscription_payments set status = 'overdue' where status = 'pending' and due_date < current_date;
  get diagnostics v_overdue = row_count;
  update subscriptions s set status = 'past_due'
  where s.status = 'active' and exists (select 1 from subscription_payments p where p.subscription_id = s.id and p.status = 'overdue');
  v_trials := public._expire_trials(null);
  -- legado: trial sem flag (antes da 0010)
  update subscriptions set status = 'pending' where status = 'trialing' and trial_ends_at < now() and not trial_active;
  return jsonb_build_object('overdue', v_overdue, 'trials_expired', v_trials);
end $$;

-- ---------- Pagou durante o teste: o teste continua até o fim ---------
create or replace function public._apply_subscription_payment(p_payment uuid, p_method text, p_paid_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.subscription_payments; s public.subscriptions; v_base date; v_first boolean;
begin
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if p.status = 'paid' then raise exception 'Fatura já está paga'; end if;
  if p.status = 'cancelled' then raise exception 'Fatura cancelada'; end if;
  update subscription_payments set status = 'paid', paid_at = p_paid_at, method = p_method where id = p.id;
  select * into s from subscriptions where id = p.subscription_id for update;
  v_first := not exists (select 1 from subscription_payments x where x.subscription_id = s.id and x.status = 'paid' and x.id <> p.id);
  if v_first then
    -- primeiro mês começa no fim do teste (ou no vencimento, se o teste já acabou)
    v_base := greatest(p.due_date, case when s.trial_active and s.trial_ends_at > now() then s.trial_ends_at::date else p.due_date end);
  else
    v_base := greatest(coalesce(s.current_period_end, p.due_date), p.due_date);
  end if;
  update subscriptions set
    status = 'active',
    plan_chosen_at = coalesce(plan_chosen_at, now()),
    current_period_start = v_base,
    current_period_end = (v_base + interval '1 month')::date,
    cancelled_at = null
  where id = s.id;
  update organizations set status = 'active' where id = p.organization_id and status = 'suspended';
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p.organization_id, auth.uid(), 'platform.payment', 'subscription_payments', p.id::text,
          jsonb_build_object('amount', p.amount, 'method', p_method));
end $$;

-- Fatura em aberto: pagar durante o teste vale a partir do fim do teste
create or replace function public.billing_open_invoice(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; p public.subscription_payments; v_due date;
begin
  perform public.require_permission(p_org, 'billing.view');
  perform public._expire_trials(p_org);
  select * into s from subscriptions where organization_id = p_org for update;
  if not found then raise exception 'Assinatura não encontrada. Fale com o suporte.'; end if;
  if s.status = 'cancelled' then raise exception 'Assinatura cancelada. Fale com o suporte para reativar.'; end if;
  if s.price <= 0 then raise exception 'Este plano não tem mensalidade a pagar.'; end if;

  select * into p from subscription_payments
  where subscription_id = s.id and status in ('pending', 'overdue')
  order by due_date limit 1;
  if not found then
    if s.status = 'active' and s.current_period_end is not null and s.current_period_end > current_date + 7 then
      raise exception 'Sua assinatura já está paga até %. A próxima fatura fica disponível 7 dias antes.', to_char(s.current_period_end, 'DD/MM/YYYY');
    end if;
    v_due := case when s.status = 'active' and s.current_period_end is not null then s.current_period_end
                  when s.trial_active and s.trial_ends_at > now() then s.trial_ends_at::date
                  else current_date end;
    insert into subscription_payments (organization_id, subscription_id, amount, due_date)
    values (p_org, s.id, s.price, v_due) returning * into p;
  end if;
  return jsonb_build_object('id', p.id, 'amount', p.amount, 'due_date', p.due_date, 'status', p.status);
end $$;

-- ---------- Permissões --------------------------------------------------
revoke all on function public.trial_is_on(uuid), public.all_features(), public._expire_trials(uuid),
  public.org_plan_state(uuid), public.choose_plan(uuid, text), public._subscription_trial_defaults() from public, anon;
revoke all on function public.trial_is_on(uuid), public._expire_trials(uuid), public._subscription_trial_defaults() from authenticated;
grant execute on function public.org_plan_state(uuid), public.choose_plan(uuid, text), public.org_features(uuid) to authenticated;
