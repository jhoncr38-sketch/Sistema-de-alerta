-- ============================================================
-- ContAlert — competência como data (integridade + relatórios)
-- Rode DEPOIS de 0002_revenues.sql, no SQL Editor do Supabase ou via
-- `supabase db push`.
--
-- "competencia" continua sendo texto "MM/AAAA" (formato que o contador digita
-- e que aparece na tela). Esta migração adiciona uma coluna DERIVADA do tipo
-- `date` (1º dia do mês), mantida automaticamente pelo Postgres, para ordenar
-- e agregar por mês de forma confiável. É ADITIVA: não altera dados existentes
-- nem quebra o app, que já ordena via parseCompetencia no TypeScript.
-- ============================================================

-- Converte "06/2026" / "6/2026" -> 2026-06-01. Mês fora de 01..12 vira null
-- (não dá erro), então a coluna gerada nunca falha em dados antigos.
create or replace function public.parse_competencia(competencia text)
returns date language sql immutable as $$
  select case
    when competencia ~ '^(0?[1-9]|1[0-2])/\d{4}$'
    then make_date(
      split_part(competencia, '/', 2)::int,  -- ano
      split_part(competencia, '/', 1)::int,  -- mês
      1)
    else null
  end;
$$;

-- Coluna gerada (STORED): calculada a partir de "competencia", sempre em dia.
alter table public.documents
  add column if not exists competencia_month date
  generated always as (public.parse_competencia(competencia)) stored;

alter table public.revenues
  add column if not exists competencia_month date
  generated always as (public.parse_competencia(competencia)) stored;

create index if not exists idx_documents_competencia_month
  on public.documents(competencia_month);
create index if not exists idx_revenues_competencia_month
  on public.revenues(competencia_month);
