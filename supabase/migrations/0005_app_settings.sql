-- ============================================================
-- ContAlert — configurações da marca (nome + logo), editável pelo contador
-- ============================================================

-- Linha única (id fixo) com o nome do app e o caminho do logo no storage.
create table if not exists public.app_settings (
  id          boolean primary key default true check (id),
  brand_name  text not null default 'ContAlert',
  logo_path   text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (id, brand_name)
values (true, 'ContAlert')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Qualquer pessoa lê (precisa aparecer até na tela de login, sem sessão).
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select
  using (true);

-- Só o contador (admin) altera.
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Storage: bucket público 'branding' (logo da empresa)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists branding_admin_write on storage.objects;
create policy branding_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());
