-- ============================================================
-- ContAlert — Pagamento com confirmação do contador
-- Rode DEPOIS de 0029_documento_descricao.sql, no SQL Editor do Supabase.
--
-- Antes: cliente marcava pago e a guia virava 'paid' na hora. Agora há um passo
-- intermediário. Quando o CLIENTE marca "Já paguei", a guia vai para
-- 'aguardando' (aguardando confirmação do contador). O CONTADOR então confirma
-- (-> 'paid') ou rejeita (-> volta 'open'). Quando o próprio contador marca pago,
-- vai direto para 'paid' — ele já é a confirmação.
--
-- 'marcado_pago_at' guarda QUANDO o cliente declarou o pagamento, para o SJ
-- Rewards julgar "pago em dia" por essa data (e não pela data em que o contador
-- confirmou — o cliente não pode perder a moeda por demora do contador).
-- ============================================================

-- ----- Novo estado intermediário no enum de status -----
alter type doc_status add value if not exists 'aguardando';

-- ----- Quando o cliente declarou o pagamento (base do "em dia") -----
alter table public.documents
  add column if not exists marcado_pago_at timestamptz;

-- ============================================================
-- Marca/desmarca pagamento — agora com o passo de confirmação.
--   • CLIENTE + paid=true  -> 'aguardando' (registra marcado_pago_at)
--   • ADMIN   + paid=true  -> 'paid' direto (o contador é a confirmação)
--   • paid=false           -> volta 'open' e limpa as marcas
-- Mantém a exigência de comprovante para o cliente (regra de 0014).
-- (substitui a versão de 0014_exige_comprovante.sql)
-- ============================================================
create or replace function public.set_document_paid(doc_id uuid, paid boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  is_adm  boolean := public.is_admin();
  d_exige boolean;
  d_comp  text;
begin
  if not (
    is_adm
    or exists (
      select 1 from public.documents d
      where d.id = doc_id and public.can_access_company(d.company_id)
    )
  ) then
    raise exception 'Sem permissão para alterar este documento.';
  end if;

  -- Cliente só declara pago com o comprovante anexado, quando a guia exige.
  -- O admin (contador) está isento — ele definiu a regra.
  if paid and not is_adm then
    select exige_comprovante, comprovante_path
      into d_exige, d_comp
      from public.documents where id = doc_id;
    if coalesce(d_exige, false) and d_comp is null then
      raise exception 'É necessário anexar o comprovante para marcar como pago.';
    end if;
  end if;

  update public.documents
  set status = (
        case
          when not paid then 'open'                 -- desmarcou: volta pra aberto
          when is_adm  then 'paid'                  -- contador marca -> confirmado
          else 'aguardando'                         -- cliente marca -> aguarda confirmação
        end
      )::doc_status,
      -- paid_at só quando de fato confirmado (admin marcando).
      paid_at = (case when paid and is_adm then now() else null end),
      -- Registra quando o cliente declarou o pagamento; limpa ao desmarcar.
      marcado_pago_at = (case when paid then now() else null end)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');   -- guias a pagar
end $$;
grant execute on function public.set_document_paid(uuid, boolean) to authenticated;

-- ============================================================
-- Confirma (ou rejeita) um pagamento declarado pelo cliente. SÓ O CONTADOR.
--   • confirm=true  : 'aguardando'/'open' -> 'paid' (define paid_at)
--   • confirm=false : 'aguardando'        -> 'open' (rejeita a declaração)
-- Preserva marcado_pago_at ao confirmar (o "em dia" usa a data do cliente);
-- limpa ao rejeitar.
-- ============================================================
create or replace function public.confirm_document_payment(doc_id uuid, confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas o contador pode confirmar pagamentos.';
  end if;

  update public.documents
  set status  = (case when confirm then 'paid' else 'open' end)::doc_status,
      paid_at = (case when confirm then now() else null end),
      marcado_pago_at = (case when confirm then marcado_pago_at else null end)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');
end $$;
grant execute on function public.confirm_document_payment(uuid, boolean) to authenticated;
