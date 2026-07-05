-- ============================================================
-- ContAlert — Resumo mensal por empresa (gerado por IA + cron)
-- Rode DEPOIS de 0030_pagamento_confirmacao.sql, no SQL Editor do Supabase.
--
-- Guarda o texto do resumo de cada mês por empresa. É escrito pelo cron mensal
-- (service role) e apenas LIDO no portal. Ler do banco (em vez de chamar a IA a
-- cada abertura) mantém o dashboard rápido e faz o resumo aparecer até offline.
-- 1 linha por empresa/mês (competencia no formato "YYYY-MM").
-- ============================================================

create table if not exists public.monthly_summaries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  competencia  text not null,                          -- mês de referência "YYYY-MM"
  texto        text not null,                          -- resumo redigido (pt-BR)
  fonte        text not null default 'ia',             -- 'ia' | 'fallback' (origem do texto)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (company_id, competencia)                     -- 1 resumo por empresa/mês
);

create index if not exists idx_monthly_summaries_company
  on public.monthly_summaries(company_id);

-- ----- RLS: cliente lê o resumo das empresas a que tem acesso; admin lê tudo. -
-- A escrita é feita só pelo cron (service role, que ignora RLS), então não há
-- policy de insert/update para usuários comuns.
alter table public.monthly_summaries enable row level security;

drop policy if exists monthly_summaries_read on public.monthly_summaries;
create policy monthly_summaries_read on public.monthly_summaries for select
  using (public.can_access_company(company_id));
