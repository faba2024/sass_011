-- =====================================================================
-- TOP BURGER OS — 0008 PAGAMENTO ONLINE (Pix automático via Mercado Pago)
-- Credenciais do gateway ficam numa tabela SEM acesso para anon/authenticated:
-- só o servidor (service_role) lê o token; a loja grava/consulta por RPCs.
-- =====================================================================

create table public.payment_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  access_token text not null check (char_length(access_token) between 20 and 300),
  webhook_secret text check (webhook_secret is null or char_length(webhook_secret) between 8 and 200),
  is_enabled boolean not null default false,
  live_mode boolean not null default false,
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_integrations_updated before update on public.payment_integrations
  for each row execute function public.set_updated_at();
alter table public.payment_integrations enable row level security;
-- nenhuma policy: anon/authenticated não leem nem escrevem diretamente
revoke all on public.payment_integrations from anon, authenticated;
grant all on public.payment_integrations to service_role;

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('mercadopago')),
  provider_payment_id text not null,
  method text not null default 'pix' check (method in ('pix')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded')),
  amount numeric(12,2) not null check (amount > 0),
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  expires_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index order_payments_order_idx on public.order_payments (order_id, created_at desc);
create trigger order_payments_updated before update on public.order_payments
  for each row execute function public.set_updated_at();
alter table public.order_payments enable row level security;
revoke all on public.order_payments from anon, authenticated;
grant select on public.order_payments to authenticated;
grant all on public.order_payments to service_role;
create policy order_payments_select on public.order_payments for select to authenticated
  using (public.has_permission(organization_id, 'orders.view'));

-- ---------- Configuração pela loja ---------------------------------
create or replace function public.payment_integration_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.payment_integrations;
begin
  perform public.require_permission(p_org, 'settings.manage');
  select * into r from public.payment_integrations where organization_id = p_org;
  if not found then
    return jsonb_build_object('configured', false, 'is_enabled', false);
  end if;
  return jsonb_build_object(
    'configured', true,
    'provider', r.provider,
    'is_enabled', r.is_enabled,
    'live_mode', r.live_mode,
    'token_hint', '…' || right(r.access_token, 4),
    'has_webhook_secret', r.webhook_secret is not null,
    'updated_at', r.updated_at
  );
end $$;

-- p_access_token / p_webhook_secret nulos = mantém o valor salvo
create or replace function public.set_payment_integration(
  p_org uuid, p_enabled boolean, p_access_token text default null, p_webhook_secret text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text := nullif(trim(coalesce(p_access_token, '')), ''); v_secret text := nullif(trim(coalesce(p_webhook_secret, '')), '');
begin
  perform public.require_permission(p_org, 'settings.manage');
  if v_token is not null and v_token !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{10,}$' then
    raise exception 'Access Token inválido: copie o "Access Token" (começa com APP_USR- ou TEST-) no painel do Mercado Pago';
  end if;
  if not exists (select 1 from public.payment_integrations where organization_id = p_org) then
    if v_token is null then raise exception 'Informe o Access Token do Mercado Pago'; end if;
    insert into public.payment_integrations (organization_id, access_token, webhook_secret, is_enabled, live_mode)
    values (p_org, v_token, v_secret, coalesce(p_enabled, false), v_token like 'APP_USR-%');
  else
    update public.payment_integrations set
      access_token = coalesce(v_token, access_token),
      webhook_secret = coalesce(v_secret, webhook_secret),
      is_enabled = coalesce(p_enabled, is_enabled),
      live_mode = coalesce(v_token, access_token) like 'APP_USR-%',
      updated_by = auth.uid()
    where organization_id = p_org;
  end if;
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (p_org, auth.uid(), 'payments.integration', 'payment_integrations', p_org::text,
          jsonb_build_object('enabled', p_enabled, 'token_changed', v_token is not null, 'secret_changed', v_secret is not null));
  return public.payment_integration_status(p_org);
end $$;

create or replace function public.remove_payment_integration(p_org uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_permission(p_org, 'settings.manage');
  delete from public.payment_integrations where organization_id = p_org;
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id)
  values (p_org, auth.uid(), 'payments.integration_removed', 'payment_integrations', p_org::text);
end $$;

-- ---------- Público: cobrança Pix do pedido (pelo token) -----------
create or replace function public.get_order_pix(p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'online', exists (select 1 from public.payment_integrations i where i.organization_id = o.organization_id and i.is_enabled),
    'charge', (select jsonb_build_object('status', p.status, 'qr_code', p.qr_code, 'qr_code_base64', p.qr_code_base64,
                                         'expires_at', p.expires_at, 'amount', p.amount)
               from public.order_payments p
               where p.order_id = o.id and p.status in ('pending', 'approved')
               order by p.created_at desc limit 1)
  )
  from public.orders o where o.public_token = p_token
$$;

-- ---------- Servidor (service_role): confirmação pelo gateway -------
-- Chamado somente depois que o servidor consultou o pagamento na API do Mercado Pago.
create or replace function public.confirm_provider_payment(
  p_order uuid, p_provider text, p_provider_payment_id text, p_amount numeric
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Somente o servidor confirma pagamentos do gateway' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if abs(coalesce(p_amount, 0) - v_o.total) > 0.009 then
    raise exception 'Valor pago (%) diferente do total do pedido (%)', p_amount, v_o.total;
  end if;

  update public.order_payments set status = 'approved', approved_at = coalesce(approved_at, now())
  where provider = p_provider and provider_payment_id = p_provider_payment_id and order_id = p_order;

  if v_o.payment_status = 'paid' then
    return jsonb_build_object('order_id', v_o.id, 'already_paid', true);
  end if;
  if v_o.status = 'cancelled' then
    -- pago depois de cancelado: registra para estorno manual e avisa a loja
    insert into public.notifications (organization_id, type, title, body, link)
    values (v_o.organization_id, 'system', 'Pix recebido em pedido cancelado',
            'Pedido #' || v_o.number || ' foi pago depois de cancelado. Faça o estorno pelo Mercado Pago.', '/app/pedidos/' || v_o.id);
    return jsonb_build_object('order_id', v_o.id, 'cancelled', true);
  end if;

  update public.orders
  set payment_status = 'paid', payment_method = 'pix', payment_provider = p_provider, payment_ref = p_provider_payment_id
  where id = p_order;

  insert into public.notifications (organization_id, type, title, body, link)
  values (v_o.organization_id, 'system', 'Pix confirmado · #' || v_o.number,
          'Pagamento de ' || public.fmt_brl(v_o.total) || ' confirmado automaticamente pelo Mercado Pago.', '/app/pedidos/' || v_o.id);
  return jsonb_build_object('order_id', v_o.id, 'paid', true);
end $$;

revoke all on function public.payment_integration_status(uuid), public.set_payment_integration(uuid, boolean, text, text),
  public.remove_payment_integration(uuid), public.get_order_pix(text),
  public.confirm_provider_payment(uuid, text, text, numeric) from public, anon;
grant execute on function public.payment_integration_status(uuid), public.set_payment_integration(uuid, boolean, text, text),
  public.remove_payment_integration(uuid) to authenticated;
grant execute on function public.get_order_pix(text) to anon, authenticated;
grant execute on function public.confirm_provider_payment(uuid, text, text, numeric) to service_role;
