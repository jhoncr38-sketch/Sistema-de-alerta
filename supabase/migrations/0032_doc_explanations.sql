-- ============================================================
-- ContAlert — Explicação de cada tipo de guia (gerada por IA, em cache)
-- Rode DEPOIS de 0031_monthly_summaries.sql, no SQL Editor do Supabase.
--
-- Guarda um texto curto que explica, em linguagem simples, o que é cada TIPO
-- de guia (DAS, DARF, INSS...), pra que serve e o que fazer se atrasar. É o
-- mesmo texto para todas as empresas — não depende de dados do cliente —, então
-- guardamos 1 linha por tipo. Gera pela IA na 1ª vez e reaproveita sempre depois
-- (custo quase zero, resposta instantânea). Escrito só pelo service role e
-- apenas LIDO no portal por qualquer usuário autenticado.
--
-- `doc_type` casa com documents.type (enum de tipos). Não referencia nenhuma
-- empresa: é conhecimento geral sobre o tributo, não um dado privado.
-- ============================================================

create table if not exists public.doc_explanations (
  doc_type     text primary key,                     -- tipo da guia (das, darf_irpj, ...)
  texto        text not null,                         -- explicação redigida (pt-BR)
  fonte        text not null default 'ia',            -- 'ia' | 'fallback' (origem do texto)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----- RLS: qualquer usuário autenticado pode ler (não é dado sensível). ------
-- A escrita é feita só pelo servidor (service role, que ignora RLS), então não
-- há policy de insert/update para usuários comuns.
alter table public.doc_explanations enable row level security;

drop policy if exists doc_explanations_read on public.doc_explanations;
create policy doc_explanations_read on public.doc_explanations for select
  to authenticated
  using (true);
