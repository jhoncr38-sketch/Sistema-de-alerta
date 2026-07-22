-- ============================================================
-- ContAlert — Avisos/comunicados (contador manda um recado ao cliente).
-- Rode DEPOIS de 0037_document_first_viewed.sql, no SQL Editor do Supabase.
--
-- Diferente da solicitação (que pede um arquivo), o aviso é só uma mensagem que
-- aparece no portal do cliente (e, opcionalmente, por e-mail). company_id NULO =
-- aviso para TODAS as empresas (global). Só o contador cria/exclui; o cliente lê
-- os da própria empresa + os globais.
-- ============================================================

create table if not exists public.avisos (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade, -- null = todas
  title       text not null,
  message     text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_avisos_company
  on public.avisos(company_id, created_at desc);

alter table public.avisos enable row level security;

drop policy if exists avisos_read on public.avisos;
create policy avisos_read on public.avisos for select
  using (
    public.is_admin()
    or company_id is null
    or public.can_access_company(company_id)
  );

drop policy if exists avisos_admin_write on public.avisos;
create policy avisos_admin_write on public.avisos for all
  using (public.is_admin()) with check (public.is_admin());
