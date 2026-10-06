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
