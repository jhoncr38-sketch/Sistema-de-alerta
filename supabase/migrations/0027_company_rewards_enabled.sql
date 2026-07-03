-- ============================================================
-- ContAlert — ligar/desligar o SJ Rewards por empresa
-- ------------------------------------------------------------
-- Flag por empresa que o contador controla no painel. Quando FALSE, a
-- empresa some do menu "SJ Rewards", a página do clube fica bloqueada e o
-- crédito automático de SJ Coins (guia paga / documento no prazo) para de
-- acontecer — sem apagar nada: saldo, histórico e conquistas ficam guardados
-- e voltam intactos ao reativar. Empresas nascem com o clube LIGADO.
-- ============================================================

alter table public.companies
  add column if not exists rewards_enabled boolean not null default true;
