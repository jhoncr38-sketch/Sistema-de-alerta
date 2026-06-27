-- ============================================================
-- ContAlert — Parcelamentos (REFIS / parcelamento de débitos)
-- Rode DEPOIS de 0001..0009, no SQL Editor do Supabase.
--
-- Modelo: um "parcelamento" (installment_plans) agrupa N parcelas. Cada parcela
-- é um documento normal (categoria 'parcelamento') vinculado ao plano via
-- plan_id, com número da parcela (parcela_num). Assim reaproveitamos download,
-- "marcar como pago", RLS multi-empresa e os alertas de vencimento.
--
-- IMPORTANTE: no Postgres, um valor recém-adicionado a um enum NÃO pode ser
-- usado na MESMA transação em que foi criado. Por isso rode o BLOCO 1, e só
-- depois (em outra execução) o BLOCO 2.
-- ============================================================

-- ----------------------------------------------------------------
-- BLOCO 1 — adiciona o valor 'parcelamento' à categoria (rode sozinho primeiro)
-- ----------------------------------------------------------------
alter type doc_categoria add value if not exists 'parcelamento';

-- ----------------------------------------------------------------
-- BLOCO 2 — usa o novo valor (rode DEPOIS do bloco 1)
-- ----------------------------------------------------------------

-- ----- Tabela "pai": o parcelamento em si -----
create table if not exists public.installment_plans (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  nome        text not null,                 -- título exibido no card (ex.: "Simples Nacional")
  type        doc_type not null,             -- tipo da guia parcelada (das, gps_inss, icms...)
  total       smallint not null check (total > 0),  -- total de parcelas (ex.: 33)
  created_at  timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_installment_plans_company on public.installment_plans(company_id);

-- ----- Vínculo da parcela (documento) ao plano -----
alter table public.documents
  add column if not exists plan_id    uuid references public.installment_plans(id) on delete cascade,
  add column if not exists parcela_num smallint;

create index if not exists idx_documents_plan on public.documents(plan_id);

-- ============================================================
-- RLS da nova tabela: cliente lê os planos das empresas que pode acessar;
-- só admin escreve. (can_access_company veio de 0007_multi_company.sql.)
-- ============================================================
alter table public.installment_plans enable row level security;

drop policy if exists installment_plans_read on public.installment_plans;
create policy installment_plans_read on public.installment_plans for select
  using (public.is_admin() or public.can_access_company(company_id));

drop policy if exists installment_plans_admin_write on public.installment_plans;
create policy installment_plans_admin_write on public.installment_plans for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- "Marcar como pago" passa a valer também para parcelas.
-- Recria a função de 0004 ampliando a categoria permitida.
-- ============================================================
create or replace function public.set_document_paid(doc_id uuid, paid boolean)
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
  set status  = (case when paid then 'paid' else 'open' end)::doc_status,
      paid_at = (case when paid then now() else null end)
  where id = doc_id
    and categoria in ('boleto', 'parcelamento');   -- guias a pagar
end $$;

grant execute on function public.set_document_paid(uuid, boolean) to authenticated;
