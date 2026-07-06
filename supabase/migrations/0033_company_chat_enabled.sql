-- ============================================================
-- ContAlert — ligar/desligar a aba "Converse com sua empresa" por empresa
-- ------------------------------------------------------------
-- Flag por empresa que o contador controla no painel. Quando FALSE, o item
-- "Converse com sua empresa" some do menu do portal e a página fica indisponível
-- para aquela empresa. Não afeta o assistente flutuante (botão "Dúvidas?"), que
-- segue disponível em todas as telas — esta flag governa apenas a ABA dedicada.
-- Empresas nascem com a aba LIGADA.
-- ============================================================

alter table public.companies
  add column if not exists chat_enabled boolean not null default true;
