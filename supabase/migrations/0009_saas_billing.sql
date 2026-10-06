-- =====================================================================
-- TOP BURGER OS — 0009 MENSALIDADE ONLINE (Pix do dono da plataforma)
-- A hamburgueria paga a fatura da assinatura com Pix (Mercado Pago da
-- PLATAFORMA). A baixa é feita só pelo servidor após consultar o gateway.
-- =====================================================================

-- Credenciais da plataforma: sem grants para anon/authenticated (só service_role)
create table public.platform_secrets (
  key text primary key check (key in ('mercadopago_access_token', 'mercadopago_webhook_secret')),
  value text not null check (char_length(value) between 8 and 300),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;
revoke all on public.platform_secrets from anon, authenticated;
grant all on public.platform_secrets to service_role;

alter table public.subscription_payments
  add column provider text,
  add column provider_payment_id text,
  add column qr_code text,
  add column qr_code_base64 text,
  add column pix_expires_at timestamptz;
create unique index subscription_payments_provider_idx on public.subscription_payments (provider, provider_payment_id)
  where provider_payment_id is not null;

-- ---------- Baixa (núcleo único, usado pelo admin e pelo gateway) -----
create or replace function public._apply_subscription_payment(p_payment uuid, p_method text, p_paid_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.subscription_payments; s public.subscriptions;
begin
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if p.status = 'paid' then raise exception 'Fatura já está paga'; end if;
  if p.status = 'cancelled' then raise exception 'Fatura cancelada'; end if;
  update subscription_payments set status = 'paid', paid_at = p_paid_at, method = p_method where id = p.id;
  select * into s from subscriptions where id = p.subscription_id for update;
  update subscriptions set
    status = 'active',
    trial_ends_at = case when s.status = 'trialing' then least(coalesce(s.trial_ends_at, now()), now()) else s.trial_ends_at end,
    current_period_start = greatest(coalesce(s.current_period_end, p.due_date), p.due_date),
    current_period_end = (greatest(coalesce(s.current_period_end, p.due_date), p.due_date) + interval '1 month')::date,
    cancelled_at = null
  where id = s.id;
  update organizations set status = 'active' where id = p.organization_id and status = 'suspended';
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p.organization_id, auth.uid(), 'platform.payment', 'subscription_payments', p.id::text,
          jsonb_build_object('amount', p.amount, 'method', p_method));
end $$;

create or replace function public.platform_register_payment(p_payment uuid, p_method text default 'pix', p_paid_at timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._require_platform_admin();
  perform public._apply_subscription_payment(p_payment, p_method, p_paid_at);
end $$;

-- ---------- Admin: conta Mercado Pago que recebe as mensalidades ------
create or replace function public.platform_payment_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_token text;
begin
  perform public._require_platform_admin();
  select value into v_token from platform_secrets where key = 'mercadopago_access_token';
  return jsonb_build_object(
    'configured', v_token is not null,
    'live_mode', coalesce(v_token like 'APP_USR-%', false),
    'token_hint', case when v_token is null then null else '…' || right(v_token, 4) end,
    'has_webhook_secret', exists (select 1 from platform_secrets where key = 'mercadopago_webhook_secret')
  );
end $$;

create or replace function public.set_platform_payment(p_access_token text default null, p_webhook_secret text default null, p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text := nullif(trim(coalesce(p_access_token, '')), ''); v_secret text := nullif(trim(coalesce(p_webhook_secret, '')), '');
begin
  perform public._require_platform_admin();
  if p_remove then
    delete from platform_secrets where key in ('mercadopago_access_token', 'mercadopago_webhook_secret');
  else
    if v_token is not null then
      if v_token !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{10,}$' then
        raise exception 'Access Token inválido: copie o "Access Token" (começa com APP_USR- ou TEST-) no painel do Mercado Pago';
      end if;
      insert into platform_secrets (key, value) values ('mercadopago_access_token', v_token)
      on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();
    end if;
    if v_secret is not null then
      insert into platform_secrets (key, value) values ('mercadopago_webhook_secret', v_secret)
      on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();
    end if;
  end if;
  insert into audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (null, auth.uid(), 'platform.payment_settings', 'platform_secrets', null,
          jsonb_build_object('removed', p_remove, 'token_changed', v_token is not null, 'secret_changed', v_secret is not null));
  return public.platform_payment_status();
end $$;

-- ---------- Loja: fatura em aberto para pagar agora -------------------
-- Devolve a fatura pendente/atrasada mais antiga; se não houver nenhuma
-- e a assinatura não estiver em dia, gera a fatura do próximo período.
create or replace function public.billing_open_invoice(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; p public.subscription_payments; v_due date;
begin
  perform public.require_permission(p_org, 'billing.view');
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
    v_due := case when s.status = 'active' and s.current_period_end is not null then s.current_period_end else current_date end;
    insert into subscription_payments (organization_id, subscription_id, amount, due_date)
    values (p_org, s.id, s.price, v_due) returning * into p;
  end if;
  return jsonb_build_object('id', p.id, 'amount', p.amount, 'due_date', p.due_date, 'status', p.status);
end $$;

-- ---------- Servidor (service_role): baixa pelo gateway ---------------
create or replace function public.confirm_subscription_pix(p_payment uuid, p_provider_payment_id text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.subscription_payments;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Somente o servidor confirma pagamentos do gateway' using errcode = '42501';
  end if;
  select * into p from subscription_payments where id = p_payment for update;
  if not found then raise exception 'Fatura não encontrada'; end if;
  if p.status = 'paid' then return jsonb_build_object('already_paid', true); end if;
  if abs(coalesce(p_amount, 0) - p.amount) > 0.009 then
    raise exception 'Valor pago (%) diferente da fatura (%)', p_amount, p.amount;
  end if;
  update subscription_payments set provider = 'mercadopago', provider_payment_id = p_provider_payment_id, provider_ref = p_provider_payment_id
  where id = p.id;
  perform public._apply_subscription_payment(p.id, 'pix', now());
  insert into notifications (organization_id, type, title, body, link)
  values (p.organization_id, 'subscription', 'Mensalidade paga',
          'Pagamento de ' || public.fmt_brl(p.amount) || ' confirmado. Obrigado!', '/app/configuracoes?tab=assinatura');
  return jsonb_build_object('paid', true);
end $$;

revoke all on function public._apply_subscription_payment(uuid, text, timestamptz), public.platform_payment_status(),
  public.set_platform_payment(text, text, boolean), public.billing_open_invoice(uuid),
  public.confirm_subscription_pix(uuid, text, numeric) from public, anon;
grant execute on function public.platform_payment_status(), public.set_platform_payment(text, text, boolean),
  public.billing_open_invoice(uuid) to authenticated;
grant execute on function public.confirm_subscription_pix(uuid, text, numeric) to service_role;
