-- ============================================================
-- ContAlert — faturamento mensal por empresa (revenues)
-- Rode DEPOIS de 0001_init.sql, no SQL Editor do Supabase ou via
-- `supabase db push`. Alimenta o dashboard de faturamento × carga tributária.
-- ============================================================

-- Faturamento é UM valor por empresa por competência (mês/ano),
-- independentemente de quantos boletos existem naquele mês.
create table if not exists public.revenues (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  competencia  text not null,                              -- "06/2026" (mesmo formato de documents)
  amount       numeric(14,2) not null,                     -- faturamento bruto do mês
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint revenues_competencia_fmt check (competencia ~ '^\d{1,2}/\d{4}$'),
  constraint revenues_amount_pos      check (amount >= 0),
  unique (company_id, competencia)                         -- 1 faturamento por empresa/mês
);

create index if not exists idx_revenues_company on public.revenues(company_id);

-- Mantém updated_at em dia nos upserts/edições.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists revenues_touch_updated_at on public.revenues;
create trigger revenues_touch_updated_at
  before update on public.revenues
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row Level Security (mesmo padrão de documents)
-- ============================================================
alter table public.revenues enable row level security;

-- admin (contador) faz tudo; cliente lê só o faturamento da própria empresa
drop policy if exists revenues_read on public.revenues;
create policy revenues_read on public.revenues for select
  using (public.is_admin() or company_id = public.my_company_id());

drop policy if exists revenues_admin_write on public.revenues;
create policy revenues_admin_write on public.revenues for all
  using (public.is_admin()) with check (public.is_admin());
