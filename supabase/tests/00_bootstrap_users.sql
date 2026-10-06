-- Usuários de teste (somente ambiente local)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@topburger.test', '{"full_name":"Admin Plataforma"}'),
  ('00000000-0000-0000-0000-00000000b001', 'dono.brasa@test', '{"full_name":"Dono Brasa"}'),
  ('00000000-0000-0000-0000-00000000a002', 'cozinha.levi@test', '{"full_name":"Cozinheiro Levi"}'),
  ('00000000-0000-0000-0000-00000000a003', 'caixa.levi@test', '{"full_name":"Caixa Levi"}'),
  ('00000000-0000-0000-0000-00000000a004', 'entregador.levi@test', '{"full_name":"Entregador Levi"}'),
  ('00000000-0000-0000-0000-00000000a005', 'atendente.levi@test', '{"full_name":"Atendente Levi"}'),
  ('00000000-0000-0000-0000-00000000a006', 'gerente.levi@test', '{"full_name":"Gerente Levi"}');
update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-00000000a001';
