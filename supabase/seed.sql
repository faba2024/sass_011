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
