-- Helpers de teste (somente ambiente local)
create schema if not exists tests;
create or replace function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create or replace function tests.eq(p_a anyelement, p_b anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_a is distinct from p_b then raise exception 'FAIL: % (esperado %, obtido %)', p_msg, p_b, p_a; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create or replace function tests.throws(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_pattern || '%' then
      raise notice 'PASS: % → "%"', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % — erro inesperado: %', p_msg, sqlerrm;
  end;
  raise exception 'FAIL: % — deveria ter falhado', p_msg;
end $$;
-- linhas afetadas por um comando (para provar que RLS bloqueia UPDATE/DELETE silenciosamente)
create or replace function tests.affected(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function tests.count(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into n;
  return n;
end $$;
grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;

-- IDs fixos para os testes
create or replace function tests.levi() returns uuid language sql stable security definer as $$ select id from public.organizations where slug = 'leviburguer' $$;
create or replace function tests.product(p_name text) returns uuid language sql stable security definer as $$
  select id from public.products where organization_id = tests.levi() and name = p_name $$;
create or replace function tests.modifier(p_name text) returns uuid language sql stable security definer as $$
  select m.id from public.modifiers m where m.organization_id = tests.levi() and m.name = p_name and m.deleted_at is null limit 1 $$;
create or replace function tests.zone(p_name text) returns uuid language sql stable security definer as $$
  select id from public.delivery_zones where organization_id = tests.levi() and name = p_name $$;
create or replace function tests.stock(p_name text) returns numeric language sql stable security definer as $$
  select stock_qty from public.ingredients where organization_id = tests.levi() and name = p_name $$;
-- payload padrão: Levi Especial com variações obrigatórias
create or replace function tests.especial(p_qty int default 1, p_extra jsonb default '[]') returns jsonb language sql stable security definer as $$
  select jsonb_build_object('product_id', tests.product('Levi Especial'), 'quantity', p_qty,
    'options', jsonb_build_array(
      jsonb_build_object('modifier_id', tests.modifier('1 carne')),
      jsonb_build_object('modifier_id', tests.modifier('Ao ponto')),
      jsonb_build_object('modifier_id', tests.modifier('Pão brioche'))) || p_extra)
$$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
create or replace function tests.cg(p_name text) returns uuid language sql stable security definer as $$
  select id from public.combo_groups where organization_id = tests.levi() and name = p_name $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;
