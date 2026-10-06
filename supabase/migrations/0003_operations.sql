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
