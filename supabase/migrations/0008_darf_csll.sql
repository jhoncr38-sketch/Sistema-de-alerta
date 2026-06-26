-- ============================================================
-- ContAlert — Adiciona o tipo de documento DARF - CSLL.
-- ============================================================

alter type doc_type add value if not exists 'darf_csll';
