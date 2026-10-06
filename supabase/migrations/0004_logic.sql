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
