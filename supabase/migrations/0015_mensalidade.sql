-- ============================================================
-- ContAlert — Adiciona o tipo de documento Mensalidade da Contabilidade.
-- ============================================================

alter type doc_type add value if not exists 'mensalidade';
