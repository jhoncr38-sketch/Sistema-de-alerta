-- ============================================================
-- ContAlert — Descrição livre do documento (tipo "Outro")
-- Rode DEPOIS de 0028_mission_triggers.sql, no SQL Editor do Supabase.
--
-- Quando o contador envia um documento da empresa com tipo "Outro", o rótulo
-- "Outro" não diz nada ao cliente. Esta coluna guarda um texto livre ("Certidão
-- Negativa", "Notificação da Receita"...) que aparece para o cliente na tela de
-- Documentos, ao lado/abaixo do tipo. É opcional; documentos antigos ficam sem.
-- A escrita acontece só no envio (INSERT pela action do contador), então não
-- precisa de função SECURITY DEFINER — a RLS de INSERT já é de admin.
-- ============================================================

alter table public.documents
  add column if not exists descricao text;
