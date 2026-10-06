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
