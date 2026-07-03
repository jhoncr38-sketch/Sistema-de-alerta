-- ============================================================
-- ContAlert — Solicitações de documentos (contador pede, cliente envia).
-- Rode DEPOIS de 0001..0018. Fecha o fluxo de "mão dupla": até aqui o contador
-- publicava e o cliente só via. Agora o contador SOLICITA um documento (com prazo)
-- e o cliente ENVIA pelo portal — o que também destrava a missão do mês e o
-- crédito de SJ Coins por "enviar no prazo".
--
-- Arquivos enviados vão no bucket 'boletos' já existente, sob o prefixo
-- {company_id}/solicitacoes/... (a policy de leitura por empresa já cobre isso).
-- Como o cliente não tem INSERT no storage, o upload é feito por server action
-- com a service role; o vínculo é gravado pela função SECURITY DEFINER abaixo.
-- ============================================================

create table if not exists public.document_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  title         text not null,                    -- o que está sendo pedido
  description   text,                             -- instruções (opcional)
  competencia   text,                             -- "MM/YYYY" (opcional)
  due_date      date,                             -- prazo (opcional)
  status        text not null default 'pending',  -- pending | submitted
  file_path     text,                             -- arquivo enviado pelo cliente
  file_name     text,
  submitted_at  timestamptz,
  submitted_by  uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_document_requests_company
  on public.document_requests(company_id, created_at desc);
create index if not exists idx_document_requests_due
  on public.document_requests(due_date);

-- ----- RLS: cliente lê as da própria empresa; só admin cria/edita/exclui -----
alter table public.document_requests enable row level security;

drop policy if exists document_requests_read on public.document_requests;
create policy document_requests_read on public.document_requests for select
  using (public.is_admin() or public.can_access_company(company_id));

drop policy if exists document_requests_admin_write on public.document_requests;
create policy document_requests_admin_write on public.document_requests for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- Envio pelo cliente (SECURITY DEFINER; valida o dono) -----
-- Grava o arquivo enviado e marca como 'submitted'. O upload em si é feito antes,
-- pela service role, no server action.
create or replace function public.submit_document_request(
  p_id uuid, p_path text, p_name text
) returns void language plpgsql security definer set search_path = public as $$
declare
  cc uuid;
begin
  select company_id into cc from public.document_requests where id = p_id;
  if cc is null then
    raise exception 'solicitação não encontrada';
  end if;
  if not public.can_access_company(cc) then
    raise exception 'sem permissão para esta empresa';
  end if;

  update public.document_requests
     set status = 'submitted',
         file_path = p_path,
         file_name = p_name,
         submitted_at = now(),
         submitted_by = auth.uid()
   where id = p_id;
end $$;

grant execute on function public.submit_document_request(uuid, text, text) to authenticated;
