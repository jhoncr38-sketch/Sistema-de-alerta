-- ============================================================
-- ContAlert — Folha de pagamento como categoria própria + tipos de
-- documentos institucionais (cartão CNPJ, contrato social, licença, alvará).
--
-- IMPORTANTE: no Postgres, um valor recém-adicionado a um enum NÃO pode ser
-- usado na MESMA transação em que foi criado. Por isso rode o BLOCO 1, e só
-- depois (em outra execução) o BLOCO 2.
-- ============================================================

-- ----------------------------------------------------------------
-- BLOCO 1 — adiciona os novos valores aos enums (rode primeiro, sozinho)
-- ----------------------------------------------------------------
alter type doc_categoria add value if not exists 'folha';

alter type doc_type add value if not exists 'cartao_cnpj';
alter type doc_type add value if not exists 'contrato_social';
alter type doc_type add value if not exists 'licenca';
alter type doc_type add value if not exists 'alvara';

-- ----------------------------------------------------------------
-- BLOCO 2 — usa os novos valores (rode DEPOIS do bloco 1)
-- ----------------------------------------------------------------

-- Folhas já enviadas (type 'folha' na categoria 'documento') migram para a
-- nova categoria 'folha', aparecendo na aba própria do cliente.
update public.documents
  set categoria = 'folha'
  where type = 'folha' and categoria = 'documento';

-- Documentos da empresa (cartão CNPJ, contrato, alvará...) não têm mês de
-- referência — competência passa a ser opcional.
alter table public.documents alter column competencia drop not null;
