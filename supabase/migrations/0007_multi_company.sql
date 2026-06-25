-- ============================================================
-- ContAlert — um cliente pode ver VÁRIAS empresas (N-para-N)
-- Rode DEPOIS de 0001..0006.
-- Regra: SÓ o contador (admin) escolhe quais empresas cada cliente vê.
-- O cliente apenas ALTERNA entre as empresas que recebeu (no portal).
-- ============================================================

-- Tabela de vínculo login(cliente) <-> empresa.
create table if not exists public.client_companies (
  profile_id  uuid not null references public.profiles(id)  on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, company_id)
);

create index if not exists idx_client_companies_company on public.client_companies(company_id);
create index if not exists idx_client_companies_profile on public.client_companies(profile_id);

-- Backfill: todo vínculo único atual (profiles.company_id) vira uma linha aqui.
insert into public.client_companies (profile_id, company_id)
  select id, company_id
  from public.profiles
  where role = 'client' and company_id is not null
  on conflict do nothing;

-- Helper (SECURITY DEFINER evita recursão de RLS): o usuário atual pode ver a
-- empresa c? admin vê tudo; cliente vê se houver vínculo na client_companies.
create or replace function public.can_access_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
     or exists (
       select 1 from public.client_companies cc
       where cc.profile_id = auth.uid() and cc.company_id = c
     );
$$;

-- ----- RLS da nova tabela: cliente lê os próprios vínculos; só admin escreve --
alter table public.client_companies enable row level security;

drop policy if exists client_companies_read on public.client_companies;
create policy client_companies_read on public.client_companies for select
  using (public.is_admin() or profile_id = auth.uid());

drop policy if exists client_companies_admin_write on public.client_companies;
create policy client_companies_admin_write on public.client_companies for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- Atualiza as políticas de leitura para o vínculo N-para-N -----
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select
  using (public.is_admin() or public.can_access_company(id));

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
  using (public.is_admin() or public.can_access_company(company_id));

drop policy if exists revenues_read on public.revenues;
create policy revenues_read on public.revenues for select
  using (public.is_admin() or public.can_access_company(company_id));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = notifications.document_id
        and public.can_access_company(d.company_id)
    )
  );

-- storage: cliente lê arquivos de QUALQUER empresa que pode acessar.
-- (o caminho é sempre {company_id}/arquivo, então o 1º segmento é um uuid)
drop policy if exists boletos_client_read on storage.objects;
create policy boletos_client_read on storage.objects for select to authenticated
  using (
    bucket_id = 'boletos'
    and public.can_access_company(((storage.foldername(name))[1])::uuid)
  );
