-- ============================================================
-- ContAlert — schema inicial (Supabase / Postgres)
-- Rode no SQL Editor do Supabase ou via `supabase db push`.
-- ============================================================

create extension if not exists pgcrypto;

-- ----- Tipos -----
do $$ begin
  create type user_role   as enum ('admin','client');                                            -- admin = contador
  create type user_status as enum ('pending','approved','rejected');                              -- controla o auto-cadastro
  create type doc_type    as enum ('das','darf_irpj','darf_piscofins','gps_inss','iss','fgts','folha','outro');
  create type doc_status  as enum ('open','paid');
exception when duplicate_object then null; end $$;

-- ----- Tabelas -----
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  razao_social  text not null,
  nome_fantasia text,
  cnpj          text unique not null,
  email         text,
  phone         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  role        user_role   not null default 'client',
  status      user_status not null default 'pending',   -- cliente nasce 'pending' até o contador aprovar
  company_id  uuid references public.companies(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  type         doc_type not null,
  competencia  text not null,                            -- "06/2026"
  amount       numeric(12,2) not null,
  due_date     date not null,
  status       doc_status not null default 'open',
  paid_at      timestamptz,
  file_path    text not null,                            -- caminho no bucket 'boletos'
  file_name    text not null,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  channel      text not null,                            -- 'email' | 'portal'
  kind         text not null,                            -- 'vence_hoje' | 'dias_3' | 'vencido'
  sent_at      timestamptz not null default now(),
  unique (document_id, kind)                             -- evita reenviar o mesmo alerta
);

create index if not exists idx_documents_company on public.documents(company_id);
create index if not exists idx_documents_due      on public.documents(due_date);
create index if not exists idx_profiles_company   on public.profiles(company_id);

-- ----- Funções auxiliares (SECURITY DEFINER evita recursão de RLS) -----
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- ----- Cria o profile automaticamente quando um usuário se registra -----
-- O PRIMEIRO usuário cadastrado vira admin (contador) já aprovado.
-- Os demais entram como cliente 'pending', aguardando aprovação.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  has_admin boolean;
begin
  select exists (select 1 from public.profiles where role = 'admin') into has_admin;

  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    new.email,
    (case when has_admin then 'client'  else 'admin'    end)::user_role,
    (case when has_admin then 'pending' else 'approved' end)::user_status
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.companies     enable row level security;
alter table public.profiles      enable row level security;
alter table public.documents     enable row level security;
alter table public.notifications enable row level security;

-- profiles: cada um lê o seu; admin lê/gerencia todos
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- companies: admin tudo; cliente lê só a própria empresa
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select
  using (public.is_admin() or id = public.my_company_id());

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies for all
  using (public.is_admin()) with check (public.is_admin());

-- documents: admin tudo; cliente lê só os da própria empresa
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
  using (public.is_admin() or company_id = public.my_company_id());

drop policy if exists documents_admin_write on public.documents;
create policy documents_admin_write on public.documents for all
  using (public.is_admin()) with check (public.is_admin());

-- notifications: admin tudo; cliente lê as dos documentos da própria empresa
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = notifications.document_id and d.company_id = public.my_company_id()
    )
  );

-- ============================================================
-- Storage: bucket privado 'boletos'
-- Caminho dos arquivos: {company_id}/{document_id}-{arquivo}.pdf
-- ============================================================
insert into storage.buckets (id, name, public)
values ('boletos', 'boletos', false)
on conflict (id) do nothing;

drop policy if exists boletos_admin_all on storage.objects;
create policy boletos_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'boletos' and public.is_admin())
  with check (bucket_id = 'boletos' and public.is_admin());

drop policy if exists boletos_client_read on storage.objects;
create policy boletos_client_read on storage.objects for select to authenticated
  using (
    bucket_id = 'boletos'
    and (storage.foldername(name))[1] = public.my_company_id()::text
  );
