-- ============================================================
-- ContAlert — Anexar boleto em parcela de débito automático
-- Rode DEPOIS de 0034_ai_usage_limit.sql, no SQL Editor do Supabase.
--
-- No débito automático a parcela nasce SEM boleto (file_path nulo). Quando o
-- débito não cai, o contador precisa anexar o boleto manualmente para o cliente
-- pagar avulso. Esta função grava (ou limpa) o file_path/file_name da parcela,
-- confinando a escrita — só o contador (admin). Espelha set_document_comprovante.
--   path/name nulos => remove o boleto anexado (volta a "sem boleto").
-- ============================================================
create or replace function public.set_parcela_boleto(
  doc_id uuid, path text, name text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Sem permissão para anexar boleto.';
  end if;

  update public.documents
  set file_path = path,
      file_name = name
  where id = doc_id
    and categoria = 'parcelamento';   -- só parcelas recebem boleto por aqui
end $$;

grant execute on function public.set_parcela_boleto(uuid, text, text) to authenticated;
