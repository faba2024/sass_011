-- =====================================================================
-- TOP BURGER OS — 0001 FOUNDATION
-- Tipos, plataforma SaaS, organizações, perfis, RBAC, assinaturas, horários
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Tipos ----------------------------------------------------
create type public.org_status as enum ('active', 'suspended', 'cancelled');
create type public.store_mode as enum ('auto', 'open', 'closed');
create type public.subscription_status as enum ('trialing', 'active', 'pending', 'past_due', 'cancelled');
create type public.product_type as enum ('simple', 'combo');
create type public.modifier_kind as enum ('variation', 'addon', 'removal');
create type public.order_type as enum ('delivery', 'pickup', 'dine_in', 'counter');
create type public.order_status as enum (
  'new', 'awaiting_confirmation', 'confirmed', 'preparing', 'ready',
  'out_for_delivery', 'delivered', 'cancelled'
);
create type public.order_source as enum ('online', 'table', 'pdv', 'admin');
create type public.payment_method as enum ('pix', 'cash', 'card', 'card_online');
create type public.payment_status as enum ('pending', 'paid', 'refunded');
create type public.driver_status as enum ('available', 'on_delivery', 'offline');
create type public.table_status as enum ('free', 'occupied', 'awaiting_payment');
create type public.coupon_type as enum ('percent', 'fixed', 'free_delivery', 'free_product');
create type public.inventory_movement_type as enum ('in', 'out', 'adjust', 'loss', 'sale', 'sale_reversal');
create type public.cash_movement_type as enum ('sale', 'withdrawal', 'supply', 'refund');
create type public.expense_recurrence as enum ('none', 'weekly', 'monthly');
create type public.financial_entry_type as enum ('income', 'refund', 'expense');

-- ---------- Utilitários ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.only_digits(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

-- ---------- Planos ---------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,30}$'),
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  -- limites: null = ilimitado
  limits jsonb not null default '{"max_members": null, "max_products": null, "max_orders_month": null}'::jsonb,
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated before update on public.plans for each row execute function public.set_updated_at();

-- ---------- Organizações --------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  legal_name text,
  cnpj text,
  email text,
  phone text,
  whatsapp text,
  instagram text,
  description text check (char_length(description) <= 500),
  address_zip text,
  address_street text,
  address_number text,
  address_district text,
  address_complement text,
  address_city text,
  address_state text,
  logo_url text,
  banner_url text,
  primary_color text not null default '#D9481C' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#1C1712' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  custom_domain text unique,
  status public.org_status not null default 'active',
  timezone text not null default 'America/Bahia',
  -- loja
  store_mode public.store_mode not null default 'auto',
  closed_message text not null default 'Estamos fechados no momento.',
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  accepts_dine_in boolean not null default true,
  allow_scheduling boolean not null default false,
  auto_confirm_table_orders boolean not null default true,
  min_order_value numeric(12,2) not null default 0 check (min_order_value >= 0),
  pickup_eta_min int not null default 20 check (pickup_eta_min >= 0),
  pickup_eta_max int not null default 30 check (pickup_eta_max >= 0),
  -- pagamento
  accepts_pix boolean not null default true,
  accepts_cash boolean not null default true,
  accepts_card boolean not null default true,
  pix_key text,
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random')),
  pix_holder_name text,
  pix_city text,
  -- CRM
  vip_min_orders int not null default 10 check (vip_min_orders > 0),
  vip_min_spent numeric(12,2) not null default 500 check (vip_min_spent >= 0),
  inactive_days int not null default 45 check (inactive_days > 0),
  -- controle
  order_seq int not null default 1000,
  onboarding_step int not null default 0,
  onboarding_completed_at timestamptz,
  last_activity_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup_eta_max >= pickup_eta_min)
);
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();
create index organizations_custom_domain_idx on public.organizations (lower(custom_domain)) where custom_domain is not null;

-- ---------- Perfis ---------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  is_platform_admin boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create index profiles_email_idx on public.profiles (lower(email));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- RBAC -----------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  label text not null,
  sort int not null default 0
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,30}$'),
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create trigger roles_updated before update on public.roles for each row execute function public.set_updated_at();

create table public.role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
create index role_permissions_org_idx on public.role_permissions (organization_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  display_name text,
  phone text,
  is_active boolean not null default true,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create trigger organization_members_updated before update on public.organization_members for each row execute function public.set_updated_at();
create index organization_members_user_idx on public.organization_members (user_id) where is_active;

-- ---------- Assinaturas ---------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null default 'trialing',
  price numeric(12,2) not null check (price >= 0),
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  cancelled_at timestamptz,
  -- preparado para gateway (asaas, mercadopago, stripe...)
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at timestamptz,
  method text,
  provider_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_payments_updated before update on public.subscription_payments for each row execute function public.set_updated_at();
create index subscription_payments_org_idx on public.subscription_payments (organization_id, due_date desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Horários -------------------------------------------------
create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at time not null,
  closes_at time not null, -- se <= opens_at, cruza a meia-noite
  created_at timestamptz not null default now(),
  check (opens_at <> closes_at)
);
create index opening_hours_org_idx on public.opening_hours (organization_id, weekday);

create table public.opening_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, date),
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at <> closes_at))
);

-- ---------- Helpers de autorização ----------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
  ) or public.is_platform_admin()
$$;

create or replace function public.has_permission(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.organization_members m
    join public.roles r on r.id = m.role_id
    left join public.role_permissions rp on rp.role_id = r.id and rp.permission_key = p_perm
    where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
      and (r.key = 'owner' or rp.permission_key is not null)
  ) or public.is_platform_admin()
$$;

create or replace function public.my_permissions(p_org uuid)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_platform_admin() or exists (
      select 1 from public.organization_members m join public.roles r on r.id = m.role_id
      where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active and r.key = 'owner')
    then (select array_agg(key order by key) from public.permissions)
    else coalesce((
      select array_agg(rp.permission_key order by rp.permission_key)
      from public.organization_members m
      join public.role_permissions rp on rp.role_id = m.role_id
      where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active), '{}')
  end
$$;

-- Lança erro se o usuário atual não tiver a permissão
create or replace function public.require_permission(p_org uuid, p_perm text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not public.has_permission(p_org, p_perm) then
    raise exception 'Sem permissão (%)', p_perm using errcode = '42501';
  end if;
end $$;

-- Verdadeiro quando a chamada vem do backend com service_role ou de dentro de função privilegiada
create or replace function public.is_service_context()
returns boolean language sql stable as $$
  select current_user not in ('anon', 'authenticated') or coalesce(auth.role(), '') = 'service_role'
$$;

-- ---------- Catálogo de permissões ----------------------------------
insert into public.permissions (key, module, label, sort) values
  ('dashboard.view',   'Dashboard',     'Ver dashboard', 10),
  ('orders.view',      'Pedidos',       'Ver pedidos', 20),
  ('orders.manage',    'Pedidos',       'Gerenciar pedidos (confirmar, cancelar, status)', 21),
  ('orders.create',    'Pedidos',       'Lançar pedidos / vendas', 22),
  ('kitchen.view',     'Cozinha',       'Tela da cozinha (KDS)', 30),
  ('menu.view',        'Cardápio',      'Ver cardápio', 40),
  ('menu.manage',      'Cardápio',      'Editar produtos, categorias, combos e adicionais', 41),
  ('customers.view',   'Clientes',      'Ver clientes', 50),
  ('customers.manage', 'Clientes',      'Editar clientes e resgatar pontos', 51),
  ('loyalty.manage',   'Fidelidade',    'Configurar fidelidade', 60),
  ('coupons.manage',   'Cupons',        'Gerenciar cupons', 61),
  ('inventory.view',   'Estoque',       'Ver estoque', 70),
  ('inventory.manage', 'Estoque',       'Gerenciar estoque, ficha técnica e fornecedores', 71),
  ('delivery.manage',  'Delivery',      'Zonas de entrega e entregadores', 80),
  ('deliveries.own',   'Delivery',      'Tela do entregador', 81),
  ('tables.manage',    'Mesas',         'Gerenciar mesas e contas', 90),
  ('cash.operate',     'Caixa',         'Operar caixa / PDV', 100),
  ('finance.view',     'Financeiro',    'Ver financeiro', 110),
  ('finance.manage',   'Financeiro',    'Gerenciar despesas', 111),
  ('reports.view',     'Relatórios',    'Ver relatórios', 120),
  ('marketing.manage', 'Marketing',     'Campanhas e WhatsApp', 130),
  ('reviews.manage',   'Avaliações',    'Ver e responder avaliações', 140),
  ('staff.manage',     'Funcionários',  'Gerenciar funcionários e permissões', 150),
  ('settings.manage',  'Configurações', 'Configurações da empresa', 160),
  ('billing.view',     'Assinatura',    'Ver assinatura e faturas', 170);

-- Planos padrão
insert into public.plans (code, name, description, price, limits, features, sort) values
  ('STARTER', 'Starter', 'Para começar a vender online', 99,
   '{"max_members": 3, "max_products": 60, "max_orders_month": 1500}',
   array['cardapio_online','pedidos','cozinha','delivery','clientes','cupons'], 1),
  ('PRO', 'Pro', 'Operação completa da hamburgueria', 199,
   '{"max_members": 10, "max_products": 250, "max_orders_month": 6000}',
   array['cardapio_online','pedidos','cozinha','delivery','clientes','cupons','estoque','caixa','financeiro','fidelidade','mesas','relatorios'], 2),
  ('PREMIUM', 'Premium', 'Multi-equipe, marketing e domínio próprio', 299,
   '{"max_members": null, "max_products": null, "max_orders_month": null}',
   array['cardapio_online','pedidos','cozinha','delivery','clientes','cupons','estoque','caixa','financeiro','fidelidade','mesas','relatorios','marketing','dominio_proprio'], 3);
