-- ============================================================
-- ContAlert — Exigir comprovante para marcar como pago (por documento)
-- Rode DEPOIS de 0013_parcelamento_debito.sql, no SQL Editor do Supabase.
--
-- O contador pode marcar uma guia (boleto/parcela) como "exige comprovante".
-- Quando ligada, o CLIENTE só consegue marcar a guia como paga se o comprovante
-- estiver anexado. O contador (admin) continua podendo marcar sem comprovante —
-- ele é quem definiu a regra. A exigência é enforce no banco (set_document_paid),
-- não só na tela.
-- ============================================================

-- ----- Coluna (default false; guias antigas continuam sem exigência) -----
alter table public.documents
  add column if not exists exige_comprovante boolean not null default false;

-- ============================================================
-- Marca/desmarca como pago, agora exigindo comprovante quando a guia pede.
-- (substitui a versão de 0010_parcelamento.sql)
-- ============================================================
create or replace function public.set_document_paid(doc_id uuid, paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_exige boolean;
  d_comp  text;
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

  -- Cliente só marca pago com o comprovante anexado, quando a guia exige.
  -- O admin (contador) está isento — ele definiu a regra.
  if paid and not public.is_admin() then
    select exige_comprovante, comprovante_path
      into d_exige, d_comp
      from public.documents where id = doc_id;
    if coalesce(d_exige, false) and d_comp is null then
      raise exception 'É necessário anexar o comprovante para marcar como pago.';
    end if;
  end if;

  update public.documents
  set status  = (case when paid then 'paid' else 'open' end)::doc_status,
      paid_at = (case when paid then now() else null end)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');   -- guias a pagar
end $$;
grant execute on function public.set_document_paid(uuid, boolean) to authenticated;

-- ============================================================
-- Liga/desliga a exigência de comprovante de uma guia. Só o contador (admin).
-- ============================================================
create or replace function public.set_document_require_proof(doc_id uuid, value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas o contador pode alterar esta exigência.';
  end if;

  update public.documents
  set exige_comprovante = coalesce(value, false)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');   -- só guias a pagar
end $$;
grant execute on function public.set_document_require_proof(uuid, boolean) to authenticated;
