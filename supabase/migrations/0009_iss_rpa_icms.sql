-- ============================================================
-- ContAlert — Adiciona os tipos de documento ISS - RPA e ICMS.
-- ============================================================

alter type doc_type add value if not exists 'iss_rpa';
alter type doc_type add value if not exists 'icms';
