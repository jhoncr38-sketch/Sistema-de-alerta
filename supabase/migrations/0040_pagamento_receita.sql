-- ============================================================
-- ContAlert — Pagamento confirmado pela Receita (PAGTOWEB)
-- Rode DEPOIS de 0039_rewards_daily_from_rule.sql, no SQL Editor do Supabase.
--
-- Uma rotina diária (/api/cron/pagamentos) consulta na Receita — Integra
-- Contador, serviço PAGTOWEB / PAGAMENTOS71 — os pagamentos de cada cliente e
-- marca como PAGAS as guias federais (DAS, DARF, parcelas) que a Receita já
-- mostra como arrecadadas. Sem o cliente nem o contador precisarem marcar.
-- ============================================================

-- Número do documento de arrecadação (17 dígitos, só números). É a "chave"
-- para achar o pagamento na Receita. Vem do retorno do DAS (GERARDAS12) ou é
-- lido do texto do PDF da guia (DARF, parcela, envio manual, lote).
alter table public.documents
  add column if not exists numero_documento text;

-- De onde veio a confirmação do pagamento:
--   null      = manual (cliente declarou + contador confirmou, ou o contador marcou)
--   'receita' = encontrado na Receita pela rotina automática
alter table public.documents
  add column if not exists pago_origem text;

-- O pagamento que a Receita mostrou (número, data de arrecadação, valor pago,
-- critério usado para casar com a guia). Para conferência do contador.
alter table public.documents
  add column if not exists pagamento_receita jsonb;

create index if not exists documents_numero_documento_idx
  on public.documents (numero_documento)
  where numero_documento is not null;

-- ============================================================
-- can_access_company: as rotinas automáticas do servidor (service role, sem
-- usuário logado) passam a ter acesso — é o que deixa a rotina creditar o SJ
-- Rewards ("guia paga em dia") pelas funções que conferem a empresa. A service
-- role já ignora RLS; isto só alinha as funções SECURITY DEFINER a ela.
-- (substitui a versão de 0007_multi_company.sql)
-- ============================================================
create or replace function public.can_access_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or public.is_admin()
     or exists (
       select 1 from public.client_companies cc
       where cc.profile_id = auth.uid() and cc.company_id = c
     );
$$;

-- ============================================================
-- Marcar/desmarcar à mão (cliente ou contador) e confirmar/rejeitar passam a
-- limpar a origem "receita": a partir dali o status é decisão manual.
-- Mesma regra de 0030_pagamento_confirmacao.sql, só com as 2 colunas novas.
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
          when not paid then 'open'
          when is_adm  then 'paid'
          else 'aguardando'
        end
      )::doc_status,
      paid_at = (case when paid and is_adm then now() else null end),
      marcado_pago_at = (case when paid then now() else null end),
      pago_origem = null,
      pagamento_receita = null
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');
end $$;
grant execute on function public.set_document_paid(uuid, boolean) to authenticated;

create or replace function public.confirm_document_payment(doc_id uuid, confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas o contador pode confirmar pagamentos.';
  end if;

  update public.documents
  set status  = (case when confirm then 'paid' else 'open' end)::doc_status,
      paid_at = (case when confirm then now() else null end),
      marcado_pago_at = (case when confirm then marcado_pago_at else null end),
      pago_origem = null,
      pagamento_receita = null
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');
end $$;
grant execute on function public.confirm_document_payment(uuid, boolean) to authenticated;
