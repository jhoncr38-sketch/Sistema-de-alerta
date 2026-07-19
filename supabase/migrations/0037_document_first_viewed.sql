-- ============================================================
-- ContAlert — "Cliente ainda não viu" (confirmação de leitura)
-- Rode DEPOIS de 0036_boleto_reissue_requests.sql, no SQL Editor do Supabase.
--
-- Guarda a PRIMEIRA vez que um CLIENTE abriu/baixou o documento no portal
-- (nível empresa; nulo = ainda não visto). NÃO conta acessos do contador.
-- A escrita acontece na rota de download (/api/documents/[id]/download) via
-- service role — a RLS não deixa o cliente escrever em documents —, então não
-- precisa de policy nova. Documentos antigos ficam com nulo até serem abertos.
-- ============================================================

alter table public.documents
  add column if not exists first_viewed_at timestamptz;

comment on column public.documents.first_viewed_at is
  'Primeira vez que um cliente abriu/baixou o documento no portal (nulo = não visto). Não conta acessos do contador.';
