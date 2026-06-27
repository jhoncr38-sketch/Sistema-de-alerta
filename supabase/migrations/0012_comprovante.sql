-- ============================================================
-- ContAlert — Comprovante de pagamento (opcional)
-- Rode DEPOIS de 0011_parcelamento_modalidade.sql, no SQL Editor do Supabase.
--
-- Quando um boleto (ou parcela) é marcado como pago, o cliente PODE — sem
-- obrigação — anexar o comprovante. O arquivo vai no MESMO bucket 'boletos';
-- aqui guardamos só o caminho/nome/quando. A escrita é confinada por uma
-- função SECURITY DEFINER, espelhando set_document_paid (0010): admin mexe em
-- tudo; cliente, só nas guias das empresas que pode acessar.
-- ============================================================

-- ----- Colunas do comprovante (todas opcionais; guias antigas ficam sem) -----
alter table public.documents
  add column if not exists comprovante_path text,
  add column if not exists comprovante_name text,
  add column if not exists comprovante_at   timestamptz;

-- ============================================================
-- Define ou limpa o comprovante de uma guia, validando o dono.
-- path/name nulos => limpa o vínculo (usado ao remover o comprovante).
-- ============================================================
create or replace function public.set_document_comprovante(
  doc_id uuid, path text, name text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = doc_id and public.can_access_company(d.company_id)
    )
  ) then
    raise exception 'Sem permissão para alterar este documento.';
  end if;

  update public.documents
  set comprovante_path = path,
      comprovante_name = name,
      comprovante_at   = (case when path is null then null else now() end)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');   -- só guias a pagar têm comprovante
end $$;

grant execute on function public.set_document_comprovante(uuid, text, text) to authenticated;
