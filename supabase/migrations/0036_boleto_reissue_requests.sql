-- ============================================================
-- ContAlert — Pedido de 2ª via de boleto (cliente pede, contador reenvia)
-- Rode DEPOIS de 0035, no SQL Editor do Supabase.
--
-- Quando um boleto vence, o cliente pode pedir a 2ª via pelo portal (um clique,
-- só em guias vencidas). Isso NÃO gera guia sozinho — só registra o pedido e
-- avisa o contador, que emite a 2ª via (ex.: via Receita) e publica. Um pedido
-- por boleto fica "aberto" por vez; ao reenviar, o contador marca como resolvido.
-- ============================================================

create table if not exists public.boleto_reissue_requests (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  status        text not null default 'pending',   -- pending | resolved
  requested_at  timestamptz not null default now(),
  requested_by  uuid references public.profiles(id) on delete set null,
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles(id) on delete set null
);

create index if not exists idx_reissue_company
  on public.boleto_reissue_requests(company_id, requested_at desc);
create index if not exists idx_reissue_status
  on public.boleto_reissue_requests(status);

-- Evita pedidos duplicados: no máximo 1 pedido PENDENTE por boleto.
create unique index if not exists uq_reissue_pending
  on public.boleto_reissue_requests(document_id)
  where status = 'pending';

-- ----- RLS: cliente lê/pede os da própria empresa; admin vê e resolve tudo ----
alter table public.boleto_reissue_requests enable row level security;

drop policy if exists reissue_read on public.boleto_reissue_requests;
create policy reissue_read on public.boleto_reissue_requests for select
  using (public.is_admin() or public.can_access_company(company_id));

drop policy if exists reissue_admin_write on public.boleto_reissue_requests;
create policy reissue_admin_write on public.boleto_reissue_requests for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- Cliente cria o pedido (SECURITY DEFINER; valida dono e boleto vencido) -
-- Idempotente: se já houver um pedido pendente para o boleto, apenas retorna o
-- existente (não duplica). Só permite para boleto/parcela A PAGAR e não paga.
create or replace function public.request_boleto_reissue(p_document_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  d record;
  existing uuid;
  new_id uuid;
begin
  select id, company_id, categoria, status
    into d
    from public.documents
   where id = p_document_id;
  if d.id is null then
    raise exception 'Boleto não encontrado.';
  end if;
  if not public.can_access_company(d.company_id) then
    raise exception 'Sem permissão para esta empresa.';
  end if;
  if d.categoria not in ('boleto', 'parcelamento') then
    raise exception 'Só é possível pedir 2ª via de guias a pagar.';
  end if;
  if d.status = 'paid' then
    raise exception 'Este boleto já está pago.';
  end if;

  -- Já existe um pedido pendente? Reaproveita (não duplica).
  select id into existing
    from public.boleto_reissue_requests
   where document_id = p_document_id and status = 'pending'
   limit 1;
  if existing is not null then
    return existing;
  end if;

  insert into public.boleto_reissue_requests (document_id, company_id, requested_by)
  values (p_document_id, d.company_id, auth.uid())
  returning id into new_id;
  return new_id;
end $$;

grant execute on function public.request_boleto_reissue(uuid) to authenticated;
