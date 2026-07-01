-- ============================================================
-- ContAlert — desativar/reativar acesso de um cliente
-- ------------------------------------------------------------
-- Flag independente do fluxo de aprovação (status). O contador pode
-- DESATIVAR um cliente para bloquear o acesso ao portal sem apagar o
-- cadastro; e REATIVAR quando quiser. Clientes nascem ativos.
-- ============================================================

alter table public.profiles
  add column if not exists active boolean not null default true;
