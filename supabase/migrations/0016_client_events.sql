-- ============================================================
-- ContAlert — Rastreamento de acessos dos clientes ao portal.
-- ============================================================

create table client_events (
  id         uuid        primary key default gen_random_uuid(),
  client_id  uuid        not null references profiles(id) on delete cascade,
  company_id uuid        references companies(id) on delete set null,
  event_type text        not null,
  plan_id    uuid        references installment_plans(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Consultas do painel: último acesso por cliente e histórico por empresa.
create index on client_events (client_id, created_at desc);
create index on client_events (company_id, created_at desc);

alter table client_events enable row level security;

-- Contador vê todos os eventos.
create policy "admin_select_client_events"
  on client_events for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Cliente insere apenas seus próprios eventos.
create policy "client_insert_own_events"
  on client_events for insert
  with check (client_id = auth.uid());
