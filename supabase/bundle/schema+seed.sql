-- TOP BURGER OS — schema completo (10 migrations). Gerado por scripts/bundle-sql.mjs
-- Execute UMA vez em um projeto Supabase novo (SQL Editor → New query → Run).

-- ====================================================================
-- migrations/0001_foundation.sql
-- ====================================================================
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


-- ====================================================================
-- migrations/0002_catalog.sql
-- ====================================================================
-- =====================================================================
-- TOP BURGER OS — 0002 CATÁLOGO E ESTOQUE
-- Categorias, produtos, fotos, variações/adicionais, combos,
-- fornecedores, ingredientes e ficha técnica
-- =====================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  sort int not null default 0,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create index categories_org_idx on public.categories (organization_id, sort) where deleted_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type public.product_type not null default 'simple',
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 600),
  ingredients_text text check (char_length(ingredients_text) <= 400),
  price numeric(12,2) not null check (price >= 0),
  promo_price numeric(12,2) check (promo_price >= 0),
  prep_minutes int check (prep_minutes between 0 and 240),
  is_active boolean not null default true,
  is_available boolean not null default true,
  unavailable_reason text check (unavailable_reason in ('manual', 'stock')),
  auto_disable_on_stockout boolean not null default true,
  is_featured boolean not null default false,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (promo_price is null or promo_price < price),
  check (is_available or unavailable_reason is not null)
);
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create index products_org_idx on public.products (organization_id, category_id, sort) where deleted_at is null;
create index products_name_idx on public.products (organization_id, lower(name));

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  kind public.modifier_kind not null default 'addon',
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  is_required boolean generated always as (min_select > 0) stored,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_select <= max_select)
);
create trigger modifier_groups_updated before update on public.modifier_groups for each row execute function public.set_updated_at();
create index modifier_groups_org_idx on public.modifier_groups (organization_id) where deleted_at is null;

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_delta numeric(12,2) not null default 0 check (price_delta >= 0),
  max_quantity int not null default 1 check (max_quantity between 1 and 20),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger modifiers_updated before update on public.modifiers for each row execute function public.set_updated_at();
create index modifiers_group_idx on public.modifiers (group_id, sort) where deleted_at is null;

create table public.product_modifier_groups (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  sort int not null default 0,
  primary key (product_id, group_id)
);
create index product_modifier_groups_group_idx on public.product_modifier_groups (group_id);

create table public.combo_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  combo_product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  min_qty int not null default 1 check (min_qty >= 0),
  max_qty int not null default 1 check (max_qty >= 1),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (min_qty <= max_qty)
);
create index combo_groups_combo_idx on public.combo_groups (combo_product_id, sort);

create table public.combo_group_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  combo_group_id uuid not null references public.combo_groups(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price_delta numeric(12,2) not null default 0 check (price_delta >= 0),
  sort int not null default 0,
  unique (combo_group_id, product_id)
);

-- Garante que vínculos não cruzem organizações
create or replace function public.check_same_org_links()
returns trigger language plpgsql as $$
declare v_other uuid;
begin
  if tg_table_name = 'product_modifier_groups' then
    if (select organization_id from public.products where id = new.product_id) <> new.organization_id
       or (select organization_id from public.modifier_groups where id = new.group_id) <> new.organization_id then
      raise exception 'Vínculo entre organizações diferentes não é permitido';
    end if;
  elsif tg_table_name = 'modifiers' then
    select organization_id into v_other from public.modifier_groups where id = new.group_id;
    if v_other <> new.organization_id then raise exception 'Vínculo entre organizações diferentes não é permitido'; end if;
  elsif tg_table_name = 'combo_groups' then
    if (select organization_id from public.products where id = new.combo_product_id and type = 'combo') is distinct from new.organization_id then
      raise exception 'Combo inválido';
    end if;
  elsif tg_table_name = 'combo_group_options' then
    if (select organization_id from public.combo_groups where id = new.combo_group_id) <> new.organization_id
       or (select organization_id from public.products where id = new.product_id) <> new.organization_id then
      raise exception 'Vínculo entre organizações diferentes não é permitido';
    end if;
    if (select type from public.products where id = new.product_id) = 'combo' then
      raise exception 'Um combo não pode conter outro combo';
    end if;
  elsif tg_table_name = 'products' then
    if new.category_id is not null and (select organization_id from public.categories where id = new.category_id) <> new.organization_id then
      raise exception 'Categoria de outra organização';
    end if;
  elsif tg_table_name = 'product_images' then
    if (select organization_id from public.products where id = new.product_id) <> new.organization_id then
      raise exception 'Vínculo entre organizações diferentes não é permitido';
    end if;
  end if;
  return new;
end $$;

create trigger products_same_org before insert or update of category_id, organization_id on public.products for each row execute function public.check_same_org_links();
create trigger product_images_same_org before insert or update on public.product_images for each row execute function public.check_same_org_links();
create trigger modifiers_same_org before insert or update of group_id, organization_id on public.modifiers for each row execute function public.check_same_org_links();
create trigger pmg_same_org before insert or update on public.product_modifier_groups for each row execute function public.check_same_org_links();
create trigger combo_groups_same_org before insert or update on public.combo_groups for each row execute function public.check_same_org_links();
create trigger combo_options_same_org before insert or update on public.combo_group_options for each row execute function public.check_same_org_links();

-- ---------- Fornecedores e estoque ----------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  cnpj text,
  phone text,
  whatsapp text,
  email text,
  products_text text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger suppliers_updated before update on public.suppliers for each row execute function public.set_updated_at();
create index suppliers_org_idx on public.suppliers (organization_id) where deleted_at is null;

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  unit text not null check (unit in ('un', 'g', 'kg', 'ml', 'l', 'fatia', 'porcao')),
  stock_qty numeric(14,3) not null default 0,
  min_qty numeric(14,3) not null default 0 check (min_qty >= 0),
  cost_per_unit numeric(14,4) not null default 0 check (cost_per_unit >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ingredients_updated before update on public.ingredients for each row execute function public.set_updated_at();
create index ingredients_org_idx on public.ingredients (organization_id) where deleted_at is null;

create table public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unique (product_id, ingredient_id)
);
create index product_recipes_ingredient_idx on public.product_recipes (ingredient_id);

-- quantidade negativa = remoção reduz consumo (ex.: "sem cebola" devolve 20 g de cebola)
create table public.modifier_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  modifier_id uuid not null references public.modifiers(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity <> 0),
  unique (modifier_id, ingredient_id)
);
create index modifier_recipes_ingredient_idx on public.modifier_recipes (ingredient_id);

create or replace function public.check_recipe_org()
returns trigger language plpgsql as $$
declare v_row jsonb := to_jsonb(new);
begin
  if (select organization_id from public.ingredients where id = new.ingredient_id) <> new.organization_id then
    raise exception 'Ingrediente de outra organização';
  end if;
  if tg_table_name = 'product_recipes' then
    if (select organization_id from public.products where id = (v_row->>'product_id')::uuid) <> new.organization_id then
      raise exception 'Produto de outra organização';
    end if;
  else
    if (select organization_id from public.modifiers where id = (v_row->>'modifier_id')::uuid) <> new.organization_id then
      raise exception 'Adicional de outra organização';
    end if;
  end if;
  return new;
end $$;
create trigger product_recipes_org before insert or update on public.product_recipes for each row execute function public.check_recipe_org();
create trigger modifier_recipes_org before insert or update on public.modifier_recipes for each row execute function public.check_recipe_org();

-- Custo pela ficha técnica (respeita RLS de quem consulta).
-- Combos: custo da própria ficha + média do custo das opções de cada etapa × quantidade mínima.
create view public.product_costs with (security_invoker = true) as
with base as (
  select p.id, coalesce(sum(r.quantity * i.cost_per_unit), 0) as recipe_cost, count(r.id) as recipe_items
  from public.products p
  left join public.product_recipes r on r.product_id = p.id
  left join public.ingredients i on i.id = r.ingredient_id
  group by p.id
), combo as (
  select cg.combo_product_id as id, sum(x.avg_cost * greatest(cg.min_qty, 1)) as combo_cost
  from public.combo_groups cg
  cross join lateral (
    select coalesce(avg(b.recipe_cost), 0) as avg_cost
    from public.combo_group_options o join base b on b.id = o.product_id
    where o.combo_group_id = cg.id
  ) x
  group by cg.combo_product_id
)
select p.id as product_id, p.organization_id, p.name, p.type, p.price, p.promo_price,
       coalesce(p.promo_price, p.price) as sale_price,
       round(b.recipe_cost + coalesce(c.combo_cost, 0), 2) as cost,
       round(coalesce(p.promo_price, p.price) - b.recipe_cost - coalesce(c.combo_cost, 0), 2) as margin,
       case when coalesce(p.promo_price, p.price) > 0
            then round(((coalesce(p.promo_price, p.price) - b.recipe_cost - coalesce(c.combo_cost, 0)) / coalesce(p.promo_price, p.price)) * 100, 1)
            else 0 end as margin_pct,
       b.recipe_items + case when c.id is not null then 1 else 0 end as recipe_items
from public.products p
join base b on b.id = p.id
left join combo c on c.id = p.id
where p.deleted_at is null;


-- ====================================================================
-- migrations/0003_operations.sql
-- ====================================================================
-- =====================================================================
-- TOP BURGER OS — 0003 OPERAÇÃO
-- Clientes, delivery, mesas, cupons, fidelidade, caixa, pedidos,
-- movimentações de estoque, financeiro, notificações, marketing, auditoria
-- =====================================================================

-- ---------- Clientes ------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text check (phone ~ '^[0-9]{10,13}$'),
  email text,
  birthday date,
  notes text,
  tags text[] not null default '{}',
  orders_count int not null default 0,
  total_spent numeric(12,2) not null default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_org_phone_uidx on public.customers (organization_id, phone) where phone is not null;
create index customers_org_idx on public.customers (organization_id, last_order_at desc nulls last) where deleted_at is null;
create index customers_name_idx on public.customers (organization_id, lower(name));
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  zip text,
  street text not null,
  number text not null,
  district text not null,
  complement text,
  reference text,
  city text,
  is_default boolean not null default false,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index customer_addresses_customer_idx on public.customer_addresses (customer_id);

-- Segmentação CRM (limiares por organização)
create view public.customer_segments with (security_invoker = true) as
select c.id as customer_id, c.organization_id,
  case
    when c.orders_count = 0 then 'new'
    when c.last_order_at < now() - make_interval(days => o.inactive_days) then 'inactive'
    when c.orders_count >= o.vip_min_orders or c.total_spent >= o.vip_min_spent then 'vip'
    when c.orders_count >= 2 then 'recurring'
    else 'new'
  end as segment,
  case when c.orders_count > 0 then round(c.total_spent / c.orders_count, 2) else 0 end as avg_ticket
from public.customers c
join public.organizations o on o.id = c.organization_id
where c.deleted_at is null;

-- ---------- Delivery -------------------------------------------------
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  zip_prefixes text[] not null default '{}',
  fee numeric(12,2) not null default 0 check (fee >= 0),
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  eta_min int not null default 35 check (eta_min >= 0),
  eta_max int not null default 50 check (eta_max >= 0),
  max_distance_km numeric(6,2), -- reservado para cálculo por distância
  is_active boolean not null default true,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (eta_max >= eta_min)
);
create trigger delivery_zones_updated before update on public.delivery_zones for each row execute function public.set_updated_at();
create index delivery_zones_org_idx on public.delivery_zones (organization_id, sort) where deleted_at is null;

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  phone text,
  vehicle text,
  plate text,
  status public.driver_status not null default 'offline',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create trigger drivers_updated before update on public.drivers for each row execute function public.set_updated_at();
create index drivers_org_idx on public.drivers (organization_id) where deleted_at is null;

-- ---------- Mesas ----------------------------------------------------
create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  seats int not null default 4 check (seats between 1 and 50),
  status public.table_status not null default 'free',
  qr_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  is_active boolean not null default true,
  sort int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, label)
);
create trigger dining_tables_updated before update on public.dining_tables for each row execute function public.set_updated_at();

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_id uuid not null references public.dining_tables(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  payment_method public.payment_method,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create unique index table_sessions_open_uidx on public.table_sessions (table_id) where closed_at is null;

-- ---------- Cupons ---------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text,
  type public.coupon_type not null,
  value numeric(12,2) not null default 0 check (value >= 0),
  product_id uuid references public.products(id) on delete set null, -- produto grátis
  product_ids uuid[] not null default '{}', -- produtos permitidos (vazio = todos)
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses > 0),
  uses_count int not null default 0 check (uses_count >= 0),
  max_uses_per_customer int check (max_uses_per_customer > 0),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'percent' or value between 1 and 100),
  check (type <> 'fixed' or value > 0),
  check (type <> 'free_product' or product_id is not null),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create unique index coupons_org_code_uidx on public.coupons (organization_id, code) where deleted_at is null;
create trigger coupons_updated before update on public.coupons for each row execute function public.set_updated_at();

-- ---------- Fidelidade ----------------------------------------------
create table public.loyalty_programs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  points_per_real numeric(8,2) not null default 1 check (points_per_real > 0),
  rules_text text,
  updated_at timestamptz not null default now()
);
create trigger loyalty_programs_updated before update on public.loyalty_programs for each row execute function public.set_updated_at();

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  points_cost int not null check (points_cost > 0),
  reward_type text not null default 'product' check (reward_type in ('product', 'discount')),
  product_id uuid references public.products(id) on delete set null,
  discount_value numeric(12,2) check (discount_value > 0),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger loyalty_rewards_updated before update on public.loyalty_rewards for each row execute function public.set_updated_at();

create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null unique references public.customers(id) on delete cascade,
  points_balance int not null default 0 check (points_balance >= 0),
  lifetime_points int not null default 0,
  updated_at timestamptz not null default now()
);
create index loyalty_accounts_org_idx on public.loyalty_accounts (organization_id);

-- ---------- Caixa ----------------------------------------------------
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_amount numeric(12,2) not null check (opening_amount >= 0),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  reported_amount numeric(12,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  summary jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create unique index cash_registers_one_open_uidx on public.cash_registers (organization_id) where status = 'open';
create index cash_registers_org_idx on public.cash_registers (organization_id, opened_at desc);

-- ---------- Pedidos --------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number int not null,
  public_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  type public.order_type not null,
  status public.order_status not null default 'new',
  source public.order_source not null default 'online',
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  address jsonb, -- snapshot {zip, street, number, district, complement, reference, city}
  delivery_zone_id uuid references public.delivery_zones(id) on delete set null,
  table_id uuid references public.dining_tables(id) on delete set null,
  table_session_id uuid references public.table_sessions(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  cash_register_id uuid references public.cash_registers(id) on delete set null,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  coupon_id uuid references public.coupons(id) on delete set null,
  coupon_code text,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  payment_provider text,  -- futuro: mercadopago, stripe, pagseguro
  payment_ref text,
  paid_at timestamptz,
  change_for numeric(12,2),
  notes text check (char_length(notes) <= 500),
  scheduled_for timestamptz,
  eta_min int,
  eta_max int,
  stock_deducted boolean not null default false,
  customer_stats_applied boolean not null default false,
  loyalty_points_earned int not null default 0,
  created_by uuid references auth.users(id),
  confirmed_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  check (change_for is null or (payment_method = 'cash' and change_for >= total)),
  check (status <> 'cancelled' or cancel_reason is not null),
  check (type <> 'delivery' or address is not null)
);
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
create index orders_org_status_idx on public.orders (organization_id, status, created_at desc);
create index orders_org_created_idx on public.orders (organization_id, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_driver_idx on public.orders (driver_id) where driver_id is not null;
create index orders_session_idx on public.orders (table_session_id) where table_session_id is not null;
create index orders_phone_idx on public.orders (organization_id, customer_phone, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_type public.product_type not null default 'simple',
  base_price numeric(12,2) not null check (base_price >= 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 99),
  total numeric(12,2) not null check (total >= 0),
  notes text check (char_length(notes) <= 200),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id, sort);
create index order_items_product_idx on public.order_items (organization_id, product_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  kind text not null check (kind in ('modifier', 'combo_choice')),
  group_name text not null,
  group_kind public.modifier_kind,
  modifier_id uuid references public.modifiers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  unit_price numeric(12,2) not null default 0,
  quantity int not null default 1 check (quantity >= 1),
  sort int not null default 0
);
create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id, sort);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_phone text,
  discount numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, customer_phone);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.loyalty_accounts(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  kind text not null check (kind in ('earn', 'redeem', 'reverse', 'adjust')),
  points int not null check (points <> 0),
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index loyalty_transactions_customer_idx on public.loyalty_transactions (customer_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 600),
  reply text,
  replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_org_idx on public.reviews (organization_id, created_at desc);

-- ---------- Estoque (movimentações) ---------------------------------
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  type public.inventory_movement_type not null,
  quantity numeric(14,3) not null check (quantity <> 0), -- com sinal
  unit_cost numeric(14,4),
  supplier_id uuid references public.suppliers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (type not in ('in') or quantity > 0),
  check (type not in ('out', 'loss', 'sale') or quantity < 0),
  check (type <> 'sale_reversal' or quantity > 0)
);
create index inventory_movements_ingredient_idx on public.inventory_movements (ingredient_id, created_at desc);
create index inventory_movements_org_idx on public.inventory_movements (organization_id, created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id) where order_id is not null;

-- ---------- Caixa (movimentos) --------------------------------------
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  type public.cash_movement_type not null,
  payment_method public.payment_method not null default 'cash',
  amount numeric(12,2) not null check (amount > 0),
  order_id uuid references public.orders(id) on delete set null,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (type <> 'withdrawal' or (reason is not null and char_length(trim(reason)) >= 3))
);
create index cash_movements_register_idx on public.cash_movements (cash_register_id, created_at);

-- ---------- Financeiro ----------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('aluguel', 'energia', 'agua', 'funcionarios', 'fornecedores', 'marketing', 'impostos', 'manutencao', 'outras')),
  description text not null check (char_length(description) between 2 and 120),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  recurrence public.expense_recurrence not null default 'none',
  recurrence_parent_id uuid references public.expenses(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or paid_at is not null)
);
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();
create index expenses_org_idx on public.expenses (organization_id, due_date desc) where deleted_at is null;

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.financial_entry_type not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method,
  order_id uuid references public.orders(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index financial_entries_org_idx on public.financial_entries (organization_id, occurred_at desc);
create unique index financial_entries_order_income_uidx on public.financial_entries (order_id) where type = 'income';
create unique index financial_entries_order_refund_uidx on public.financial_entries (order_id) where type = 'refund';

-- ---------- Notificações --------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, -- null = todos os membros
  type text not null check (type in ('new_order', 'low_stock', 'subscription', 'review', 'system')),
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now()
);
create index notifications_org_idx on public.notifications (organization_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------- Marketing / WhatsApp ------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  segment text not null check (segment in ('all', 'new', 'recurring', 'vip', 'inactive', 'tag')),
  tag text,
  message text not null check (char_length(message) between 5 and 1000),
  status text not null default 'draft' check (status in ('draft', 'sending', 'done')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (segment <> 'tag' or tag is not null)
);
create trigger campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  phone text not null,
  name text not null,
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  unique (campaign_id, customer_id)
);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{3,40}$'),
  name text not null,
  body text not null check (char_length(body) between 5 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create trigger whatsapp_templates_updated before update on public.whatsapp_templates for each row execute function public.set_updated_at();

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  template_key text,
  phone text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index whatsapp_messages_org_idx on public.whatsapp_messages (organization_id, created_at desc);

-- ---------- Auditoria -----------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);


-- ====================================================================
-- migrations/0004_logic.sql
-- ====================================================================
-- =====================================================================
-- TOP BURGER OS — 0004 REGRAS DE NEGÓCIO
-- Horários, limites de plano, motor de preço, checkout transacional,
-- ciclo de vida do pedido, estoque, financeiro, CRM, fidelidade, caixa
-- =====================================================================

-- Autor padrão das linhas criadas pelo usuário logado
alter table public.orders alter column created_by set default auth.uid();
alter table public.inventory_movements alter column created_by set default auth.uid();
alter table public.cash_movements alter column created_by set default auth.uid();
alter table public.expenses alter column created_by set default auth.uid();
alter table public.loyalty_transactions alter column created_by set default auth.uid();
alter table public.campaigns alter column created_by set default auth.uid();
alter table public.whatsapp_messages alter column created_by set default auth.uid();
alter table public.cash_registers alter column opened_by set default auth.uid();

create or replace function public.fmt_brl(p numeric)
returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(coalesce(p, 0), 'FM9999999990.00'), '.', ',')
$$;

-- =====================================================================
-- HORÁRIOS
-- =====================================================================
create or replace function public._shifts_for_date(p_org uuid, p_date date)
returns table (opens_at time, closes_at time)
language sql stable set search_path = public, pg_temp as $$
  select e.opens_at, e.closes_at
  from public.opening_exceptions e
  where e.organization_id = p_org and e.date = p_date and not e.is_closed
  union all
  select h.opens_at, h.closes_at
  from public.opening_hours h
  where h.organization_id = p_org
    and h.weekday = extract(dow from p_date)::int
    and not exists (select 1 from public.opening_exceptions e2 where e2.organization_id = p_org and e2.date = p_date)
$$;

-- Intervalos de funcionamento (timestamptz) a partir de uma data local
create or replace function public._open_intervals(p_org uuid, p_from date, p_days int)
returns table (starts timestamptz, ends timestamptz)
language sql stable set search_path = public, pg_temp as $$
  select ((d::date + s.opens_at)::timestamp at time zone o.timezone) as starts,
         ((case when s.closes_at <= s.opens_at then d::date + 1 else d::date end + s.closes_at)::timestamp at time zone o.timezone) as ends
  from public.organizations o
  cross join generate_series(p_from::timestamp, (p_from + p_days)::timestamp, interval '1 day') d
  cross join lateral public._shifts_for_date(p_org, d::date) s
  where o.id = p_org
$$;

create or replace function public.is_open_at(p_org uuid, p_at timestamptz)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.organizations o
    cross join lateral public._open_intervals(p_org, ((p_at at time zone o.timezone)::date - 1), 1) i
    where o.id = p_org and p_at >= i.starts and p_at < i.ends
  )
$$;

create or replace function public.store_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_open boolean;
  v_next timestamptz;
  v_closes timestamptz;
  v_today date;
begin
  select * into v_org from public.organizations where id = p_org;
  if not found then return null; end if;
  v_today := (now() at time zone v_org.timezone)::date;

  select min(starts) into v_next from public._open_intervals(p_org, v_today, 8) where starts > now();
  select max(ends) into v_closes from public._open_intervals(p_org, v_today - 1, 1) where now() >= starts and now() < ends;

  if v_org.status <> 'active' or v_org.deleted_at is not null then
    return jsonb_build_object('is_open', false, 'mode', v_org.store_mode, 'message', 'Esta loja não está recebendo pedidos.', 'next_open_at', null, 'closes_at', null);
  end if;

  v_open := case v_org.store_mode
    when 'open' then true
    when 'closed' then false
    else public.is_open_at(p_org, now())
  end;

  return jsonb_build_object(
    'is_open', v_open,
    'mode', v_org.store_mode,
    'message', case when v_open then null else v_org.closed_message end,
    'next_open_at', case when v_open then null else v_next end,
    'closes_at', case when v_open and v_org.store_mode = 'auto' then v_closes else null end
  );
end $$;

-- =====================================================================
-- LIMITES DE PLANO
-- =====================================================================
create or replace function public.plan_limit(p_org uuid, p_key text)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(p.limits->>p_key, '')::int
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.organization_id = p_org
$$;

create or replace function public.org_features(p_org uuid)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p.features from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = p_org), '{}')
$$;

create or replace function public.enforce_plan_limits()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit int; v_count int;
begin
  if tg_table_name = 'products' then
    if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then return new; end if;
    v_limit := public.plan_limit(new.organization_id, 'max_products');
    if v_limit is not null then
      select count(*) into v_count from public.products where organization_id = new.organization_id and deleted_at is null and id <> new.id;
      if v_count >= v_limit then
        raise exception 'Limite de % produtos do seu plano atingido. Faça upgrade para cadastrar mais.', v_limit;
      end if;
    end if;
  elsif tg_table_name = 'organization_members' then
    if not new.is_active then return new; end if;
    if tg_op = 'UPDATE' and old.is_active then return new; end if;
    v_limit := public.plan_limit(new.organization_id, 'max_members');
    if v_limit is not null then
      select count(*) into v_count from public.organization_members where organization_id = new.organization_id and is_active and id <> new.id;
      if v_count >= v_limit then
        raise exception 'Limite de % usuários do seu plano atingido. Faça upgrade para adicionar mais.', v_limit;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger products_plan_limit before insert or update of deleted_at on public.products for each row execute function public.enforce_plan_limits();
create trigger members_plan_limit before insert or update of is_active on public.organization_members for each row execute function public.enforce_plan_limits();

-- =====================================================================
-- PROTEÇÃO DE CAMPOS SENSÍVEIS
-- =====================================================================
create or replace function public.guard_organizations()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_platform_admin() then
    if new.status is distinct from old.status
       or new.order_seq is distinct from old.order_seq
       or new.deleted_at is distinct from old.deleted_at
       or new.custom_domain is distinct from old.custom_domain
       or new.slug is distinct from old.slug then
      raise exception 'Somente a administração da plataforma pode alterar este campo' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger organizations_guard before update on public.organizations for each row execute function public.guard_organizations();

create or replace function public.guard_profiles()
returns trigger language plpgsql as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and current_user in ('anon', 'authenticated') and not public.is_platform_admin() then
    raise exception 'Operação não permitida' using errcode = '42501';
  end if;
  if new.email is distinct from old.email and current_user in ('anon', 'authenticated') then
    new.email := old.email;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profiles();

-- =====================================================================
-- CUPOM
-- =====================================================================
create or replace function public._apply_coupon(
  p_org uuid, p_code text, p_items jsonb, p_subtotal numeric, p_fee numeric, p_type public.order_type, p_phone text
) returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  c public.coupons;
  v_eligible numeric;
  v_discount numeric := 0;
  v_used int;
  v_item jsonb;
begin
  select * into c from public.coupons
  where organization_id = p_org and code = upper(trim(p_code)) and deleted_at is null;
  if not found or not c.is_active then raise exception 'Cupom inválido'; end if;
  if c.starts_at is not null and c.starts_at > now() then raise exception 'Este cupom ainda não está válido'; end if;
  if c.ends_at is not null and c.ends_at < now() then raise exception 'Cupom expirado'; end if;
  if c.max_uses is not null and c.uses_count >= c.max_uses then raise exception 'Cupom esgotado'; end if;
  if p_subtotal < c.min_order then
    raise exception 'Cupom válido para pedidos a partir de %', public.fmt_brl(c.min_order);
  end if;
  if c.first_order_only then
    if p_phone is null then raise exception 'Informe seu telefone para usar este cupom'; end if;
    if exists (select 1 from public.orders where organization_id = p_org and customer_phone = p_phone and status <> 'cancelled') then
      raise exception 'Cupom válido apenas para a primeira compra';
    end if;
  end if;
  if c.max_uses_per_customer is not null then
    if p_phone is null then raise exception 'Informe seu telefone para usar este cupom'; end if;
    select count(*) into v_used from public.coupon_redemptions where coupon_id = c.id and customer_phone = p_phone;
    if v_used >= c.max_uses_per_customer then raise exception 'Você já utilizou este cupom'; end if;
  end if;

  if cardinality(c.product_ids) = 0 then
    v_eligible := p_subtotal;
  else
    select coalesce(sum((x->>'total')::numeric), 0) into v_eligible
    from jsonb_array_elements(p_items) x
    where (x->>'product_id')::uuid = any (c.product_ids);
    if v_eligible = 0 then raise exception 'Cupom não se aplica aos produtos do carrinho'; end if;
  end if;

  case c.type
    when 'percent' then v_discount := round(v_eligible * c.value / 100, 2);
    when 'fixed' then v_discount := least(c.value, v_eligible);
    when 'free_delivery' then
      if p_type <> 'delivery' then raise exception 'Cupom de frete grátis vale apenas para entrega'; end if;
      v_discount := p_fee;
    when 'free_product' then
      select x into v_item from jsonb_array_elements(p_items) x
      where (x->>'product_id')::uuid = c.product_id order by (x->>'base_price')::numeric desc limit 1;
      if v_item is null then
        raise exception 'Adicione "%" ao carrinho para usar este cupom', (select name from public.products where id = c.product_id);
      end if;
      v_discount := (v_item->>'base_price')::numeric;
  end case;

  return jsonb_build_object('id', c.id, 'code', c.code, 'type', c.type, 'value', c.value,
                            'description', c.description, 'discount', v_discount);
end $$;

-- =====================================================================
-- MOTOR DE PREÇO — recalcula TUDO a partir do banco
-- payload: { type, items:[{product_id, quantity, notes, options:[{modifier_id, quantity}],
--            combo:[{combo_group_id, product_id}]}], zone_id, address:{zip,...},
--            coupon_code, customer:{name, phone} }
-- =====================================================================
create or replace function public._price_cart(p_org uuid, p_payload jsonb, p_strict boolean default true)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_type public.order_type := coalesce(nullif(p_payload->>'type', ''), 'delivery')::public.order_type;
  v_item jsonb;
  v_prod public.products;
  v_qty int;
  v_base numeric;
  v_unit numeric;
  v_items jsonb := '[]'::jsonb;
  v_opts jsonb;
  v_opt record;
  v_m record;
  v_c record;
  v_group record;
  v_cnt int;
  v_subtotal numeric := 0;
  v_fee numeric := 0;
  v_min numeric := 0;
  v_zone public.delivery_zones;
  v_zone_json jsonb;
  v_discount numeric := 0;
  v_coupon jsonb;
  v_coupon_error text;
  v_phone text := public.only_digits(p_payload #>> '{customer,phone}');
  v_zip text := public.only_digits(p_payload #>> '{address,zip}');
  v_eta_min int;
  v_eta_max int;
  v_max_prep int := 0;
  v_sort int := 0;
begin
  select * into v_org from public.organizations where id = p_org and deleted_at is null;
  if not found then raise exception 'Loja não encontrada'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'Seu carrinho está vazio';
  end if;
  if jsonb_array_length(p_payload->'items') > 60 then raise exception 'Carrinho com itens demais'; end if;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_sort := v_sort + 1;
    v_qty := coalesce(nullif(v_item->>'quantity', '')::int, 1);
    if v_qty < 1 or v_qty > 99 then raise exception 'Quantidade inválida'; end if;

    select * into v_prod from public.products
    where id = nullif(v_item->>'product_id', '')::uuid and organization_id = p_org and deleted_at is null;
    if not found or not v_prod.is_active then
      raise exception 'Um produto do carrinho não está mais disponível. Revise seu carrinho.';
    end if;
    if not v_prod.is_available then raise exception '"%" está esgotado no momento', v_prod.name; end if;

    v_base := coalesce(v_prod.promo_price, v_prod.price);
    v_unit := v_base;
    v_opts := '[]'::jsonb;
    v_max_prep := greatest(v_max_prep, coalesce(v_prod.prep_minutes, 0));

    -- variações / adicionais / remoções
    for v_opt in
      select nullif(o->>'modifier_id', '')::uuid as mid,
             sum(coalesce(nullif(o->>'quantity', '')::int, 1))::int as qty
      from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb)) o
      group by 1
    loop
      select m.id, m.name, m.price_delta, m.max_quantity, m.sort as msort,
             g.id as group_id, g.name as group_name, g.kind as group_kind, pmg.sort as gsort
        into v_m
      from public.modifiers m
      join public.modifier_groups g on g.id = m.group_id and g.deleted_at is null
      join public.product_modifier_groups pmg on pmg.group_id = g.id and pmg.product_id = v_prod.id
      where m.id = v_opt.mid and m.organization_id = p_org and m.deleted_at is null and m.is_active;
      if not found then
        raise exception 'Uma opção de "%" não está mais disponível. Edite o item.', v_prod.name;
      end if;
      if v_opt.qty < 1 or v_opt.qty > v_m.max_quantity then
        raise exception 'Quantidade inválida para "%" (máximo %)', v_m.name, v_m.max_quantity;
      end if;
      v_unit := v_unit + v_m.price_delta * v_opt.qty;
      v_opts := v_opts || jsonb_build_object(
        'kind', 'modifier', 'modifier_id', v_m.id, 'group_id', v_m.group_id, 'group_name', v_m.group_name,
        'group_kind', v_m.group_kind, 'name', v_m.name, 'unit_price', v_m.price_delta, 'quantity', v_opt.qty,
        'sort', v_m.gsort * 1000 + v_m.msort);
    end loop;

    for v_group in
      select g.id, g.name, g.min_select, g.max_select
      from public.product_modifier_groups pmg
      join public.modifier_groups g on g.id = pmg.group_id and g.deleted_at is null
      where pmg.product_id = v_prod.id
    loop
      select coalesce(sum((x->>'quantity')::int), 0) into v_cnt
      from jsonb_array_elements(v_opts) x where (x->>'group_id')::uuid = v_group.id;
      if v_cnt < v_group.min_select then
        raise exception '"%": selecione % em "%"', v_prod.name,
          case when v_group.min_select = 1 then '1 opção' else v_group.min_select || ' opções' end, v_group.name;
      end if;
      if v_cnt > v_group.max_select then
        raise exception '"%": máximo de % em "%"', v_prod.name, v_group.max_select, v_group.name;
      end if;
    end loop;

    -- combos
    if v_prod.type = 'combo' then
      for v_opt in
        select nullif(c->>'combo_group_id', '')::uuid as gid, nullif(c->>'product_id', '')::uuid as pid
        from jsonb_array_elements(coalesce(v_item->'combo', '[]'::jsonb)) c
      loop
        select cg.id, cg.name as gname, cg.sort as gsort, cgo.price_delta, p.id as pid, p.name as pname,
               p.is_active, p.is_available, p.deleted_at
          into v_c
        from public.combo_groups cg
        join public.combo_group_options cgo on cgo.combo_group_id = cg.id
        join public.products p on p.id = cgo.product_id
        where cg.id = v_opt.gid and cg.combo_product_id = v_prod.id and cgo.product_id = v_opt.pid;
        if not found then raise exception 'Escolha inválida no combo "%"', v_prod.name; end if;
        if not v_c.is_active or v_c.deleted_at is not null or not v_c.is_available then
          raise exception '"%" está indisponível. Escolha outra opção em "%"', v_c.pname, v_c.gname;
        end if;
        v_unit := v_unit + v_c.price_delta;
        v_opts := v_opts || jsonb_build_object(
          'kind', 'combo_choice', 'group_id', v_c.id, 'group_name', v_c.gname, 'product_id', v_c.pid,
          'name', v_c.pname, 'unit_price', v_c.price_delta, 'quantity', 1, 'sort', v_c.gsort);
      end loop;

      for v_group in select id, name, min_qty, max_qty from public.combo_groups where combo_product_id = v_prod.id loop
        select count(*) into v_cnt from jsonb_array_elements(v_opts) x
        where x->>'kind' = 'combo_choice' and (x->>'group_id')::uuid = v_group.id;
        if v_cnt < v_group.min_qty then raise exception 'Combo "%": escolha em "%"', v_prod.name, v_group.name; end if;
        if v_cnt > v_group.max_qty then raise exception 'Combo "%": máximo de % em "%"', v_prod.name, v_group.max_qty, v_group.name; end if;
      end loop;
    elsif jsonb_array_length(coalesce(v_item->'combo', '[]'::jsonb)) > 0 then
      raise exception 'Escolhas de combo enviadas para um produto que não é combo';
    end if;

    v_items := v_items || jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'product_type', v_prod.type,
      'base_price', v_base, 'unit_price', v_unit, 'quantity', v_qty, 'total', v_unit * v_qty,
      'notes', nullif(left(trim(coalesce(v_item->>'notes', '')), 200), ''),
      'options', (select coalesce(jsonb_agg(x order by (x->>'sort')::int), '[]'::jsonb) from jsonb_array_elements(v_opts) x),
      'sort', v_sort, 'key', v_item->>'key');
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;

  -- entrega / prazos
  if v_type = 'delivery' then
    if nullif(p_payload->>'zone_id', '') is null then
      if p_strict then raise exception 'Selecione o bairro de entrega'; end if;
    else
      select * into v_zone from public.delivery_zones
      where id = (p_payload->>'zone_id')::uuid and organization_id = p_org and deleted_at is null and is_active;
      if not found then raise exception 'Região de entrega inválida'; end if;
      if v_zip is not null and cardinality(v_zone.zip_prefixes) > 0 and not exists (
        select 1 from unnest(v_zone.zip_prefixes) z where v_zip like public.only_digits(z) || '%'
      ) then
        raise exception 'Este CEP não é atendido pela região "%"', v_zone.name;
      end if;
      v_fee := v_zone.fee;
      v_min := greatest(v_org.min_order_value, v_zone.min_order);
      v_eta_min := v_zone.eta_min;
      v_eta_max := v_zone.eta_max;
      v_zone_json := jsonb_build_object('id', v_zone.id, 'name', v_zone.name, 'fee', v_zone.fee,
                                        'min_order', v_zone.min_order, 'eta_min', v_zone.eta_min, 'eta_max', v_zone.eta_max);
    end if;
  elsif v_type = 'pickup' then
    v_eta_min := v_org.pickup_eta_min;
    v_eta_max := v_org.pickup_eta_max;
  else
    v_eta_min := greatest(10, v_max_prep);
    v_eta_max := greatest(20, v_max_prep + 10);
  end if;

  -- cupom
  if nullif(trim(coalesce(p_payload->>'coupon_code', '')), '') is not null then
    begin
      v_coupon := public._apply_coupon(p_org, p_payload->>'coupon_code', v_items, v_subtotal, v_fee, v_type, v_phone);
      v_discount := (v_coupon->>'discount')::numeric;
    exception when raise_exception then
      if p_strict then raise; end if;
      v_coupon_error := sqlerrm;
      v_coupon := null;
      v_discount := 0;
    end;
  end if;

  v_discount := least(v_discount, v_subtotal + v_fee);

  if p_strict and v_subtotal < v_min then
    raise exception 'O pedido mínimo para entrega é de %', public.fmt_brl(v_min);
  end if;

  return jsonb_build_object(
    'items', v_items,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_fee,
    'total', v_subtotal - v_discount + v_fee,
    'coupon', v_coupon,
    'coupon_error', v_coupon_error,
    'zone', v_zone_json,
    'min_order', v_min,
    'below_minimum', v_subtotal < v_min,
    'eta_min', v_eta_min,
    'eta_max', v_eta_max
  );
end $$;

-- =====================================================================
-- CRIAÇÃO TRANSACIONAL DO PEDIDO (uso interno)
-- =====================================================================
create or replace function public._create_order(
  p_org uuid,
  p_payload jsonb,
  p_source public.order_source,
  p_target public.order_status,
  p_paid boolean
) returns public.orders language plpgsql set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_type public.order_type := coalesce(nullif(p_payload->>'type', ''), 'delivery')::public.order_type;
  v_is_public boolean := p_source in ('online', 'table');
  v_sched timestamptz := nullif(p_payload->>'scheduled_for', '')::timestamptz;
  v_status jsonb;
  v_limit int;
  v_count int;
  v_name text := nullif(trim(coalesce(p_payload #>> '{customer,name}', '')), '');
  v_phone text := public.only_digits(p_payload #>> '{customer,phone}');
  v_table public.dining_tables;
  v_session uuid;
  v_q jsonb;
  v_method public.payment_method;
  v_change numeric := nullif(p_payload->>'change_for', '')::numeric;
  v_addr jsonb;
  v_customer uuid;
  v_number int;
  v_order public.orders;
  v_item jsonb;
  v_opt jsonb;
  v_item_id uuid;
  v_discount numeric;
  v_manual numeric := greatest(coalesce(nullif(p_payload->>'manual_discount', '')::numeric, 0), 0);
  v_register uuid;
begin
  select * into v_org from public.organizations where id = p_org and deleted_at is null for update;
  if not found then raise exception 'Loja não encontrada'; end if;
  if v_org.status <> 'active' then raise exception 'Esta loja não está recebendo pedidos'; end if;

  if v_is_public then
    if v_type = 'counter' then raise exception 'Tipo de pedido inválido'; end if;
    if v_type = 'delivery' and not v_org.accepts_delivery then raise exception 'Esta loja não está fazendo entregas'; end if;
    if v_type = 'pickup' and not v_org.accepts_pickup then raise exception 'Esta loja não aceita retirada'; end if;
    if v_type = 'dine_in' and not v_org.accepts_dine_in then raise exception 'Esta loja não aceita pedidos para consumo no local'; end if;

    v_status := public.store_status(p_org);
    if v_sched is null then
      if not (v_status->>'is_open')::boolean then
        raise exception '%', coalesce(v_org.closed_message, 'Estamos fechados no momento.');
      end if;
    else
      if not v_org.allow_scheduling then raise exception 'Esta loja não aceita pedidos agendados'; end if;
      if v_org.store_mode = 'closed' then raise exception '%', v_org.closed_message; end if;
      if v_sched < now() + interval '20 minutes' or v_sched > now() + interval '3 days' then
        raise exception 'Horário de agendamento inválido';
      end if;
      if v_org.store_mode = 'auto' and not public.is_open_at(p_org, v_sched) then
        raise exception 'A loja estará fechada no horário escolhido';
      end if;
    end if;

    if v_name is null or char_length(v_name) < 2 then raise exception 'Informe seu nome'; end if;
    if p_source = 'online' and v_phone is null then raise exception 'Informe seu telefone com DDD'; end if;

    if v_phone is not null then
      select count(*) into v_count from public.orders
      where organization_id = p_org and customer_phone = v_phone and created_at > now() - interval '10 minutes';
      if v_count >= 5 then raise exception 'Muitos pedidos em sequência. Aguarde alguns minutos.'; end if;
    end if;
  end if;

  if v_phone is not null and (char_length(v_phone) < 10 or char_length(v_phone) > 13) then
    raise exception 'Telefone inválido. Informe com DDD.';
  end if;

  v_limit := public.plan_limit(p_org, 'max_orders_month');
  if v_limit is not null then
    select count(*) into v_count from public.orders
    where organization_id = p_org
      and created_at >= date_trunc('month', now() at time zone v_org.timezone) at time zone v_org.timezone;
    if v_count >= v_limit then raise exception 'Limite mensal de pedidos do plano atingido'; end if;
  end if;

  -- mesa
  if v_type = 'dine_in' then
    if nullif(p_payload->>'table_token', '') is not null then
      select * into v_table from public.dining_tables
      where qr_token = p_payload->>'table_token' and organization_id = p_org and is_active and deleted_at is null;
      if not found then raise exception 'Mesa não encontrada'; end if;
    elsif nullif(p_payload->>'table_id', '') is not null and not v_is_public then
      select * into v_table from public.dining_tables
      where id = (p_payload->>'table_id')::uuid and organization_id = p_org and is_active and deleted_at is null;
      if not found then raise exception 'Mesa não encontrada'; end if;
    end if;
  end if;

  -- preço (servidor)
  v_q := public._price_cart(p_org, p_payload, true);

  -- pagamento
  v_method := nullif(p_payload->>'payment_method', '')::public.payment_method;
  if v_method is null then raise exception 'Escolha a forma de pagamento'; end if;
  if v_method = 'card_online' then raise exception 'Pagamento online ainda não está disponível'; end if;
  if v_is_public then
    if v_method = 'pix' and not v_org.accepts_pix then raise exception 'Esta loja não aceita Pix'; end if;
    if v_method = 'cash' and not v_org.accepts_cash then raise exception 'Esta loja não aceita dinheiro'; end if;
    if v_method = 'card' and not v_org.accepts_card then raise exception 'Esta loja não aceita cartão'; end if;
  end if;

  v_discount := (v_q->>'discount')::numeric;
  if v_manual > 0 and not v_is_public then
    v_discount := least(v_discount + v_manual, (v_q->>'subtotal')::numeric + (v_q->>'delivery_fee')::numeric);
  end if;

  if v_method <> 'cash' then v_change := null; end if;
  if v_change is not null and v_change < ((v_q->>'subtotal')::numeric - v_discount + (v_q->>'delivery_fee')::numeric) then
    raise exception 'O valor para troco deve ser maior ou igual ao total do pedido';
  end if;

  -- endereço
  if v_type = 'delivery' then
    v_addr := jsonb_build_object(
      'zip', public.only_digits(p_payload #>> '{address,zip}'),
      'street', nullif(trim(coalesce(p_payload #>> '{address,street}', '')), ''),
      'number', nullif(trim(coalesce(p_payload #>> '{address,number}', '')), ''),
      'district', nullif(trim(coalesce(p_payload #>> '{address,district}', '')), ''),
      'complement', nullif(trim(coalesce(p_payload #>> '{address,complement}', '')), ''),
      'reference', nullif(trim(coalesce(p_payload #>> '{address,reference}', '')), ''),
      'city', coalesce(nullif(trim(coalesce(p_payload #>> '{address,city}', '')), ''), v_org.address_city)
    );
    if v_addr->>'street' is null or v_addr->>'number' is null or v_addr->>'district' is null then
      raise exception 'Endereço incompleto: informe rua, número e bairro';
    end if;
  end if;

  -- cliente (CRM): identificado pelo telefone
  if v_phone is not null then
    insert into public.customers (organization_id, name, phone)
    values (p_org, coalesce(v_name, 'Cliente'), v_phone)
    on conflict (organization_id, phone) where phone is not null
    do update set name = coalesce(excluded.name, public.customers.name), deleted_at = null
    returning id into v_customer;
  elsif nullif(p_payload->>'customer_id', '') is not null and not v_is_public then
    select id into v_customer from public.customers
    where id = (p_payload->>'customer_id')::uuid and organization_id = p_org;
  end if;

  if v_type = 'delivery' and v_customer is not null then
    update public.customer_addresses set last_used_at = now()
    where customer_id = v_customer and lower(street) = lower(v_addr->>'street') and number = v_addr->>'number'
      and coalesce(zip, '') = coalesce(v_addr->>'zip', '');
    if not found then
      insert into public.customer_addresses (organization_id, customer_id, zip, street, number, district, complement, reference, city)
      values (p_org, v_customer, v_addr->>'zip', v_addr->>'street', v_addr->>'number', v_addr->>'district',
              v_addr->>'complement', v_addr->>'reference', v_addr->>'city');
    end if;
  end if;

  -- número sequencial por loja (linha da organização está bloqueada: sem colisão)
  update public.organizations set order_seq = order_seq + 1, last_activity_at = now()
  where id = p_org returning order_seq into v_number;

  -- conta da mesa
  if v_table.id is not null then
    select id into v_session from public.table_sessions where table_id = v_table.id and closed_at is null for update;
    if v_session is null then
      insert into public.table_sessions (organization_id, table_id) values (p_org, v_table.id) returning id into v_session;
    end if;
    update public.dining_tables set status = 'occupied' where id = v_table.id and status = 'free';
  end if;

  if p_source = 'pdv' then
    select id into v_register from public.cash_registers where organization_id = p_org and status = 'open';
  end if;

  insert into public.orders (
    organization_id, number, type, status, source, customer_id, customer_name, customer_phone, address,
    delivery_zone_id, table_id, table_session_id, cash_register_id, subtotal, discount, delivery_fee, total,
    coupon_id, coupon_code, payment_method, payment_status, change_for, notes, scheduled_for, eta_min, eta_max
  ) values (
    p_org, v_number, v_type, 'new', p_source, v_customer,
    coalesce(v_name, case when p_source = 'pdv' then 'Cliente balcão' else 'Cliente' end), v_phone, v_addr,
    nullif(v_q #>> '{zone,id}', '')::uuid, v_table.id, v_session, v_register,
    (v_q->>'subtotal')::numeric, v_discount, (v_q->>'delivery_fee')::numeric,
    (v_q->>'subtotal')::numeric - v_discount + (v_q->>'delivery_fee')::numeric,
    nullif(v_q #>> '{coupon,id}', '')::uuid, v_q #>> '{coupon,code}', v_method, 'pending', v_change,
    nullif(left(trim(coalesce(p_payload->>'notes', '')), 500), ''), v_sched,
    nullif(v_q->>'eta_min', '')::int, nullif(v_q->>'eta_max', '')::int
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(v_q->'items') loop
    insert into public.order_items (organization_id, order_id, product_id, product_name, product_type, base_price,
                                    unit_price, quantity, total, notes, sort)
    values (p_org, v_order.id, (v_item->>'product_id')::uuid, v_item->>'product_name',
            (v_item->>'product_type')::public.product_type, (v_item->>'base_price')::numeric,
            (v_item->>'unit_price')::numeric, (v_item->>'quantity')::int, (v_item->>'total')::numeric,
            v_item->>'notes', (v_item->>'sort')::int)
    returning id into v_item_id;

    for v_opt in select value from jsonb_array_elements(v_item->'options') loop
      insert into public.order_item_modifiers (organization_id, order_item_id, kind, group_name, group_kind,
                                               modifier_id, product_id, name, unit_price, quantity, sort)
      values (p_org, v_item_id, v_opt->>'kind', v_opt->>'group_name',
              nullif(v_opt->>'group_kind', '')::public.modifier_kind,
              nullif(v_opt->>'modifier_id', '')::uuid, nullif(v_opt->>'product_id', '')::uuid,
              v_opt->>'name', (v_opt->>'unit_price')::numeric, (v_opt->>'quantity')::int, (v_opt->>'sort')::int);
    end loop;
  end loop;

  -- cupom: incremento atômico protege contra corrida no último uso
  if v_order.coupon_id is not null then
    update public.coupons set uses_count = uses_count + 1
    where id = v_order.coupon_id and (max_uses is null or uses_count < max_uses);
    if not found then raise exception 'Cupom esgotado'; end if;
    insert into public.coupon_redemptions (organization_id, coupon_id, order_id, customer_id, customer_phone, discount)
    values (p_org, v_order.coupon_id, v_order.id, v_customer, v_phone, (v_q->>'discount')::numeric);
  end if;

  if v_is_public then
    insert into public.notifications (organization_id, type, title, body, link)
    values (p_org, 'new_order', 'Novo pedido #' || v_number,
            coalesce(v_name, 'Cliente') || ' · ' || public.fmt_brl(v_order.total) ||
            case v_type when 'delivery' then ' · Entrega' when 'pickup' then ' · Retirada' else ' · No local' end,
            '/app/pedidos/' || v_order.id);
  end if;

  -- avança status/pagamento depois dos itens gravados (estoque/financeiro dependem deles)
  if p_target <> 'new' or p_paid then
    perform set_config('app.status_note', case when p_source = 'pdv' then 'Venda no balcão' else 'Confirmado automaticamente' end, true);
    update public.orders
    set status = p_target,
        payment_status = case when p_paid then 'paid'::public.payment_status else payment_status end
    where id = v_order.id
    returning * into v_order;
    perform set_config('app.status_note', '', true);
  end if;

  return v_order;
end $$;

-- ---------- RPCs públicas de checkout ---------------------------------
create or replace function public.quote_order(p_slug text, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = lower(p_slug) and deleted_at is null and status = 'active';
  if v_org is null then raise exception 'Loja não encontrada'; end if;
  return public._price_cart(v_org, p_payload, false) || jsonb_build_object('store', public.store_status(v_org));
end $$;

create or replace function public.place_order(p_slug text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_is_table boolean := nullif(p_payload->>'table_token', '') is not null;
  v_order public.orders;
  v_payload jsonb := p_payload;
begin
  select * into v_org from public.organizations where slug = lower(p_slug) and deleted_at is null;
  if not found then raise exception 'Loja não encontrada'; end if;
  if v_is_table then
    v_payload := jsonb_set(v_payload, '{type}', '"dine_in"');
  end if;
  v_order := public._create_order(
    v_org.id, v_payload,
    case when v_is_table then 'table'::public.order_source else 'online'::public.order_source end,
    case when v_is_table and v_org.auto_confirm_table_orders then 'confirmed'::public.order_status else 'new'::public.order_status end,
    false);
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'token', v_order.public_token,
                            'status', v_order.status, 'total', v_order.total);
end $$;

-- PDV / lançamento pela equipe
create or replace function public.create_staff_order(p_org uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_source public.order_source := coalesce(nullif(p_payload->>'source', ''), 'pdv')::public.order_source;
  v_paid boolean;
  v_order public.orders;
begin
  perform public.require_permission(p_org, 'orders.create');
  if v_source not in ('pdv', 'admin') then raise exception 'Origem inválida'; end if;
  v_paid := coalesce(nullif(p_payload->>'paid', '')::boolean, v_source = 'pdv');
  if v_source = 'pdv' then
    perform public.require_permission(p_org, 'cash.operate');
    if not exists (select 1 from public.cash_registers where organization_id = p_org and status = 'open') then
      raise exception 'Abra o caixa antes de registrar vendas no balcão';
    end if;
  end if;
  v_order := public._create_order(p_org, p_payload, v_source, 'confirmed', v_paid);
  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'token', v_order.public_token,
                            'status', v_order.status, 'total', v_order.total);
end $$;

-- =====================================================================
-- ESTOQUE
-- =====================================================================
create or replace function public._refresh_product_availability(p_product uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare v_p public.products; v_short boolean;
begin
  select * into v_p from public.products where id = p_product;
  if not found or v_p.deleted_at is not null or not v_p.auto_disable_on_stockout then return; end if;
  select exists (
    select 1 from public.product_recipes r join public.ingredients i on i.id = r.ingredient_id
    where r.product_id = p_product and i.stock_qty < r.quantity
  ) into v_short;
  if v_short and v_p.is_available then
    update public.products set is_available = false, unavailable_reason = 'stock' where id = p_product;
  elsif not v_short and not v_p.is_available and v_p.unavailable_reason = 'stock' then
    update public.products set is_available = true, unavailable_reason = null where id = p_product;
  end if;
end $$;

create or replace function public.on_inventory_movement()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ing public.ingredients;
  v_new_qty numeric;
  v_new_cost numeric;
  v_base numeric;
  v_pid uuid;
begin
  select * into v_ing from public.ingredients where id = new.ingredient_id for update;
  if v_ing.organization_id <> new.organization_id then raise exception 'Ingrediente de outra organização'; end if;
  v_new_qty := v_ing.stock_qty + new.quantity;
  v_new_cost := v_ing.cost_per_unit;
  if new.type = 'in' and new.unit_cost is not null then
    v_base := greatest(v_ing.stock_qty, 0);
    v_new_cost := round((v_base * v_ing.cost_per_unit + new.quantity * new.unit_cost) / (v_base + new.quantity), 4);
  end if;
  update public.ingredients set stock_qty = v_new_qty, cost_per_unit = v_new_cost where id = new.ingredient_id;

  for v_pid in select distinct product_id from public.product_recipes where ingredient_id = new.ingredient_id loop
    perform public._refresh_product_availability(v_pid);
  end loop;

  if new.quantity < 0 and v_ing.stock_qty >= v_ing.min_qty and v_new_qty < v_ing.min_qty and v_ing.min_qty > 0 then
    insert into public.notifications (organization_id, type, title, body, link)
    values (new.organization_id, 'low_stock',
            case when v_new_qty <= 0 then 'Sem estoque: ' else 'Estoque baixo: ' end || v_ing.name,
            'Saldo ' || trim(to_char(v_new_qty, 'FM9999990.###')) || ' ' || v_ing.unit || ' · mínimo ' ||
              trim(to_char(v_ing.min_qty, 'FM9999990.###')) || ' ' || v_ing.unit,
            '/app/estoque');
  end if;
  return new;
end $$;
create trigger inventory_movements_apply after insert on public.inventory_movements for each row execute function public.on_inventory_movement();

create or replace function public.on_recipe_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._refresh_product_availability(coalesce(new.product_id, old.product_id));
  return null;
end $$;
create trigger product_recipes_refresh after insert or update or delete on public.product_recipes for each row execute function public.on_recipe_change();

-- Baixa (p_sign = -1) ou estorno (p_sign = 1) do estoque pela ficha técnica
create or replace function public._apply_order_stock(p_order uuid, p_org uuid, p_number int, p_sign int)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_sign < 0 then
    insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost, order_id, notes)
    select p_org, n.ingredient_id, 'sale', -n.qty, i.cost_per_unit, p_order, 'Pedido #' || p_number
    from (
      select x.ingredient_id, sum(x.qty) as qty
      from (
        select r.ingredient_id, r.quantity * oi.quantity as qty
        from public.order_items oi
        join public.product_recipes r on r.product_id = oi.product_id
        where oi.order_id = p_order
        union all
        select r.ingredient_id, r.quantity * om.quantity * oi.quantity
        from public.order_items oi
        join public.order_item_modifiers om on om.order_item_id = oi.id and om.kind = 'modifier'
        join public.modifier_recipes r on r.modifier_id = om.modifier_id
        where oi.order_id = p_order
        union all
        select r.ingredient_id, r.quantity * om.quantity * oi.quantity
        from public.order_items oi
        join public.order_item_modifiers om on om.order_item_id = oi.id and om.kind = 'combo_choice'
        join public.product_recipes r on r.product_id = om.product_id
        where oi.order_id = p_order
      ) x
      group by x.ingredient_id
      having sum(x.qty) > 0
    ) n
    join public.ingredients i on i.id = n.ingredient_id;
  else
    insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost, order_id, notes)
    select p_org, m.ingredient_id, 'sale_reversal', -sum(m.quantity), max(m.unit_cost), p_order, 'Estorno pedido #' || p_number
    from public.inventory_movements m
    where m.order_id = p_order and m.type in ('sale', 'sale_reversal')
    group by m.ingredient_id
    having sum(m.quantity) < 0;
  end if;
end $$;

-- =====================================================================
-- FIDELIDADE
-- =====================================================================
create or replace function public._loyalty_add(
  p_org uuid, p_customer uuid, p_points int, p_kind text, p_order uuid, p_reward uuid, p_description text
) returns int language plpgsql set search_path = public, pg_temp as $$
declare v_acc public.loyalty_accounts;
begin
  if p_points = 0 then return 0; end if;
  insert into public.loyalty_accounts (organization_id, customer_id) values (p_org, p_customer)
  on conflict (customer_id) do nothing;
  select * into v_acc from public.loyalty_accounts where customer_id = p_customer for update;
  if v_acc.points_balance + p_points < 0 then
    if p_kind = 'reverse' then p_points := -v_acc.points_balance;
    else raise exception 'Pontos insuficientes (saldo: %)', v_acc.points_balance;
    end if;
  end if;
  if p_points = 0 then return 0; end if;
  update public.loyalty_accounts
  set points_balance = points_balance + p_points,
      lifetime_points = lifetime_points + greatest(p_points, 0) * (case when p_kind in ('earn', 'adjust') then 1 else 0 end),
      updated_at = now()
  where id = v_acc.id;
  insert into public.loyalty_transactions (organization_id, account_id, customer_id, order_id, reward_id, kind, points, description)
  values (p_org, v_acc.id, p_customer, p_order, p_reward, p_kind, p_points, p_description);
  return p_points;
end $$;

-- =====================================================================
-- CICLO DE VIDA DO PEDIDO
-- =====================================================================
create or replace function public._allowed_next(p_status public.order_status, p_type public.order_type)
returns public.order_status[] language sql immutable as $$
  select case p_status
    when 'new' then array['awaiting_confirmation', 'confirmed', 'preparing', 'cancelled']::public.order_status[]
    when 'awaiting_confirmation' then array['confirmed', 'preparing', 'cancelled']::public.order_status[]
    when 'confirmed' then array['preparing', 'ready', 'cancelled']::public.order_status[]
    when 'preparing' then array['ready', 'cancelled']::public.order_status[]
    when 'ready' then case when p_type = 'delivery'
                           then array['out_for_delivery', 'delivered', 'cancelled']::public.order_status[]
                           else array['delivered', 'cancelled']::public.order_status[] end
    when 'out_for_delivery' then array['delivered', 'cancelled']::public.order_status[]
    else array[]::public.order_status[]
  end
$$;

create or replace function public.orders_before_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_restock_setting text := nullif(current_setting('app.restock', true), '');
  v_restock boolean;
  v_program public.loyalty_programs;
  v_points int;
begin
  if new.organization_id <> old.organization_id or new.number <> old.number or new.public_token <> old.public_token then
    raise exception 'Campos imutáveis do pedido';
  end if;

  if new.status is distinct from old.status then
    if old.status in ('delivered', 'cancelled') then
      raise exception 'Pedido já finalizado não pode mudar de status';
    end if;
    if not (new.status = any (public._allowed_next(old.status, old.type))) then
      raise exception 'Transição de status inválida: % → %', old.status, new.status;
    end if;

    case new.status
      when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
      when 'preparing' then
        new.confirmed_at := coalesce(new.confirmed_at, now());
        new.preparing_at := coalesce(new.preparing_at, now());
      when 'ready' then new.ready_at := now();
      when 'out_for_delivery' then new.dispatched_at := now();
      when 'delivered' then
        new.delivered_at := now();
        -- entrega/retirada: pagamento acontece no recebimento
        if new.type in ('delivery', 'pickup') and new.payment_status = 'pending' then
          new.payment_status := 'paid';
        end if;
      when 'cancelled' then
        new.cancelled_at := now();
        new.cancelled_by := auth.uid();
        if new.cancel_reason is null or char_length(trim(new.cancel_reason)) < 3 then
          raise exception 'Informe o motivo do cancelamento';
        end if;
      else null;
    end case;

    -- ESTOQUE: baixa única na confirmação (flag stock_deducted impede duplicidade)
    if new.status in ('confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered') and not old.stock_deducted then
      perform public._apply_order_stock(new.id, new.organization_id, new.number, -1);
      new.stock_deducted := true;
    end if;

    -- ESTORNO: regra padrão = estorna se o preparo ainda não começou.
    -- Pode ser forçado (true/false) por quem cancela via update_order_status(p_restock).
    if new.status = 'cancelled' and old.stock_deducted then
      v_restock := coalesce(v_restock_setting::boolean, old.status in ('new', 'awaiting_confirmation', 'confirmed'));
      if v_restock then
        perform public._apply_order_stock(new.id, new.organization_id, new.number, 1);
        new.stock_deducted := false;
      end if;
    end if;

    -- CRM + FIDELIDADE na conclusão
    if new.status = 'delivered' and not old.customer_stats_applied and new.customer_id is not null then
      update public.customers
      set orders_count = orders_count + 1,
          total_spent = total_spent + new.total,
          first_order_at = coalesce(first_order_at, new.created_at),
          last_order_at = greatest(coalesce(last_order_at, new.created_at), new.created_at)
      where id = new.customer_id;
      new.customer_stats_applied := true;

      select * into v_program from public.loyalty_programs where organization_id = new.organization_id;
      if found and v_program.is_enabled then
        v_points := floor((new.subtotal - least(new.discount, new.subtotal)) * v_program.points_per_real)::int;
        if v_points > 0 then
          new.loyalty_points_earned := public._loyalty_add(new.organization_id, new.customer_id, v_points, 'earn',
                                                           new.id, null, 'Pedido #' || new.number);
        end if;
      end if;
    end if;

    if new.status = 'cancelled' then
      if old.loyalty_points_earned > 0 and new.customer_id is not null then
        perform public._loyalty_add(new.organization_id, new.customer_id, -old.loyalty_points_earned, 'reverse',
                                    new.id, null, 'Estorno pedido #' || new.number);
        new.loyalty_points_earned := 0;
      end if;
      if old.payment_status = 'paid' then
        new.payment_status := 'refunded';
      end if;
    end if;
  end if;

  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    if new.status = 'cancelled' then raise exception 'Pedido cancelado não pode ser marcado como pago'; end if;
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  return new;
end $$;
create trigger orders_before_update_trg before update on public.orders for each row execute function public.orders_before_update();

create or replace function public._broadcast_order(p_token text, p_status public.order_status, p_number int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send($1, $2, $3, $4)'
      using jsonb_build_object('status', p_status, 'number', p_number, 'at', now()), 'status', 'order:' || p_token, false;
  end if;
exception when others then
  null; -- Realtime nunca derruba a transação do pedido
end $$;

create or replace function public.orders_after_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_note text := nullif(current_setting('app.status_note', true), '');
  v_register uuid;
  v_coupon uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (organization_id, order_id, from_status, to_status, note, changed_by)
    values (new.organization_id, new.id, null, new.status, 'Pedido criado', auth.uid());
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_status_history (organization_id, order_id, from_status, to_status, note, changed_by)
    values (new.organization_id, new.id, old.status, new.status,
            coalesce(v_note, case when new.status = 'cancelled' then new.cancel_reason end), auth.uid());

    if new.driver_id is not null then
      if new.status = 'out_for_delivery' then
        update public.drivers set status = 'on_delivery' where id = new.driver_id;
      elsif new.status in ('delivered', 'cancelled') and not exists (
        select 1 from public.orders where driver_id = new.driver_id and status = 'out_for_delivery' and id <> new.id
      ) then
        update public.drivers set status = 'available' where id = new.driver_id and status = 'on_delivery';
      end if;
    end if;

    if new.status = 'cancelled' then
      delete from public.coupon_redemptions where order_id = new.id returning coupon_id into v_coupon;
      if v_coupon is not null then
        update public.coupons set uses_count = greatest(uses_count - 1, 0) where id = v_coupon;
      end if;
    end if;

    perform public._broadcast_order(new.public_token, new.status, new.number);
  end if;

  -- FINANCEIRO + CAIXA
  if new.payment_status = 'paid' and old.payment_status <> 'paid' and new.total > 0 then
    insert into public.financial_entries (organization_id, type, category, amount, payment_method, order_id, description, occurred_at)
    values (new.organization_id, 'income', 'vendas', new.total, new.payment_method, new.id, 'Pedido #' || new.number, new.paid_at)
    on conflict do nothing;
    select id into v_register from public.cash_registers where organization_id = new.organization_id and status = 'open';
    if v_register is not null then
      insert into public.cash_movements (organization_id, cash_register_id, type, payment_method, amount, order_id, reason)
      values (new.organization_id, v_register, 'sale', new.payment_method, new.total, new.id, 'Pedido #' || new.number);
    end if;
  elsif new.payment_status = 'refunded' and old.payment_status = 'paid' and new.total > 0 then
    insert into public.financial_entries (organization_id, type, category, amount, payment_method, order_id, description)
    values (new.organization_id, 'refund', 'estornos', new.total, new.payment_method, new.id, 'Estorno pedido #' || new.number)
    on conflict do nothing;
    select id into v_register from public.cash_registers where organization_id = new.organization_id and status = 'open';
    if v_register is not null then
      insert into public.cash_movements (organization_id, cash_register_id, type, payment_method, amount, order_id, reason)
      values (new.organization_id, v_register, 'refund', new.payment_method, new.total, new.id, 'Estorno pedido #' || new.number);
    end if;
  end if;

  return null;
end $$;
create trigger orders_after_insert_trg after insert on public.orders for each row execute function public.orders_after_change();
create trigger orders_after_update_trg after update on public.orders for each row execute function public.orders_after_change();

-- ---------- RPCs de operação do pedido -------------------------------
create or replace function public.update_order_status(
  p_order uuid, p_status public.order_status, p_note text default null, p_restock boolean default null
) returns public.orders language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_o public.orders;
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found or not public.is_org_member(v_o.organization_id) then raise exception 'Pedido não encontrado'; end if;

  v_allowed := public.has_permission(v_o.organization_id, 'orders.manage');
  if not v_allowed and p_status in ('preparing', 'ready') then
    v_allowed := public.has_permission(v_o.organization_id, 'kitchen.view');
  end if;
  if not v_allowed and p_status in ('out_for_delivery', 'delivered') and v_o.type = 'delivery' then
    v_allowed := public.has_permission(v_o.organization_id, 'deliveries.own') and exists (
      select 1 from public.drivers d where d.id = v_o.driver_id and d.user_id = auth.uid());
  end if;
  if not v_allowed then raise exception 'Sem permissão para alterar este pedido' using errcode = '42501'; end if;

  if p_status = 'cancelled' and (p_note is null or char_length(trim(p_note)) < 3) then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  perform set_config('app.restock', coalesce(p_restock::text, ''), true);

  update public.orders
  set status = p_status,
      cancel_reason = case when p_status = 'cancelled' then trim(p_note) else cancel_reason end
  where id = p_order
  returning * into v_o;

  perform set_config('app.status_note', '', true);
  perform set_config('app.restock', '', true);
  return v_o;
end $$;

create or replace function public.assign_driver(p_order uuid, p_driver uuid)
returns public.orders language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (public.has_permission(v_o.organization_id, 'orders.manage') or public.has_permission(v_o.organization_id, 'delivery.manage')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_o.type <> 'delivery' then raise exception 'Apenas pedidos de entrega recebem entregador'; end if;
  if v_o.status in ('delivered', 'cancelled') then raise exception 'Pedido já finalizado'; end if;
  if p_driver is not null and not exists (
    select 1 from public.drivers where id = p_driver and organization_id = v_o.organization_id and is_active and deleted_at is null
  ) then
    raise exception 'Entregador inválido';
  end if;
  update public.orders set driver_id = p_driver where id = p_order returning * into v_o;
  if p_driver is not null and v_o.status = 'out_for_delivery' then
    update public.drivers set status = 'on_delivery' where id = p_driver;
  end if;
  return v_o;
end $$;

create or replace function public.mark_order_paid(p_order uuid, p_method public.payment_method default null)
returns public.orders language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not (public.has_permission(v_o.organization_id, 'orders.manage') or public.has_permission(v_o.organization_id, 'cash.operate')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_o.status = 'cancelled' then raise exception 'Pedido cancelado'; end if;
  if v_o.payment_status = 'paid' then return v_o; end if;
  if p_method = 'card_online' then raise exception 'Pagamento online só pode ser confirmado pelo gateway'; end if;
  update public.orders
  set payment_status = 'paid', payment_method = coalesce(p_method, payment_method),
      change_for = case when coalesce(p_method, payment_method) = 'cash' then change_for else null end
  where id = p_order returning * into v_o;
  return v_o;
end $$;

-- =====================================================================
-- CAIXA
-- =====================================================================
create or replace function public.cash_register_summary(p_register uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.cash_registers;
  v jsonb;
begin
  select * into r from public.cash_registers where id = p_register;
  if not found then raise exception 'Caixa não encontrado'; end if;
  if not (public.has_permission(r.organization_id, 'cash.operate') or public.has_permission(r.organization_id, 'finance.view')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'register_id', r.id,
    'status', r.status,
    'opened_at', r.opened_at,
    'opened_by_name', (select coalesce(full_name, email) from public.profiles where id = r.opened_by),
    'closed_at', r.closed_at,
    'opening_amount', r.opening_amount,
    'sales_cash', coalesce(sum(amount) filter (where type = 'sale' and payment_method = 'cash'), 0),
    'sales_pix', coalesce(sum(amount) filter (where type = 'sale' and payment_method = 'pix'), 0),
    'sales_card', coalesce(sum(amount) filter (where type = 'sale' and payment_method in ('card', 'card_online')), 0),
    'sales_total', coalesce(sum(amount) filter (where type = 'sale'), 0),
    'sales_count', count(*) filter (where type = 'sale'),
    'withdrawals', coalesce(sum(amount) filter (where type = 'withdrawal'), 0),
    'supplies', coalesce(sum(amount) filter (where type = 'supply'), 0),
    'refunds_cash', coalesce(sum(amount) filter (where type = 'refund' and payment_method = 'cash'), 0),
    'refunds_total', coalesce(sum(amount) filter (where type = 'refund'), 0),
    'expected_cash', r.opening_amount
       + coalesce(sum(amount) filter (where type = 'sale' and payment_method = 'cash'), 0)
       + coalesce(sum(amount) filter (where type = 'supply'), 0)
       - coalesce(sum(amount) filter (where type = 'withdrawal'), 0)
       - coalesce(sum(amount) filter (where type = 'refund' and payment_method = 'cash'), 0),
    'reported_amount', r.reported_amount,
    'difference', r.difference
  ) into v
  from public.cash_movements where cash_register_id = r.id;
  return v;
end $$;

create or replace function public.open_cash_register(p_org uuid, p_amount numeric, p_notes text default null)
returns public.cash_registers language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.cash_registers;
begin
  perform public.require_permission(p_org, 'cash.operate');
  if p_amount is null or p_amount < 0 then raise exception 'Valor inicial inválido'; end if;
  begin
    insert into public.cash_registers (organization_id, opened_by, opening_amount, notes)
    values (p_org, auth.uid(), round(p_amount, 2), p_notes) returning * into r;
  exception when unique_violation then
    raise exception 'Já existe um caixa aberto';
  end;
  return r;
end $$;

create or replace function public.add_cash_movement(
  p_org uuid, p_type public.cash_movement_type, p_amount numeric, p_reason text default null
) returns public.cash_movements language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reg uuid; m public.cash_movements; v_expected numeric;
begin
  perform public.require_permission(p_org, 'cash.operate');
  if p_type not in ('withdrawal', 'supply') then raise exception 'Tipo inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_type = 'withdrawal' and (p_reason is null or char_length(trim(p_reason)) < 3) then
    raise exception 'Informe o motivo da sangria';
  end if;
  select id into v_reg from public.cash_registers where organization_id = p_org and status = 'open' for update;
  if v_reg is null then raise exception 'Nenhum caixa aberto'; end if;
  if p_type = 'withdrawal' then
    v_expected := (public.cash_register_summary(v_reg)->>'expected_cash')::numeric;
    if p_amount > v_expected then
      raise exception 'Sangria maior que o dinheiro em caixa (%)', public.fmt_brl(v_expected);
    end if;
  end if;
  insert into public.cash_movements (organization_id, cash_register_id, type, payment_method, amount, reason)
  values (p_org, v_reg, p_type, 'cash', round(p_amount, 2), nullif(trim(coalesce(p_reason, '')), ''))
  returning * into m;
  return m;
end $$;

create or replace function public.close_cash_register(p_org uuid, p_reported numeric, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reg public.cash_registers; v_sum jsonb; v_expected numeric;
begin
  perform public.require_permission(p_org, 'cash.operate');
  if p_reported is null or p_reported < 0 then raise exception 'Informe o valor contado'; end if;
  select * into v_reg from public.cash_registers where organization_id = p_org and status = 'open' for update;
  if not found then raise exception 'Nenhum caixa aberto'; end if;
  v_sum := public.cash_register_summary(v_reg.id);
  v_expected := (v_sum->>'expected_cash')::numeric;
  update public.cash_registers
  set status = 'closed', closed_by = auth.uid(), closed_at = now(), reported_amount = round(p_reported, 2),
      expected_amount = v_expected, difference = round(p_reported, 2) - v_expected, summary = v_sum,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = v_reg.id;
  return public.cash_register_summary(v_reg.id);
end $$;

-- =====================================================================
-- ABRIR / FECHAR LOJA (atendente também pode — é operação do dia a dia)
-- =====================================================================
create or replace function public.set_store_mode(p_org uuid, p_mode public.store_mode, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_permission(p_org, 'settings.manage') or public.has_permission(p_org, 'orders.manage')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.organizations
  set store_mode = p_mode,
      closed_message = coalesce(nullif(trim(coalesce(p_message, '')), ''), closed_message)
  where id = p_org;
  return public.store_status(p_org);
end $$;

-- =====================================================================
-- MESAS
-- =====================================================================
create or replace function public.get_table(p_slug text, p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', t.id, 'label', t.label)
  from public.dining_tables t join public.organizations o on o.id = t.organization_id
  where o.slug = lower(p_slug) and t.qr_token = p_token and t.is_active and t.deleted_at is null
$$;

create or replace function public.close_table_session(p_session uuid, p_method public.payment_method)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.table_sessions; v_total numeric;
begin
  select * into s from public.table_sessions where id = p_session for update;
  if not found or s.closed_at is not null then raise exception 'Conta não encontrada ou já fechada'; end if;
  if not (public.has_permission(s.organization_id, 'tables.manage') or public.has_permission(s.organization_id, 'cash.operate')) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_method is null or p_method = 'card_online' then raise exception 'Forma de pagamento inválida'; end if;
  if exists (select 1 from public.orders where table_session_id = s.id
             and status in ('new', 'awaiting_confirmation', 'confirmed', 'preparing')) then
    raise exception 'Ainda há pedidos desta mesa em preparo';
  end if;

  perform set_config('app.status_note', 'Conta da mesa fechada', true);
  update public.orders set payment_method = p_method,
         change_for = case when p_method = 'cash' then change_for else null end
  where table_session_id = s.id and status <> 'cancelled' and payment_status = 'pending';
  update public.orders set status = 'delivered' where table_session_id = s.id and status = 'ready';
  update public.orders set payment_status = 'paid' where table_session_id = s.id and status = 'delivered' and payment_status = 'pending';
  perform set_config('app.status_note', '', true);

  select coalesce(sum(total), 0) into v_total from public.orders where table_session_id = s.id and status <> 'cancelled';
  update public.table_sessions set closed_at = now(), closed_by = auth.uid(), payment_method = p_method, total = v_total where id = s.id;
  update public.dining_tables set status = 'free' where id = s.table_id;
  return jsonb_build_object('session_id', s.id, 'total', v_total);
end $$;

-- =====================================================================
-- FIDELIDADE (operação)
-- =====================================================================
create or replace function public.redeem_loyalty_reward(p_customer uuid, p_reward uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.customers; r public.loyalty_rewards;
begin
  select * into c from public.customers where id = p_customer;
  if not found then raise exception 'Cliente não encontrado'; end if;
  perform public.require_permission(c.organization_id, 'customers.manage');
  select * into r from public.loyalty_rewards where id = p_reward and organization_id = c.organization_id and is_active;
  if not found then raise exception 'Recompensa inválida'; end if;
  perform public._loyalty_add(c.organization_id, c.id, -r.points_cost, 'redeem', null, r.id, 'Resgate: ' || r.name);
  return jsonb_build_object('reward', r.name, 'points', r.points_cost,
    'balance', (select points_balance from public.loyalty_accounts where customer_id = c.id));
end $$;

create or replace function public.adjust_loyalty_points(p_customer uuid, p_points int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.customers;
begin
  select * into c from public.customers where id = p_customer;
  if not found then raise exception 'Cliente não encontrado'; end if;
  perform public.require_permission(c.organization_id, 'loyalty.manage');
  if p_points = 0 then raise exception 'Informe os pontos'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then raise exception 'Informe o motivo'; end if;
  perform public._loyalty_add(c.organization_id, c.id, p_points, 'adjust', null, null, trim(p_reason));
  return jsonb_build_object('balance', (select points_balance from public.loyalty_accounts where customer_id = c.id));
end $$;

-- =====================================================================
-- PÚBLICO: acompanhamento e avaliação
-- =====================================================================
create or replace function public.get_public_order(p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'token', o.public_token, 'type', o.type, 'status', o.status,
    'created_at', o.created_at, 'scheduled_for', o.scheduled_for, 'eta_min', o.eta_min, 'eta_max', o.eta_max,
    'confirmed_at', o.confirmed_at, 'preparing_at', o.preparing_at, 'ready_at', o.ready_at,
    'dispatched_at', o.dispatched_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
    'cancel_reason', o.cancel_reason, 'customer_name', o.customer_name, 'address', o.address,
    'subtotal', o.subtotal, 'discount', o.discount, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'coupon_code', o.coupon_code, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'change_for', o.change_for, 'notes', o.notes, 'loyalty_points_earned', o.loyalty_points_earned,
    'table_label', (select label from public.dining_tables where id = o.table_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'total', i.total,
        'notes', i.notes,
        'options', coalesce((select jsonb_agg(jsonb_build_object('group', m.group_name, 'kind', m.kind,
                    'group_kind', m.group_kind, 'name', m.name, 'quantity', m.quantity, 'unit_price', m.unit_price) order by m.sort)
                    from public.order_item_modifiers m where m.order_item_id = i.id), '[]'::jsonb)
      ) order by i.sort) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at)
                from public.order_status_history h where h.order_id = o.id), '[]'::jsonb),
    'review', (select jsonb_build_object('rating', r.rating, 'comment', r.comment, 'reply', r.reply) from public.reviews r where r.order_id = o.id),
    'org', jsonb_build_object(
      'name', g.name, 'slug', g.slug, 'logo_url', g.logo_url, 'primary_color', g.primary_color,
      'secondary_color', g.secondary_color, 'whatsapp', g.whatsapp, 'phone', g.phone,
      'address', concat_ws(', ', g.address_street || coalesce(', ' || g.address_number, ''), g.address_district, g.address_city),
      'pix_key', g.pix_key, 'pix_key_type', g.pix_key_type, 'pix_holder_name', g.pix_holder_name, 'pix_city', g.pix_city, 'timezone', g.timezone)
  )
  from public.orders o join public.organizations g on g.id = o.organization_id
  where o.public_token = p_token
$$;

create or replace function public.submit_review(p_token text, p_rating int, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.orders;
begin
  select * into o from public.orders where public_token = p_token;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if o.status <> 'delivered' then raise exception 'Você poderá avaliar assim que o pedido for concluído'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Nota inválida'; end if;
  if exists (select 1 from public.reviews where order_id = o.id) then raise exception 'Este pedido já foi avaliado'; end if;
  insert into public.reviews (organization_id, order_id, customer_id, customer_name, rating, comment)
  values (o.organization_id, o.id, o.customer_id, o.customer_name, p_rating, nullif(left(trim(coalesce(p_comment, '')), 600), ''));
  insert into public.notifications (organization_id, type, title, body, link)
  values (o.organization_id, 'review', 'Nova avaliação: ' || repeat('★', p_rating) || repeat('☆', 5 - p_rating),
          coalesce(o.customer_name, 'Cliente') || ' · pedido #' || o.number, '/app/avaliacoes');
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- DESPESAS → FINANCEIRO (+ recorrência)
-- =====================================================================
create unique index financial_entries_expense_uidx on public.financial_entries (expense_id) where type = 'expense';

create or replace function public.expenses_before()
returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status = 'pending' then new.paid_at := null; end if;
  return new;
end $$;
create trigger expenses_before_trg before insert or update on public.expenses for each row execute function public.expenses_before();

create or replace function public.expenses_after()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next date;
begin
  if new.deleted_at is not null or new.status = 'pending' then
    delete from public.financial_entries where expense_id = new.id and type = 'expense';
    return null;
  end if;
  if new.status = 'paid' then
    insert into public.financial_entries (organization_id, type, category, amount, expense_id, description, occurred_at)
    values (new.organization_id, 'expense', new.category, new.amount, new.id, new.description, new.paid_at)
    on conflict (expense_id) where type = 'expense'
    do update set amount = excluded.amount, category = excluded.category, description = excluded.description, occurred_at = excluded.occurred_at;

    if new.recurrence <> 'none' and (tg_op = 'INSERT' or old.status <> 'paid') then
      v_next := case new.recurrence when 'monthly' then (new.due_date + interval '1 month')::date
                                    else (new.due_date + interval '7 days')::date end;
      if not exists (select 1 from public.expenses where recurrence_parent_id = new.id and deleted_at is null) then
        insert into public.expenses (organization_id, category, description, amount, due_date, recurrence,
                                     recurrence_parent_id, supplier_id, notes, created_by)
        values (new.organization_id, new.category, new.description, new.amount, v_next, new.recurrence,
                new.id, new.supplier_id, new.notes, new.created_by);
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger expenses_after_trg after insert or update on public.expenses for each row execute function public.expenses_after();

-- =====================================================================
-- PROVISIONAMENTO DE EMPRESAS
-- =====================================================================
create or replace function public._seed_org_roles(p_org uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  v_roles jsonb := '{
    "owner":     {"name": "Dono",       "perms": []},
    "manager":   {"name": "Gerente",    "perms": ["dashboard.view","orders.view","orders.manage","orders.create","kitchen.view","menu.view","menu.manage","customers.view","customers.manage","loyalty.manage","coupons.manage","inventory.view","inventory.manage","delivery.manage","deliveries.own","tables.manage","cash.operate","finance.view","finance.manage","reports.view","marketing.manage","reviews.manage","staff.manage","settings.manage"]},
    "attendant": {"name": "Atendente",  "perms": ["dashboard.view","orders.view","orders.manage","orders.create","kitchen.view","menu.view","customers.view","customers.manage","delivery.manage","tables.manage"]},
    "cashier":   {"name": "Caixa",      "perms": ["dashboard.view","orders.view","orders.manage","orders.create","menu.view","customers.view","customers.manage","tables.manage","cash.operate"]},
    "kitchen":   {"name": "Cozinha",    "perms": ["orders.view","kitchen.view","menu.view","inventory.view"]},
    "driver":    {"name": "Entregador", "perms": ["deliveries.own"]}
  }'::jsonb;
  v_key text;
  v_role uuid;
begin
  for v_key in select jsonb_object_keys(v_roles) loop
    insert into public.roles (organization_id, key, name, is_system)
    values (p_org, v_key, v_roles->v_key->>'name', true)
    on conflict (organization_id, key) do update set name = excluded.name
    returning id into v_role;
    insert into public.role_permissions (organization_id, role_id, permission_key)
    select p_org, v_role, value from jsonb_array_elements_text(v_roles->v_key->'perms')
    on conflict do nothing;
  end loop;
end $$;

create or replace function public._provision_organization(
  p_name text, p_slug text, p_owner uuid, p_plan_code text, p_trial_days int, p_sub_status public.subscription_status
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_plan public.plans;
  v_slug text := lower(trim(p_slug));
begin
  if v_slug in ('app', 'master', 'api', 'login', 'cadastro', 'onboarding', 'www', 'admin', 'auth', 'static',
                'entrar', 'sair', 'planos', 'termos', 'privacidade', 'suporte', 'ajuda', 'blog',
                'esqueci-senha', 'redefinir-senha', 'logout') then
    raise exception 'Este endereço é reservado. Escolha outro.';
  end if;
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise exception 'Este endereço já está em uso. Escolha outro.';
  end if;
  select * into v_plan from public.plans where code = upper(coalesce(p_plan_code, 'STARTER')) and is_active;
  if not found then raise exception 'Plano inválido'; end if;
  if not exists (select 1 from auth.users where id = p_owner) then raise exception 'Responsável não encontrado'; end if;

  insert into public.organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  perform public._seed_org_roles(v_org);

  insert into public.subscriptions (organization_id, plan_id, status, price, trial_ends_at, current_period_start, current_period_end)
  values (v_org, v_plan.id, p_sub_status, v_plan.price,
          case when p_sub_status = 'trialing' then now() + make_interval(days => p_trial_days) end,
          current_date, (current_date + interval '1 month')::date);

  insert into public.organization_members (organization_id, user_id, role_id, display_name)
  select v_org, p_owner, r.id, (select full_name from public.profiles where id = p_owner)
  from public.roles r where r.organization_id = v_org and r.key = 'owner';

  insert into public.loyalty_programs (organization_id, is_enabled, points_per_real) values (v_org, false, 1);

  insert into public.categories (organization_id, name, sort)
  select v_org, n, i from unnest(array['Hambúrgueres', 'Smash', 'Combos', 'Porções', 'Bebidas', 'Sobremesas']) with ordinality as t(n, i);

  insert into public.opening_hours (organization_id, weekday, opens_at, closes_at)
  select v_org, d, '18:00', '23:30' from unnest(array[0, 3, 4, 5, 6]) d;

  insert into public.whatsapp_templates (organization_id, key, name, body) values
    (v_org, 'order_received', 'Pedido recebido', 'Olá, {{cliente}}! Recebemos seu pedido #{{numero}} no valor de {{total}}. Acompanhe por aqui: {{link}}'),
    (v_org, 'order_confirmed', 'Pedido confirmado', 'Oba, {{cliente}}! Seu pedido #{{numero}} foi confirmado e já vai para a chapa. Previsão: {{previsao}}.'),
    (v_org, 'out_for_delivery', 'Saiu para entrega', '{{cliente}}, seu pedido #{{numero}} saiu para entrega! {{pagamento}}'),
    (v_org, 'order_delivered', 'Pedido entregue', 'Pedido #{{numero}} entregue. Obrigado, {{cliente}}! Avalie sua experiência: {{link}}'),
    (v_org, 'order_ready_pickup', 'Pronto para retirada', '{{cliente}}, seu pedido #{{numero}} está pronto para retirada!');

  insert into public.notifications (organization_id, type, title, body, link)
  values (v_org, 'subscription',
          case when p_sub_status = 'trialing' then 'Seu teste grátis começou' else 'Assinatura ativa' end,
          'Plano ' || v_plan.name || case when p_sub_status = 'trialing' then ' · ' || p_trial_days || ' dias de teste' else '' end,
          '/app/configuracoes?tab=assinatura');
  return v_org;
end $$;

create or replace function public.provision_organization(
  p_name text, p_slug text, p_owner uuid, p_plan_code text default 'STARTER', p_trial_days int default 14,
  p_sub_status public.subscription_status default 'trialing'
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Apenas a administração da plataforma' using errcode = '42501';
  end if;
  return public._provision_organization(p_name, p_slug, p_owner, p_plan_code, p_trial_days, p_sub_status);
end $$;

create or replace function public.create_my_organization(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  if exists (select 1 from public.organization_members m join public.roles r on r.id = m.role_id
             where m.user_id = auth.uid() and r.key = 'owner') then
    raise exception 'Você já possui uma empresa cadastrada';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da hamburgueria'; end if;
  return public._provision_organization(p_name, p_slug, auth.uid(), 'STARTER', 14, 'trialing');
end $$;

-- ---------- Equipe ---------------------------------------------------
create or replace function public.add_member(
  p_org uuid, p_user uuid, p_role_key text, p_display_name text default null, p_phone text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role public.roles; v_id uuid;
begin
  perform public.require_permission(p_org, 'staff.manage');
  select * into v_role from public.roles where organization_id = p_org and key = p_role_key;
  if not found then raise exception 'Função inválida'; end if;
  if v_role.key = 'owner' and not (public.is_platform_admin() or exists (
      select 1 from public.organization_members m join public.roles r on r.id = m.role_id
      where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active and r.key = 'owner')) then
    raise exception 'Apenas o dono pode adicionar outro dono' using errcode = '42501';
  end if;
  insert into public.organization_members (organization_id, user_id, role_id, display_name, phone, is_active)
  values (p_org, p_user, v_role.id, nullif(trim(coalesce(p_display_name, '')), ''), public.only_digits(p_phone), true)
  on conflict (organization_id, user_id) do update
    set role_id = excluded.role_id, is_active = true,
        display_name = coalesce(excluded.display_name, public.organization_members.display_name),
        phone = coalesce(excluded.phone, public.organization_members.phone)
  returning id into v_id;

  if v_role.key = 'driver' then
    insert into public.drivers (organization_id, user_id, name, phone, status)
    values (p_org, p_user, coalesce(nullif(trim(coalesce(p_display_name, '')), ''), (select coalesce(full_name, email) from public.profiles where id = p_user)),
            public.only_digits(p_phone), 'offline')
    on conflict (organization_id, user_id) do update set is_active = true, deleted_at = null;
  end if;
  return v_id;
end $$;

create or replace function public.update_member(
  p_member uuid, p_role_key text default null, p_active boolean default null, p_display_name text default null, p_phone text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m public.organization_members;
  v_cur_role text;
  v_new_role public.roles;
  v_caller_is_owner boolean;
begin
  select * into m from public.organization_members where id = p_member;
  if not found then raise exception 'Funcionário não encontrado'; end if;
  perform public.require_permission(m.organization_id, 'staff.manage');
  select key into v_cur_role from public.roles where id = m.role_id;
  v_caller_is_owner := public.is_platform_admin() or exists (
    select 1 from public.organization_members x join public.roles r on r.id = x.role_id
    where x.organization_id = m.organization_id and x.user_id = auth.uid() and x.is_active and r.key = 'owner');

  if v_cur_role = 'owner' and not v_caller_is_owner then
    raise exception 'Apenas o dono pode alterar outro dono' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() and p_active = false then raise exception 'Você não pode desativar o próprio acesso'; end if;

  if p_role_key is not null then
    select * into v_new_role from public.roles where organization_id = m.organization_id and key = p_role_key;
    if not found then raise exception 'Função inválida'; end if;
    if v_new_role.key = 'owner' and not v_caller_is_owner then
      raise exception 'Apenas o dono pode promover alguém a dono' using errcode = '42501';
    end if;
  end if;

  if v_cur_role = 'owner' and ((p_role_key is not null and p_role_key <> 'owner') or p_active = false) then
    if (select count(*) from public.organization_members x join public.roles r on r.id = x.role_id
        where x.organization_id = m.organization_id and x.is_active and r.key = 'owner') <= 1 then
      raise exception 'A empresa precisa ter pelo menos um dono ativo';
    end if;
  end if;

  update public.organization_members
  set role_id = coalesce(v_new_role.id, role_id),
      is_active = coalesce(p_active, is_active),
      display_name = coalesce(nullif(trim(coalesce(p_display_name, '')), ''), display_name),
      phone = coalesce(public.only_digits(p_phone), phone)
  where id = p_member;

  if v_new_role.key = 'driver' or (v_new_role.id is null and v_cur_role = 'driver') then
    insert into public.drivers (organization_id, user_id, name, phone, status)
    select m.organization_id, m.user_id, coalesce(m.display_name, p.full_name, p.email), m.phone, 'offline'
    from public.profiles p where p.id = m.user_id
    on conflict (organization_id, user_id) do update set is_active = coalesce(p_active, true), deleted_at = null;
  elsif p_active = false then
    update public.drivers set is_active = false, status = 'offline' where organization_id = m.organization_id and user_id = m.user_id;
  end if;
end $$;

create or replace function public.set_role_permissions(p_role uuid, p_permissions text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.roles;
begin
  select * into r from public.roles where id = p_role;
  if not found then raise exception 'Função não encontrada'; end if;
  perform public.require_permission(r.organization_id, 'staff.manage');
  if r.key = 'owner' then raise exception 'As permissões do dono não podem ser alteradas'; end if;
  if r.key = 'manager' and not public.has_permission(r.organization_id, 'billing.view') then
    raise exception 'Apenas o dono pode alterar as permissões de gerente' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_permissions) k where k not in (select key from public.permissions)) then
    raise exception 'Permissão desconhecida';
  end if;
  if 'billing.view' = any (p_permissions) then raise exception 'Assinatura é exclusiva do dono'; end if;
  delete from public.role_permissions where role_id = p_role;
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select r.organization_id, p_role, k from unnest(p_permissions) k on conflict do nothing;
end $$;

-- =====================================================================
-- CARDÁPIO PÚBLICO (um único JSON)
-- =====================================================================
create or replace function public.get_storefront(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.organizations; v jsonb;
begin
  select * into o from public.organizations where slug = lower(p_slug) and deleted_at is null and status <> 'cancelled';
  if not found then return null; end if;

  select jsonb_build_object(
    'org', jsonb_build_object(
      'id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description,
      'logo_url', o.logo_url, 'banner_url', o.banner_url,
      'primary_color', o.primary_color, 'secondary_color', o.secondary_color,
      'phone', o.phone, 'whatsapp', o.whatsapp, 'instagram', o.instagram,
      'address', jsonb_build_object('street', o.address_street, 'number', o.address_number, 'district', o.address_district,
                                    'city', o.address_city, 'state', o.address_state, 'zip', o.address_zip, 'complement', o.address_complement),
      'accepts_delivery', o.accepts_delivery, 'accepts_pickup', o.accepts_pickup, 'accepts_dine_in', o.accepts_dine_in,
      'accepts_pix', o.accepts_pix, 'accepts_cash', o.accepts_cash, 'accepts_card', o.accepts_card,
      'allow_scheduling', o.allow_scheduling, 'min_order_value', o.min_order_value,
      'pickup_eta_min', o.pickup_eta_min, 'pickup_eta_max', o.pickup_eta_max, 'timezone', o.timezone
    ),
    'status', public.store_status(o.id),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'), 'closes_at', to_char(h.closes_at, 'HH24:MI')) order by h.weekday, h.opens_at)
               from public.opening_hours h where h.organization_id = o.id), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('date', e.date, 'is_closed', e.is_closed, 'opens_at', to_char(e.opens_at, 'HH24:MI'), 'closes_at', to_char(e.closes_at, 'HH24:MI'), 'reason', e.reason) order by e.date)
               from public.opening_exceptions e where e.organization_id = o.id and e.date between current_date and current_date + 14), '[]'::jsonb),
    'rating', (select case when count(*) > 0 then jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*)) end
               from public.reviews r where r.organization_id = o.id and not r.is_hidden),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description) order by c.sort, c.name)
               from public.categories c where c.organization_id = o.id and c.is_active and c.deleted_at is null
                 and exists (select 1 from public.products p where p.category_id = c.id and p.is_active and p.deleted_at is null)), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'category_id', p.category_id, 'type', p.type, 'name', p.name, 'description', p.description,
        'ingredients', p.ingredients_text, 'price', p.price, 'promo_price', p.promo_price, 'prep_minutes', p.prep_minutes,
        'is_available', p.is_available, 'is_featured', p.is_featured, 'sort', p.sort,
        'images', coalesce((select jsonb_agg(pi.url order by pi.sort) from public.product_images pi where pi.product_id = p.id), '[]'::jsonb),
        'groups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id, 'name', g.name, 'description', g.description, 'kind', g.kind,
            'min_select', g.min_select, 'max_select', g.max_select, 'is_required', g.is_required,
            'options', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price_delta', m.price_delta,
                          'max_quantity', m.max_quantity, 'is_default', m.is_default) order by m.sort, m.name)
                        from public.modifiers m where m.group_id = g.id and m.is_active and m.deleted_at is null), '[]'::jsonb)
          ) order by pmg.sort, g.sort)
          from public.product_modifier_groups pmg join public.modifier_groups g on g.id = pmg.group_id and g.deleted_at is null
          where pmg.product_id = p.id), '[]'::jsonb),
        'combo_groups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', cg.id, 'name', cg.name, 'min_qty', cg.min_qty, 'max_qty', cg.max_qty,
            'options', coalesce((select jsonb_agg(jsonb_build_object('product_id', cp.id, 'name', cp.name, 'price_delta', cgo.price_delta,
                          'is_available', cp.is_available and cp.is_active and cp.deleted_at is null,
                          'image', (select pi.url from public.product_images pi where pi.product_id = cp.id order by pi.sort limit 1)) order by cgo.sort, cp.name)
                        from public.combo_group_options cgo join public.products cp on cp.id = cgo.product_id
                        where cgo.combo_group_id = cg.id), '[]'::jsonb)
          ) order by cg.sort)
          from public.combo_groups cg where cg.combo_product_id = p.id), '[]'::jsonb)
      ) order by p.sort, p.name)
      from public.products p where p.organization_id = o.id and p.is_active and p.deleted_at is null), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee', z.fee, 'min_order', z.min_order,
                 'eta_min', z.eta_min, 'eta_max', z.eta_max, 'zip_prefixes', z.zip_prefixes) order by z.sort, z.name)
               from public.delivery_zones z where z.organization_id = o.id and z.is_active and z.deleted_at is null), '[]'::jsonb),
    'loyalty', (select jsonb_build_object('points_per_real', lp.points_per_real) from public.loyalty_programs lp where lp.organization_id = o.id and lp.is_enabled)
  ) into v;
  return v;
end $$;

create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select lower(trim(p_slug)) ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'
     and lower(trim(p_slug)) not in ('app', 'master', 'api', 'login', 'cadastro', 'onboarding', 'www', 'admin', 'auth', 'static',
                                     'entrar', 'sair', 'planos', 'termos', 'privacidade', 'suporte', 'ajuda', 'blog',
                                     'esqueci-senha', 'redefinir-senha', 'logout')
     and not exists (select 1 from public.organizations where slug = lower(trim(p_slug)))
$$;

create or replace function public.resolve_domain(p_host text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select slug from public.organizations
  where lower(custom_domain) = lower(split_part(p_host, ':', 1)) and deleted_at is null and status <> 'cancelled'
$$;

-- =====================================================================
-- DASHBOARD, RELATÓRIOS E FINANCEIRO
-- =====================================================================
create or replace function public.dashboard_summary(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tz text;
  v_today date;
  v jsonb;
begin
  perform public.require_permission(p_org, 'dashboard.view');
  select timezone into v_tz from public.organizations where id = p_org;
  v_today := (now() at time zone v_tz)::date;

  with o as (
    select *, (created_at at time zone v_tz)::date as d, extract(hour from created_at at time zone v_tz)::int as h
    from public.orders where organization_id = p_org and created_at >= ((v_today - 30)::timestamp at time zone v_tz)
  )
  select jsonb_build_object(
    'today', (select jsonb_build_object(
        'revenue', coalesce(sum(total) filter (where status <> 'cancelled'), 0),
        'orders', count(*) filter (where status <> 'cancelled'),
        'avg_ticket', coalesce(round(avg(total) filter (where status <> 'cancelled'), 2), 0),
        'customers', count(distinct coalesce(customer_id::text, customer_phone)) filter (where status <> 'cancelled'),
        'cancelled', count(*) filter (where status = 'cancelled'))
      from o where d = v_today),
    'yesterday', (select jsonb_build_object(
        'revenue', coalesce(sum(total) filter (where status <> 'cancelled'), 0),
        'orders', count(*) filter (where status <> 'cancelled'),
        'avg_ticket', coalesce(round(avg(total) filter (where status <> 'cancelled'), 2), 0),
        'customers', count(distinct coalesce(customer_id::text, customer_phone)) filter (where status <> 'cancelled'))
      from o where d = v_today - 1),
    'new_customers_today', (select count(*) from public.customers c where c.organization_id = p_org
        and (c.created_at at time zone v_tz)::date = v_today),
    'sales_14d', (select jsonb_agg(jsonb_build_object('date', s.d, 'revenue', coalesce(x.revenue, 0), 'orders', coalesce(x.orders, 0)) order by s.d)
        from generate_series(v_today - 13, v_today, interval '1 day') s(d)
        left join (select d, sum(total) revenue, count(*) orders from o where status <> 'cancelled' group by d) x on x.d = s.d::date),
    'by_hour', (select jsonb_agg(jsonb_build_object('hour', hh, 'today', coalesce(t.c, 0), 'avg', coalesce(a.c, 0)) order by hh)
        from generate_series(0, 23) hh
        left join (select h, count(*) c from o where d = v_today and status <> 'cancelled' group by h) t on t.h = hh
        left join (select h, round(count(*)::numeric / 30, 1) c from o where d < v_today and status <> 'cancelled' group by h) a on a.h = hh),
    'top_products', (select coalesce(jsonb_agg(t order by t.qty desc), '[]'::jsonb) from (
        select oi.product_name as name, sum(oi.quantity)::int as qty, sum(oi.total) as revenue
        from public.order_items oi join o on o.id = oi.order_id
        where o.d > v_today - 7 and o.status <> 'cancelled'
        group by oi.product_name order by sum(oi.quantity) desc limit 5) t),
    'recent_orders', (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) from (
        select id, number, customer_name, type, status, total, payment_method, payment_status, created_at
        from public.orders where organization_id = p_org order by created_at desc limit 8) t),
    'open_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
        select status, count(*) c from public.orders where organization_id = p_org
        and status not in ('delivered', 'cancelled') group by status) t),
    'stock_alerts', (select coalesce(jsonb_agg(t order by t.ratio), '[]'::jsonb) from (
        select i.id, i.name, i.unit, i.stock_qty, i.min_qty,
               case when i.min_qty > 0 then i.stock_qty / i.min_qty else 0 end as ratio,
               (select count(distinct r.product_id) from public.product_recipes r where r.ingredient_id = i.id) as products_affected
        from public.ingredients i
        where i.organization_id = p_org and i.deleted_at is null and i.is_active and (i.stock_qty <= i.min_qty or i.stock_qty <= 0)
        order by 6 limit 8) t)
  ) into v;
  return v;
end $$;

create or replace function public.report_overview(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tz text; v jsonb;
begin
  perform public.require_permission(p_org, 'reports.view');
  if p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 400 then raise exception 'Período máximo de 400 dias'; end if;
  select timezone into v_tz from public.organizations where id = p_org;

  with o as (
    select *, (created_at at time zone v_tz)::date as d,
           extract(hour from created_at at time zone v_tz)::int as h,
           extract(dow from created_at at time zone v_tz)::int as dow
    from public.orders
    where organization_id = p_org
      and created_at >= (p_from::timestamp at time zone v_tz)
      and created_at < ((p_to + 1)::timestamp at time zone v_tz)
  ), ok as (select * from o where status <> 'cancelled'),
  sold as (
    select oi.product_id, oi.product_name, sum(oi.quantity)::int qty, sum(oi.total) revenue
    from public.order_items oi join ok on ok.id = oi.order_id group by oi.product_id, oi.product_name
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'revenue', coalesce(sum(total), 0), 'orders', count(*), 'avg_ticket', coalesce(round(avg(total), 2), 0),
        'discounts', coalesce(sum(discount), 0), 'delivery_fees', coalesce(sum(delivery_fee), 0),
        'cancelled', (select count(*) from o where status = 'cancelled'),
        'cancelled_value', (select coalesce(sum(total), 0) from o where status = 'cancelled')) from ok),
    'by_day', (select jsonb_agg(jsonb_build_object('date', s.d::date, 'revenue', coalesce(x.r, 0), 'orders', coalesce(x.c, 0)) order by s.d)
        from generate_series(p_from, p_to, interval '1 day') s(d)
        left join (select d, sum(total) r, count(*) c from ok group by d) x on x.d = s.d::date),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'revenue', r, 'orders', c) order by m), '[]'::jsonb)
        from (select to_char(d, 'YYYY-MM') m, sum(total) r, count(*) c from ok group by 1) x),
    'top_products', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (select product_name as name, qty, revenue from sold order by qty desc, revenue desc limit 10) t),
    'bottom_products', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select p.name, coalesce(s.qty, 0) qty, coalesce(s.revenue, 0) revenue
        from public.products p left join sold s on s.product_id = p.id
        where p.organization_id = p_org and p.is_active and p.deleted_at is null
        order by coalesce(s.qty, 0) asc, p.name limit 10) t),
    'margins', (select coalesce(jsonb_agg(t order by t.total_margin desc), '[]'::jsonb) from (
        select pc.name, pc.sale_price, pc.cost, pc.margin, pc.margin_pct, pc.recipe_items, coalesce(s.qty, 0) qty,
               round(pc.margin * coalesce(s.qty, 0), 2) total_margin
        from public.product_costs pc left join sold s on s.product_id = pc.product_id
        where pc.organization_id = p_org) t),
    'by_hour', (select jsonb_agg(jsonb_build_object('hour', hh, 'orders', coalesce(x.c, 0), 'revenue', coalesce(x.r, 0)) order by hh)
        from generate_series(0, 23) hh left join (select h, count(*) c, sum(total) r from ok group by h) x on x.h = hh),
    'by_weekday', (select jsonb_agg(jsonb_build_object('dow', dd, 'orders', coalesce(x.c, 0), 'revenue', coalesce(x.r, 0)) order by dd)
        from generate_series(0, 6) dd left join (select dow, count(*) c, sum(total) r from ok group by dow) x on x.dow = dd),
    'customers', (select jsonb_build_object(
        'unique', count(distinct customer_id),
        'returning', (select count(*) from (select customer_id from ok where customer_id is not null group by customer_id having count(*) > 1) z),
        'new', (select count(*) from public.customers c where c.organization_id = p_org
                and c.created_at >= (p_from::timestamp at time zone v_tz) and c.created_at < ((p_to + 1)::timestamp at time zone v_tz)),
        'top', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
            select customer_id as id, max(customer_name) as name, count(*) orders, sum(total) spent
            from ok where customer_id is not null group by customer_id order by sum(total) desc limit 10) t)) from ok),
    'coupons', (select coalesce(jsonb_agg(t order by t.uses desc), '[]'::jsonb) from (
        select coupon_code as code, count(*) uses, sum(discount) discount, sum(total) revenue
        from ok where coupon_code is not null group by coupon_code) t),
    'by_type', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (select type, count(*) orders, sum(total) revenue from ok group by type order by 2 desc) t),
    'by_payment', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (select payment_method as method, count(*) orders, sum(total) revenue from ok group by 1 order by 2 desc) t),
    'cancellations', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select number, customer_name, total, cancel_reason as reason, cancelled_at from o where status = 'cancelled' order by cancelled_at desc limit 50) t)
  ) into v;
  return v;
end $$;

create or replace function public.finance_summary(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tz text; v jsonb; v_start timestamptz; v_end timestamptz;
begin
  perform public.require_permission(p_org, 'finance.view');
  if p_to < p_from then raise exception 'Período inválido'; end if;
  select timezone into v_tz from public.organizations where id = p_org;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with fe as (select * from public.financial_entries where organization_id = p_org and occurred_at >= v_start and occurred_at < v_end),
  cmv as (
    select coalesce(-sum(quantity * coalesce(unit_cost, 0)), 0) as cmv_value
    from public.inventory_movements
    where organization_id = p_org and type in ('sale', 'sale_reversal') and created_at >= v_start and created_at < v_end
  ),
  ords as (select * from public.orders where organization_id = p_org and created_at >= v_start and created_at < v_end)
  select jsonb_build_object(
    'income', (select coalesce(sum(amount) filter (where type = 'income'), 0) from fe),
    'refunds', (select coalesce(sum(amount) filter (where type = 'refund'), 0) from fe),
    'expenses', (select coalesce(sum(amount) filter (where type = 'expense'), 0) from fe),
    'cmv', round((select cmv_value from cmv), 2),
    'profit', round((select coalesce(sum(case type when 'income' then amount else -amount end), 0) from fe) - (select cmv_value from cmv), 2),
    'orders', (select count(*) from ords where status <> 'cancelled'),
    'avg_ticket', (select coalesce(round(avg(total), 2), 0) from ords where status <> 'cancelled'),
    'cancelled', (select count(*) from ords where status = 'cancelled'),
    'cancelled_value', (select coalesce(sum(total), 0) from ords where status = 'cancelled'),
    'by_method', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select payment_method as method, sum(amount) amount from fe where type = 'income' group by 1 order by 2 desc) t),
    'expenses_by_category', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select category, sum(amount) amount from fe where type = 'expense' group by 1 order by 2 desc) t),
    'daily', (select jsonb_agg(jsonb_build_object('date', s.d::date,
                 'income', coalesce(x.i, 0), 'expenses', coalesce(x.e, 0)) order by s.d)
        from generate_series(p_from, p_to, interval '1 day') s(d)
        left join (select (occurred_at at time zone v_tz)::date d,
                          sum(amount) filter (where type = 'income') - coalesce(sum(amount) filter (where type = 'refund'), 0) i,
                          sum(amount) filter (where type = 'expense') e
                   from fe group by 1) x on x.d = s.d::date),
    'pending_expenses', (select coalesce(jsonb_agg(t order by t.due_date), '[]'::jsonb) from (
        select id, description, category, amount, due_date from public.expenses
        where organization_id = p_org and status = 'pending' and deleted_at is null and due_date <= current_date + 7
        order by due_date limit 20) t)
  ) into v;
  return v;
end $$;

-- =====================================================================
-- AUDITORIA
-- =====================================================================
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changes jsonb;
  v_org uuid;
  v_ignore text[] := coalesce(tg_argv::text[], '{}') || array['updated_at'];
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)) into v_changes
    from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value and not (n.key = any (v_ignore));
    if v_changes is null then return null; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;
  v_org := coalesce((coalesce(v_new, v_old)->>'organization_id')::uuid,
                    case when tg_table_name = 'organizations' then (coalesce(v_new, v_old)->>'id')::uuid end);
  insert into public.audit_logs (organization_id, user_id, action, entity, entity_id, changes)
  values (v_org, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(coalesce(v_new, v_old)->>'id', coalesce(v_new, v_old)->>'organization_id'), v_changes);
  return null;
end $$;

create trigger audit_products after insert or update or delete on public.products for each row execute function public.audit_row('is_available', 'unavailable_reason');
create trigger audit_coupons after insert or update or delete on public.coupons for each row execute function public.audit_row('uses_count');
create trigger audit_members after insert or update or delete on public.organization_members for each row execute function public.audit_row('last_access_at');
create trigger audit_organizations after update on public.organizations for each row execute function public.audit_row('order_seq', 'last_activity_at');
create trigger audit_cash_registers after insert or update on public.cash_registers for each row execute function public.audit_row();
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit_row();
create trigger audit_delivery_zones after insert or update or delete on public.delivery_zones for each row execute function public.audit_row();
create trigger audit_ingredients after insert or update or delete on public.ingredients for each row execute function public.audit_row('stock_qty', 'cost_per_unit');
create trigger audit_loyalty after update on public.loyalty_programs for each row execute function public.audit_row();
create trigger audit_subscriptions after insert or update on public.subscriptions for each row execute function public.audit_row();


-- ====================================================================
-- migrations/0005_security.sql
-- ====================================================================
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


-- ====================================================================
-- migrations/0006_realtime_storage.sql
-- ====================================================================
-- =====================================================================
-- TOP BURGER OS — 0006 REALTIME E STORAGE
-- =====================================================================

-- Realtime (postgres_changes respeita RLS: cada tela recebe só a sua org)
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_status_history', 'drivers', 'notifications', 'dining_tables', 'products'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- Para UPDATE trazer a linha antiga (útil para animação de mudança de status)
alter table public.orders replica identity full;

-- Storage: bucket público para logo, banner e fotos de produtos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-assets', 'org-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helper: organização dona do arquivo pelo 1º segmento do caminho {org_id}/...
create or replace function public.storage_org_from_path(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.storage_org_from_path(text) to authenticated;

drop policy if exists "org assets insert" on storage.objects;
drop policy if exists "org assets update" on storage.objects;
drop policy if exists "org assets delete" on storage.objects;

create policy "org assets insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'org-assets' and (
    public.has_permission(public.storage_org_from_path(name), 'menu.manage')
    or public.has_permission(public.storage_org_from_path(name), 'settings.manage'))
);
create policy "org assets update" on storage.objects for update to authenticated using (
  bucket_id = 'org-assets' and (
    public.has_permission(public.storage_org_from_path(name), 'menu.manage')
    or public.has_permission(public.storage_org_from_path(name), 'settings.manage'))
);
create policy "org assets delete" on storage.objects for delete to authenticated using (
  bucket_id = 'org-assets' and (
    public.has_permission(public.storage_org_from_path(name), 'menu.manage')
    or public.has_permission(public.storage_org_from_path(name), 'settings.manage'))
);


-- ====================================================================
-- migrations/0007_platform.sql
-- ====================================================================
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


-- ====================================================================
-- migrations/0008_payments.sql
-- ====================================================================
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


-- ====================================================================
-- migrations/0009_saas_billing.sql
-- ====================================================================
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


-- ====================================================================
-- migrations/0010_trial.sql
-- ====================================================================
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

-- ====================================================================
-- seed.sql
-- ====================================================================
-- =====================================================================
-- TOP BURGER OS — DADOS DE DEMONSTRAÇÃO: LEVI BURGUER
-- Todos os dados abaixo são FICTÍCIOS e servem apenas para demonstração.
--
-- Pré-requisito: existir um usuário administrador da plataforma
--   update public.profiles set is_platform_admin = true where email = 'voce@email.com';
-- Esse usuário vira o DONO da organização demo.
-- =====================================================================

create or replace function public.seed_demo_levi(p_owner uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  c_burger uuid; c_smash uuid; c_combo uuid; c_porcao uuid; c_bebida uuid; c_doce uuid;
  -- fornecedores
  s_carne uuid; s_pao uuid; s_bebida uuid;
  -- ingredientes
  i_brioche uuid; i_austr uuid; i_carne uuid; i_smash uuid; i_cheddar uuid; i_bacon uuid; i_cebola uuid;
  i_tomate uuid; i_alface uuid; i_picles uuid; i_molho uuid; i_frango uuid; i_batata uuid; i_cheddar_cr uuid;
  i_ovo uuid; i_coca uuid; i_guarana uuid; i_agua uuid; i_brownie uuid; i_emb uuid;
  -- produtos
  p_especial uuid; p_bacon uuid; p_duplo uuid; p_crispy uuid; p_smash_bacon uuid; p_smash uuid;
  p_combo uuid; p_batata uuid; p_batata_cb uuid; p_coca uuid; p_guarana uuid; p_agua uuid; p_brownie uuid;
  -- grupos / opções
  g_carnes uuid; g_ponto uuid; g_pao uuid; g_retirar uuid; g_add uuid; g_molho_combo uuid;
  m_2c uuid; m_3c uuid; m_austr uuid; m_sem_cebola uuid; m_sem_tomate uuid; m_sem_picles uuid;
  m_bacon uuid; m_cheddar uuid; m_carne uuid; m_ovo uuid; m_molho uuid;
  cg_burger uuid; cg_batata uuid; cg_bebida uuid;
  -- auxiliares
  v_customers uuid[] := '{}';
  v_cust uuid;
  v_zones uuid[];
  v_order public.orders;
  v_when timestamptz;
  v_tz text := 'America/Bahia';
  v_payload jsonb;
  v_items jsonb;
  v_type text;
  v_day int;
  v_n int;
  v_k int;
  v_names text[] := array['Ana Souza','Bruno Lima','Carla Mendes','Diego Rocha','Eduarda Alves','Felipe Santos',
    'Gabriela Reis','Henrique Costa','Isabela Nunes','João Pedro','Karina Dias','Lucas Ferreira','Mariana Gomes',
    'Nicolas Barros','Olívia Martins','Paulo Ribeiro','Queila Moraes','Rafael Teixeira','Sabrina Lopes','Thiago Pires',
    'Úrsula Castro','Vinícius Melo','Wesley Cardoso','Yasmin Freitas','Zeca Almeida'];
  v_districts text[] := array['Centro','Jardim Primavera','Vila Nova','Alto da Colina'];
begin
  perform setseed(0.42);
  if p_owner is null then raise exception 'Informe o usuário dono da demo'; end if;
  if exists (select 1 from public.organizations where slug = 'leviburguer') then
    raise notice 'Demo já existe (slug leviburguer)';
    return (select id from public.organizations where slug = 'leviburguer');
  end if;

  v_org := public._provision_organization('Levi Burguer', 'leviburguer', p_owner, 'PREMIUM', 14, 'active');

  update public.organizations set
    description = 'Hamburgueria artesanal · burger feito na brasa. [DADOS DE DEMONSTRAÇÃO]',
    legal_name = 'Levi Burguer Demonstração LTDA', cnpj = '00.000.000/0001-00',
    email = 'contato@demo.topburger.app', phone = '71900000000', whatsapp = '71900000000', instagram = 'leviburguer',
    address_zip = '40000000', address_street = 'Rua da Demonstração', address_number = '100',
    address_district = 'Centro', address_city = 'Salvador', address_state = 'BA',
    logo_url = '/demo/levi-logo.svg', banner_url = '/demo/levi-banner.svg',
    primary_color = '#E9B10C', secondary_color = '#1A2B57',
    store_mode = 'open', allow_scheduling = true, min_order_value = 20,
    pickup_eta_min = 20, pickup_eta_max = 30,
    pix_key = 'pix@demo.topburger.app', pix_key_type = 'email', pix_holder_name = 'LEVI BURGUER DEMO', pix_city = 'SALVADOR',
    onboarding_step = 6, onboarding_completed_at = now(), timezone = v_tz
  where id = v_org;

  -- horários reais da casa: sexta a domingo, 18h às 23h30
  delete from public.opening_hours where organization_id = v_org;
  insert into public.opening_hours (organization_id, weekday, opens_at, closes_at)
  values (v_org, 5, '18:00', '23:30'), (v_org, 6, '18:00', '23:30'), (v_org, 0, '18:00', '23:30');

  select id into c_burger from public.categories where organization_id = v_org and name = 'Hambúrgueres';
  select id into c_smash from public.categories where organization_id = v_org and name = 'Smash';
  select id into c_combo from public.categories where organization_id = v_org and name = 'Combos';
  select id into c_porcao from public.categories where organization_id = v_org and name = 'Porções';
  select id into c_bebida from public.categories where organization_id = v_org and name = 'Bebidas';
  select id into c_doce from public.categories where organization_id = v_org and name = 'Sobremesas';
  update public.categories set description = 'Blend artesanal na brasa, pão brioche selado na manteiga' where id = c_burger;
  update public.categories set description = 'Prensado na chapa, crosta caramelizada' where id = c_smash;

  -- fornecedores
  insert into public.suppliers (organization_id, name, cnpj, phone, whatsapp, products_text, notes) values
    (v_org, 'Frigorífico Demo Ltda', '11.111.111/0001-11', '7130000001', '71900000001', 'Blend bovino, bacon, frango', 'Entrega terça e quinta')
    returning id into s_carne;
  insert into public.suppliers (organization_id, name, cnpj, phone, whatsapp, products_text) values
    (v_org, 'Panificadora Demo', '22.222.222/0001-22', '7130000002', '71900000002', 'Pão brioche, pão australiano')
    returning id into s_pao;
  insert into public.suppliers (organization_id, name, cnpj, phone, whatsapp, products_text) values
    (v_org, 'Distribuidora de Bebidas Demo', '33.333.333/0001-33', '7130000003', '71900000003', 'Refrigerantes, água')
    returning id into s_bebida;

  -- ingredientes (saldo começa em 0; entradas abaixo)
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Pão brioche', 'un', 40, s_pao) returning id into i_brioche;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Pão australiano', 'un', 15, s_pao) returning id into i_austr;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Blend bovino', 'g', 5000, s_carne) returning id into i_carne;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Blend smash', 'g', 3000, s_carne) returning id into i_smash;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Cheddar fatiado', 'fatia', 60) returning id into i_cheddar;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Bacon', 'g', 1500, s_carne) returning id into i_bacon;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Cebola', 'g', 1000) returning id into i_cebola;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Tomate', 'g', 1000) returning id into i_tomate;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Alface', 'g', 500) returning id into i_alface;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Picles', 'g', 300) returning id into i_picles;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Molho da casa', 'g', 1000) returning id into i_molho;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Filé de frango empanado', 'un', 15, s_carne) returning id into i_frango;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Batata pré-frita', 'g', 5000) returning id into i_batata;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Cheddar cremoso', 'g', 1000) returning id into i_cheddar_cr;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Ovo', 'un', 24) returning id into i_ovo;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Coca-Cola lata 350ml', 'un', 24, s_bebida) returning id into i_coca;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Guaraná lata 350ml', 'un', 24, s_bebida) returning id into i_guarana;
  insert into public.ingredients (organization_id, name, unit, min_qty, supplier_id) values (v_org, 'Água mineral 500ml', 'un', 12, s_bebida) returning id into i_agua;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Brownie', 'un', 6) returning id into i_brownie;
  insert into public.ingredients (organization_id, name, unit, min_qty) values (v_org, 'Embalagem delivery', 'un', 50) returning id into i_emb;

  -- entradas de estoque (atualizam saldo e custo médio via trigger)
  insert into public.inventory_movements (organization_id, ingredient_id, type, quantity, unit_cost, supplier_id, notes, occurred_at) values
    (v_org, i_brioche, 'in', 600, 1.20, s_pao, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_austr, 'in', 150, 1.55, s_pao, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_carne, 'in', 90000, 0.046, s_carne, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_smash, 'in', 40000, 0.042, s_carne, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_cheddar, 'in', 1500, 0.55, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_bacon, 'in', 22000, 0.062, s_carne, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_cebola, 'in', 12000, 0.008, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_tomate, 'in', 9000, 0.011, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_alface, 'in', 4000, 0.02, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_picles, 'in', 3000, 0.03, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_molho, 'in', 14000, 0.018, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_frango, 'in', 140, 3.20, s_carne, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_batata, 'in', 60000, 0.018, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_cheddar_cr, 'in', 9000, 0.04, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_ovo, 'in', 180, 0.70, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_coca, 'in', 300, 3.20, s_bebida, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_guarana, 'in', 240, 2.80, s_bebida, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_agua, 'in', 120, 1.10, s_bebida, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_brownie, 'in', 60, 3.50, null, 'Carga inicial (demo)', now() - interval '31 days'),
    (v_org, i_emb, 'in', 900, 0.90, null, 'Carga inicial (demo)', now() - interval '31 days');

  -- grupos de opções reutilizáveis
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort) values
    (v_org, 'Escolha a carne', 'variation', 1, 1, 1) returning id into g_carnes;
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort) values
    (v_org, 'Escolha o ponto', 'variation', 1, 1, 2) returning id into g_ponto;
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort) values
    (v_org, 'Tipo de pão', 'variation', 1, 1, 3) returning id into g_pao;
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort, description) values
    (v_org, 'Retirar ingredientes', 'removal', 0, 3, 4, 'Marque o que você NÃO quer') returning id into g_retirar;
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort) values
    (v_org, 'Adicione mais', 'addon', 0, 6, 5) returning id into g_add;
  insert into public.modifier_groups (organization_id, name, kind, min_select, max_select, sort) values
    (v_org, 'Molho do combo', 'variation', 1, 1, 6) returning id into g_molho_combo;

  insert into public.modifiers (organization_id, group_id, name, price_delta, is_default, sort) values (v_org, g_carnes, '1 carne', 0, true, 1);
  insert into public.modifiers (organization_id, group_id, name, price_delta, sort) values (v_org, g_carnes, '2 carnes', 8, 2) returning id into m_2c;
  insert into public.modifiers (organization_id, group_id, name, price_delta, sort) values (v_org, g_carnes, '3 carnes', 15, 3) returning id into m_3c;
  insert into public.modifiers (organization_id, group_id, name, sort) values (v_org, g_ponto, 'Mal passada', 1), (v_org, g_ponto, 'Bem passada', 3);
  insert into public.modifiers (organization_id, group_id, name, is_default, sort) values (v_org, g_ponto, 'Ao ponto', true, 2);
  insert into public.modifiers (organization_id, group_id, name, is_default, sort) values (v_org, g_pao, 'Pão brioche', true, 1);
  insert into public.modifiers (organization_id, group_id, name, price_delta, sort) values (v_org, g_pao, 'Pão australiano', 2, 2) returning id into m_austr;
  insert into public.modifiers (organization_id, group_id, name, sort) values (v_org, g_retirar, 'Sem cebola', 1) returning id into m_sem_cebola;
  insert into public.modifiers (organization_id, group_id, name, sort) values (v_org, g_retirar, 'Sem tomate', 2) returning id into m_sem_tomate;
  insert into public.modifiers (organization_id, group_id, name, sort) values (v_org, g_retirar, 'Sem picles', 3) returning id into m_sem_picles;
  insert into public.modifiers (organization_id, group_id, name, price_delta, max_quantity, sort) values (v_org, g_add, 'Bacon extra', 5, 3, 1) returning id into m_bacon;
  insert into public.modifiers (organization_id, group_id, name, price_delta, max_quantity, sort) values (v_org, g_add, 'Cheddar', 4, 2, 2) returning id into m_cheddar;
  insert into public.modifiers (organization_id, group_id, name, price_delta, max_quantity, sort) values (v_org, g_add, 'Carne extra', 9, 2, 3) returning id into m_carne;
  insert into public.modifiers (organization_id, group_id, name, price_delta, sort) values (v_org, g_add, 'Ovo', 3, 4) returning id into m_ovo;
  insert into public.modifiers (organization_id, group_id, name, price_delta, sort) values (v_org, g_add, 'Molho especial', 2, 5) returning id into m_molho;
  insert into public.modifiers (organization_id, group_id, name, is_default, sort) values
    (v_org, g_molho_combo, 'Maionese verde', true, 1), (v_org, g_molho_combo, 'Barbecue', false, 2), (v_org, g_molho_combo, 'Cheddar', false, 3);

  -- ficha técnica dos adicionais (negativo = remoção devolve ao estoque)
  insert into public.modifier_recipes (organization_id, modifier_id, ingredient_id, quantity) values
    (v_org, m_2c, i_carne, 180), (v_org, m_3c, i_carne, 360),
    (v_org, m_austr, i_austr, 1), (v_org, m_austr, i_brioche, -1),
    (v_org, m_sem_cebola, i_cebola, -20), (v_org, m_sem_tomate, i_tomate, -20), (v_org, m_sem_picles, i_picles, -10),
    (v_org, m_bacon, i_bacon, 30), (v_org, m_cheddar, i_cheddar, 1), (v_org, m_carne, i_carne, 180),
    (v_org, m_ovo, i_ovo, 1), (v_org, m_molho, i_molho, 20);

  -- produtos
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, prep_minutes, is_featured, sort)
  values (v_org, c_burger, 'Levi Especial', 'O carro-chefe da casa: blend 180 g na brasa, cheddar duplo, bacon crocante e cebola caramelizada no brioche.',
          'Pão brioche, blend bovino 180 g, 2 fatias de cheddar, bacon, cebola caramelizada, tomate, picles, molho da casa', 32.90, 15, true, 1)
  returning id into p_especial;
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, prep_minutes, sort)
  values (v_org, c_burger, 'Levi Bacon', 'Blend 180 g, muito bacon, cheddar e molho da casa.',
          'Pão brioche, blend bovino 180 g, 2 fatias de cheddar, bacon 50 g, molho da casa', 31.90, 15, 2)
  returning id into p_bacon;
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, promo_price, prep_minutes, is_featured, sort)
  values (v_org, c_burger, 'Cheddar Duplo', 'Duas carnes de 120 g, quatro fatias de cheddar derretido. Simples e perigoso.',
          'Pão brioche, 2 blends de 120 g, 4 fatias de cheddar, cebola, molho da casa', 34.90, 29.90, 15, true, 3)
  returning id into p_duplo;
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, prep_minutes, sort)
  values (v_org, c_burger, 'Frango Crispy', 'Filé de frango empanado crocante, alface, tomate e maionese da casa.',
          'Pão brioche, filé de frango empanado, alface, tomate, molho da casa', 27.90, 12, 4)
  returning id into p_crispy;
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, prep_minutes, is_featured, sort)
  values (v_org, c_smash, 'Smash Bacon', 'Dois smashes de 90 g com crosta, cheddar e bacon.',
          'Pão brioche, 2 smashes de 90 g, 2 fatias de cheddar, bacon', 24.90, 10, true, 1)
  returning id into p_smash_bacon;
  insert into public.products (organization_id, category_id, name, description, ingredients_text, price, prep_minutes, sort)
  values (v_org, c_smash, 'Smash Clássico', 'Um smash de 90 g, cheddar, cebola e picles.',
          'Pão brioche, smash 90 g, cheddar, cebola, picles', 19.90, 10, 2)
  returning id into p_smash;
  insert into public.products (organization_id, category_id, type, name, description, price, prep_minutes, is_featured, sort)
  values (v_org, c_combo, 'combo', 'Combo Levi', 'Escolha seu burger + batata frita + bebida. O pedido completo com preço de amigo.', 44.90, 18, true, 1)
  returning id into p_combo;
  insert into public.products (organization_id, category_id, name, description, price, prep_minutes, sort)
  values (v_org, c_porcao, 'Batata frita', 'Porção individual, sequinha e crocante, com sal da casa.', 14.90, 8, 1)
  returning id into p_batata;
  insert into public.products (organization_id, category_id, name, description, price, prep_minutes, sort)
  values (v_org, c_porcao, 'Batata cheddar e bacon', 'Batata frita coberta com cheddar cremoso e bacon em cubos.', 22.90, 10, 2)
  returning id into p_batata_cb;
  insert into public.products (organization_id, category_id, name, price, sort) values (v_org, c_bebida, 'Coca-Cola lata', 6.00, 1) returning id into p_coca;
  insert into public.products (organization_id, category_id, name, price, sort) values (v_org, c_bebida, 'Guaraná lata', 5.50, 2) returning id into p_guarana;
  insert into public.products (organization_id, category_id, name, price, sort) values (v_org, c_bebida, 'Água mineral', 3.50, 3) returning id into p_agua;
  insert into public.products (organization_id, category_id, name, description, price, sort)
  values (v_org, c_doce, 'Brownie', 'Brownie de chocolate meio amargo, casquinha crocante.', 12.90, 1) returning id into p_brownie;

  -- fotos (ilustrações SVG temporárias; troque por fotos reais no painel)
  insert into public.product_images (organization_id, product_id, url, sort) values
    (v_org, p_especial, '/demo/levi-especial.svg', 0), (v_org, p_especial, '/demo/levi-especial-2.svg', 1),
    (v_org, p_bacon, '/demo/levi-bacon.svg', 0), (v_org, p_duplo, '/demo/cheddar-duplo.svg', 0),
    (v_org, p_crispy, '/demo/frango-crispy.svg', 0), (v_org, p_smash_bacon, '/demo/smash-bacon.svg', 0),
    (v_org, p_smash, '/demo/smash-classico.svg', 0), (v_org, p_combo, '/demo/combo-levi.svg', 0),
    (v_org, p_batata, '/demo/batata.svg', 0), (v_org, p_batata_cb, '/demo/batata-cheddar.svg', 0),
    (v_org, p_coca, '/demo/lata-vermelha.svg', 0), (v_org, p_guarana, '/demo/lata-verde.svg', 0),
    (v_org, p_agua, '/demo/agua.svg', 0), (v_org, p_brownie, '/demo/brownie.svg', 0);

  -- grupos por produto
  insert into public.product_modifier_groups (organization_id, product_id, group_id, sort)
  select v_org, p, g, s from (values
    (p_especial, g_carnes, 1), (p_especial, g_ponto, 2), (p_especial, g_pao, 3), (p_especial, g_retirar, 4), (p_especial, g_add, 5),
    (p_bacon, g_carnes, 1), (p_bacon, g_ponto, 2), (p_bacon, g_pao, 3), (p_bacon, g_retirar, 4), (p_bacon, g_add, 5),
    (p_duplo, g_ponto, 1), (p_duplo, g_retirar, 2), (p_duplo, g_add, 3),
    (p_crispy, g_retirar, 1), (p_crispy, g_add, 2),
    (p_smash_bacon, g_retirar, 1), (p_smash_bacon, g_add, 2),
    (p_smash, g_retirar, 1), (p_smash, g_add, 2),
    (p_combo, g_molho_combo, 1)
  ) t(p, g, s);

  -- ficha técnica dos produtos
  insert into public.product_recipes (organization_id, product_id, ingredient_id, quantity) values
    (v_org, p_especial, i_brioche, 1), (v_org, p_especial, i_carne, 180), (v_org, p_especial, i_cheddar, 2),
    (v_org, p_especial, i_bacon, 30), (v_org, p_especial, i_cebola, 20), (v_org, p_especial, i_tomate, 20),
    (v_org, p_especial, i_picles, 10), (v_org, p_especial, i_molho, 20), (v_org, p_especial, i_emb, 1),
    (v_org, p_bacon, i_brioche, 1), (v_org, p_bacon, i_carne, 180), (v_org, p_bacon, i_cheddar, 2),
    (v_org, p_bacon, i_bacon, 50), (v_org, p_bacon, i_molho, 20), (v_org, p_bacon, i_emb, 1),
    (v_org, p_duplo, i_brioche, 1), (v_org, p_duplo, i_carne, 240), (v_org, p_duplo, i_cheddar, 4),
    (v_org, p_duplo, i_cebola, 20), (v_org, p_duplo, i_molho, 20), (v_org, p_duplo, i_emb, 1),
    (v_org, p_crispy, i_brioche, 1), (v_org, p_crispy, i_frango, 1), (v_org, p_crispy, i_alface, 15),
    (v_org, p_crispy, i_tomate, 20), (v_org, p_crispy, i_molho, 20), (v_org, p_crispy, i_emb, 1),
    (v_org, p_smash_bacon, i_brioche, 1), (v_org, p_smash_bacon, i_smash, 180), (v_org, p_smash_bacon, i_cheddar, 2),
    (v_org, p_smash_bacon, i_bacon, 30), (v_org, p_smash_bacon, i_emb, 1),
    (v_org, p_smash, i_brioche, 1), (v_org, p_smash, i_smash, 90), (v_org, p_smash, i_cheddar, 1),
    (v_org, p_smash, i_cebola, 15), (v_org, p_smash, i_picles, 10), (v_org, p_smash, i_emb, 1),
    (v_org, p_batata, i_batata, 200), (v_org, p_batata_cb, i_batata, 250), (v_org, p_batata_cb, i_cheddar_cr, 60),
    (v_org, p_batata_cb, i_bacon, 40),
    (v_org, p_coca, i_coca, 1), (v_org, p_guarana, i_guarana, 1), (v_org, p_agua, i_agua, 1), (v_org, p_brownie, i_brownie, 1);

  -- combo: slots
  insert into public.combo_groups (organization_id, combo_product_id, name, min_qty, max_qty, sort) values
    (v_org, p_combo, 'Escolha seu burger', 1, 1, 1) returning id into cg_burger;
  insert into public.combo_groups (organization_id, combo_product_id, name, min_qty, max_qty, sort) values
    (v_org, p_combo, 'Acompanhamento', 1, 1, 2) returning id into cg_batata;
  insert into public.combo_groups (organization_id, combo_product_id, name, min_qty, max_qty, sort) values
    (v_org, p_combo, 'Escolha a bebida', 1, 1, 3) returning id into cg_bebida;
  insert into public.combo_group_options (organization_id, combo_group_id, product_id, price_delta, sort) values
    (v_org, cg_burger, p_especial, 0, 1), (v_org, cg_burger, p_smash_bacon, 0, 2), (v_org, cg_burger, p_crispy, 0, 3),
    (v_org, cg_burger, p_duplo, 3, 4),
    (v_org, cg_batata, p_batata, 0, 1), (v_org, cg_batata, p_batata_cb, 6, 2),
    (v_org, cg_bebida, p_coca, 0, 1), (v_org, cg_bebida, p_guarana, 0, 2), (v_org, cg_bebida, p_agua, 0, 3);

  -- zonas de entrega
  insert into public.delivery_zones (organization_id, name, fee, min_order, eta_min, eta_max, sort) values
    (v_org, 'Centro', 4, 0, 30, 45, 1),
    (v_org, 'Jardim Primavera', 6, 0, 35, 50, 2),
    (v_org, 'Vila Nova', 7, 25, 40, 55, 3),
    (v_org, 'Alto da Colina', 9, 40, 45, 60, 4);
  select array_agg(id order by sort) into v_zones from public.delivery_zones where organization_id = v_org;

  -- mesas
  insert into public.dining_tables (organization_id, label, seats, sort)
  select v_org, 'Mesa ' || lpad(n::text, 2, '0'), case when n <= 4 then 4 else 6 end, n from generate_series(1, 8) n;

  -- entregadores (sem login — cadastre usuários com função Entregador para a tela mobile)
  insert into public.drivers (organization_id, name, phone, vehicle, plate, status) values
    (v_org, 'Carlos (demo)', '71900000011', 'Moto', 'DEM-0A01', 'available'),
    (v_org, 'Rafa (demo)', '71900000012', 'Moto', 'DEM-0B02', 'offline');

  -- cupons
  insert into public.coupons (organization_id, code, description, type, value, min_order, max_uses_per_customer) values
    (v_org, 'LEVI10', '10% de desconto acima de R$ 30', 'percent', 10, 30, 3);
  insert into public.coupons (organization_id, code, description, type, value, first_order_only) values
    (v_org, 'PRIMEIRA', 'R$ 8 de desconto na primeira compra', 'fixed', 8, true);
  insert into public.coupons (organization_id, code, description, type, value, min_order) values
    (v_org, 'FRETEGRATIS', 'Entrega grátis acima de R$ 50', 'free_delivery', 0, 50);
  insert into public.coupons (organization_id, code, description, type, product_id, min_order, max_uses) values
    (v_org, 'BATATAFREE', 'Batata frita grátis acima de R$ 60', 'free_product', p_batata, 60, 100);

  -- fidelidade
  update public.loyalty_programs set is_enabled = true, points_per_real = 1,
    rules_text = 'A cada R$ 1 em pedidos concluídos você ganha 1 ponto.' where organization_id = v_org;
  insert into public.loyalty_rewards (organization_id, name, points_cost, reward_type, product_id, sort) values
    (v_org, 'Batata frita grátis', 100, 'product', p_batata, 1);
  insert into public.loyalty_rewards (organization_id, name, points_cost, reward_type, discount_value, sort) values
    (v_org, 'R$ 15 de desconto', 250, 'discount', 15, 2);
  insert into public.loyalty_rewards (organization_id, name, points_cost, reward_type, product_id, sort) values
    (v_org, 'Levi Especial grátis', 500, 'product', p_especial, 3);

  -- despesas
  insert into public.expenses (organization_id, category, description, amount, due_date, status, paid_at, recurrence) values
    (v_org, 'aluguel', 'Aluguel do ponto', 2500, date_trunc('month', now())::date + 4, 'paid', date_trunc('month', now()) + interval '4 days', 'monthly'),
    (v_org, 'energia', 'Conta de energia', 680, date_trunc('month', now())::date + 14, 'pending', null, 'none'),
    (v_org, 'agua', 'Conta de água', 190, date_trunc('month', now())::date + 14, 'pending', null, 'none'),
    (v_org, 'funcionarios', 'Diárias da equipe (fim de semana)', 1200, current_date - 3, 'paid', now() - interval '3 days', 'weekly'),
    (v_org, 'marketing', 'Impulsionamento Instagram', 300, current_date - 10, 'paid', now() - interval '10 days', 'none'),
    (v_org, 'fornecedores', 'Frigorífico Demo — NF 1234', 1850, current_date - 6, 'paid', now() - interval '6 days', 'none');

  -- clientes fictícios
  for v_n in 1 .. array_length(v_names, 1) loop
    insert into public.customers (organization_id, name, phone, tags, created_at)
    values (v_org, v_names[v_n], '719900000' || lpad(v_n::text, 2, '0'),
            case when v_n % 7 = 0 then array['aniversariante'] when v_n % 5 = 0 then array['prefere-retirada'] else '{}' end,
            now() - make_interval(days => 30 + v_n))
    returning id into v_cust;
    v_customers := v_customers || v_cust;
  end loop;

  -- histórico: ~30 dias de pedidos concluídos (sex/sáb/dom mais fortes)
  for v_day in reverse 30 .. 1 loop
    v_k := case extract(dow from (now() at time zone v_tz)::date - v_day)::int when 5 then 9 when 6 then 12 when 0 then 10 else 2 end;
    for v_n in 1 .. v_k loop
      v_when := (((now() at time zone v_tz)::date - v_day)::timestamp + make_interval(hours => 18 + floor(random() * 5)::int, mins => floor(random() * 59)::int)) at time zone v_tz;
      v_cust := v_customers[1 + floor(random() * array_length(v_customers, 1))::int];
      v_type := case when random() < 0.62 then 'delivery' when random() < 0.7 then 'pickup' else 'dine_in' end;
      v_items := jsonb_build_array(
        jsonb_build_object('product_id', (array[p_especial, p_smash_bacon, p_duplo, p_crispy, p_bacon, p_smash])[1 + floor(random() * 6)::int],
                           'quantity', 1 + floor(random() * 2)::int,
                           'options', '[]'::jsonb));
      -- preenche variações obrigatórias com o padrão
      v_items := (select jsonb_agg(it || jsonb_build_object('options', coalesce((
                    select jsonb_agg(jsonb_build_object('modifier_id', m.id, 'quantity', 1))
                    from public.product_modifier_groups pmg
                    join public.modifier_groups g on g.id = pmg.group_id and g.min_select > 0
                    join public.modifiers m on m.group_id = g.id and m.is_default
                    where pmg.product_id = (it->>'product_id')::uuid), '[]'::jsonb)))
                  from jsonb_array_elements(v_items) it);
      if v_type = 'delivery' or random() < 0.55 then v_items := v_items || jsonb_build_object('product_id', p_batata, 'quantity', 1); end if;
      if random() < 0.7 then v_items := v_items || jsonb_build_object('product_id', (array[p_coca, p_guarana, p_agua])[1 + floor(random() * 3)::int], 'quantity', 1 + floor(random() * 2)::int); end if;
      if random() < 0.12 then v_items := v_items || jsonb_build_object('product_id', p_brownie, 'quantity', 1); end if;

      v_payload := jsonb_build_object(
        'type', v_type, 'items', v_items,
        'customer', jsonb_build_object('name', (select name from public.customers where id = v_cust), 'phone', (select phone from public.customers where id = v_cust)),
        'payment_method', (array['pix', 'pix', 'card', 'cash'])[1 + floor(random() * 4)::int],
        'zone_id', case when v_type = 'delivery' then v_zones[1 + floor(random() * 2)::int] end,
        'address', case when v_type = 'delivery' then jsonb_build_object('street', 'Rua Fictícia ' || (1 + floor(random() * 40)::int), 'number', (10 + floor(random() * 900)::int)::text,
                   'district', v_districts[1 + floor(random() * 4)::int]) end);

      v_order := public._create_order(v_org, v_payload, 'admin', 'confirmed', false);
      update public.orders set status = 'preparing' where id = v_order.id;
      update public.orders set status = 'ready' where id = v_order.id;
      if random() < 0.04 then
        update public.orders set status = 'cancelled', cancel_reason = 'Cliente desistiu (demo)' where id = v_order.id;
      else
        if v_type = 'delivery' then
          update public.orders set driver_id = (select id from public.drivers where organization_id = v_org order by name limit 1) where id = v_order.id;
          update public.orders set status = 'out_for_delivery' where id = v_order.id;
        end if;
        update public.orders set status = 'delivered' where id = v_order.id;
        if v_type = 'dine_in' then update public.orders set payment_status = 'paid' where id = v_order.id; end if;
      end if;

      -- desloca tudo para a data histórica
      update public.orders set created_at = v_when, confirmed_at = v_when + interval '2 min', preparing_at = v_when + interval '4 min',
             ready_at = v_when + interval '19 min', dispatched_at = case when dispatched_at is not null then v_when + interval '22 min' end,
             delivered_at = case when delivered_at is not null then v_when + interval '41 min' end,
             cancelled_at = case when cancelled_at is not null then v_when + interval '10 min' end,
             paid_at = case when paid_at is not null then v_when + interval '41 min' end
      where id = v_order.id;
      update public.order_status_history h set created_at = v_when + make_interval(mins => ((x.rn - 1) * 6)::int)
      from (select id, row_number() over (order by created_at, id) rn from public.order_status_history where order_id = v_order.id) x
      where h.id = x.id;
      update public.financial_entries set occurred_at = v_when + interval '41 min' where order_id = v_order.id;
      update public.inventory_movements set created_at = v_when + interval '2 min', occurred_at = v_when + interval '2 min' where order_id = v_order.id;
      update public.loyalty_transactions set created_at = v_when + interval '41 min' where order_id = v_order.id;
      update public.customers set last_order_at = greatest(coalesce(last_order_at, v_when), v_when),
             first_order_at = least(coalesce(first_order_at, v_when), v_when) where id = v_cust;
    end loop;
  end loop;

  update public.customers c set last_order_at = x.last_at, first_order_at = x.first_at
  from (select customer_id, max(created_at) last_at, min(created_at) first_at from public.orders
        where organization_id = v_org and status = 'delivered' group by customer_id) x
  where x.customer_id = c.id;
  update public.drivers set status = 'available' where organization_id = v_org and name like 'Carlos%';

  -- notificações de boas-vindas
  delete from public.notifications where organization_id = v_org and type in ('new_order', 'low_stock');
  insert into public.notifications (organization_id, type, title, body, link)
  values (v_org, 'system', 'Bem-vindo à demo Levi Burguer', 'Todos os dados desta organização são fictícios.', '/app');

  return v_org;
end $$;

revoke execute on function public.seed_demo_levi(uuid) from public, anon, authenticated;

do $$
declare v_owner uuid;
begin
  select id into v_owner from public.profiles where is_platform_admin order by created_at limit 1;
  if v_owner is null then
    raise notice 'Nenhum administrador da plataforma encontrado. Crie um usuário, marque is_platform_admin = true e rode: select public.seed_demo_levi(''<uuid>'');';
  else
    perform public.seed_demo_levi(v_owner);
    raise notice 'Demo Levi Burguer criada para o usuário %', v_owner;
  end if;
end $$;
