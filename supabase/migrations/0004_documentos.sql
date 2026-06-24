-- ============================================================
-- ContAlert — categorias de documento + marcar como pago
-- Rode DEPOIS de 0003_competencia_month.sql, no SQL Editor do Supabase.
--
-- Resolve dois pontos:
--  1) Nem todo documento é "para pagar". Agora há duas categorias:
--       'boleto'    -> tem valor, vencimento, status de pagamento e alertas.
--       'documento' -> relatório fiscal, folha etc. — só para o cliente baixar.
--  2) O cliente pode marcar o próprio boleto como pago (com desfazer).
-- ============================================================

-- ----- Novo tipo de categoria -----
do $$ begin
  create type doc_categoria as enum ('boleto','documento');
exception when duplicate_object then null; end $$;

-- ----- Novo tipo de documento: relatório fiscal -----
-- (folha e outro já existem em doc_type.)
alter type doc_type add value if not exists 'relatorio_fiscal';

-- ----- Coluna de categoria (registros antigos viram 'boleto', que é o certo) -----
alter table public.documents
  add column if not exists categoria doc_categoria not null default 'boleto';

-- ----- valor e vencimento passam a ser OPCIONAIS (só boletos exigem) -----
alter table public.documents alter column amount   drop not null;
alter table public.documents alter column due_date drop not null;

-- ============================================================
-- Marcar como pago (com validação de dono) — SECURITY DEFINER
-- Confina a alteração a status/paid_at e só de boletos da própria empresa
-- (ou qualquer um, se for admin). Evita liberar UPDATE amplo via RLS.
-- ============================================================
create or replace function public.set_document_paid(doc_id uuid, paid boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = doc_id and d.company_id = public.my_company_id()
    )
  ) then
    raise exception 'Sem permissão para alterar este documento.';
  end if;

  update public.documents
  set status  = (case when paid then 'paid' else 'open' end)::doc_status,
      paid_at = (case when paid then now() else null end)
  where id = doc_id
    and categoria = 'boleto';   -- só boletos têm pagamento
end $$;

grant execute on function public.set_document_paid(uuid, boolean) to authenticated;
