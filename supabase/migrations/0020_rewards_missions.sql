-- ============================================================
-- ContAlert — SJ Rewards: missões criadas pelo contador.
-- Rode DEPOIS de 0001..0019. Requer is_admin(), can_access_company() (0001/0007)
-- e a função rewards_credit() (0018).
--
-- Até aqui a "missão do mês" era automática (enviar os documentos solicitados
-- do mês, calculada em getRewardsState). Agora o escritório pode CRIAR missões
-- próprias (com recompensa, meta e prazo), atribuí-las a todas as empresas ou a
-- uma específica, e acompanhar/concluir o progresso empresa a empresa.
--
-- Modelo de segurança (igual ao resto do sistema):
--   • Cliente SÓ LÊ as missões que lhe cabem (globais ou da própria empresa) e o
--     próprio progresso (RLS + can_access_company).
--   • Só o admin cria/edita/exclui e altera progresso. A conclusão credita a
--     recompensa via rewards_credit (idempotente por dedupe_key) — o cliente
--     nunca escreve saldo direto.
-- ============================================================

-- ----- Tabelas -----

-- Definição da missão. company_id NULL = vale para TODAS as empresas (global);
-- preenchido = missão exclusiva daquela empresa.
create table if not exists public.rewards_missions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,
  title        text not null,
  description  text,
  icon         text not null default 'target',
  coins        integer not null default 0,   -- recompensa em SJ Coins ao concluir
  xp           integer not null default 0,   -- recompensa em XP ao concluir
  target       integer not null default 1,   -- meta (ex.: 3 documentos)
  due_date     date,                          -- prazo (opcional)
  active       boolean not null default true, -- encerrada = false (some do portal)
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint rewards_missions_coins_nonneg  check (coins >= 0),
  constraint rewards_missions_xp_nonneg     check (xp >= 0),
  constraint rewards_missions_target_pos    check (target >= 1)
);

create index if not exists idx_rewards_missions_active
  on public.rewards_missions(active, created_at desc);
create index if not exists idx_rewards_missions_company
  on public.rewards_missions(company_id);

-- Progresso da missão por empresa (uma linha por empresa que já teve avanço).
create table if not exists public.rewards_mission_progress (
  mission_id   uuid not null references public.rewards_missions(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  progress     integer not null default 0,
  completed_at timestamptz,                   -- carimbo ao atingir a meta (crédito 1x)
  updated_at   timestamptz not null default now(),
  primary key (mission_id, company_id),
  constraint rewards_mission_progress_nonneg check (progress >= 0)
);

create index if not exists idx_rewards_mission_progress_company
  on public.rewards_mission_progress(company_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.rewards_missions         enable row level security;
alter table public.rewards_mission_progress enable row level security;

-- Missões: cliente vê as globais (company_id nulo) e as da própria empresa.
drop policy if exists rewards_missions_read on public.rewards_missions;
create policy rewards_missions_read on public.rewards_missions for select
  using (
    public.is_admin()
    or (company_id is null and auth.uid() is not null)
    or public.can_access_company(company_id)
  );
drop policy if exists rewards_missions_admin_write on public.rewards_missions;
create policy rewards_missions_admin_write on public.rewards_missions for all
  using (public.is_admin()) with check (public.is_admin());

-- Progresso: cliente vê só o da(s) empresa(s) que acessa.
drop policy if exists rewards_mission_progress_read on public.rewards_mission_progress;
create policy rewards_mission_progress_read on public.rewards_mission_progress for select
  using (public.is_admin() or public.can_access_company(company_id));
drop policy if exists rewards_mission_progress_admin_write on public.rewards_mission_progress;
create policy rewards_mission_progress_admin_write on public.rewards_mission_progress for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Ajuste/conclusão de progresso (SECURITY DEFINER; só admin).
-- Faz upsert do progresso e, ao atingir a meta pela 1ª vez, carimba a conclusão
-- e credita a recompensa via rewards_credit (idempotente pela dedupe_key). Se o
-- progresso recuar abaixo da meta, apenas limpa o carimbo — o crédito já dado
-- permanece e a dedupe impede pagar de novo numa futura reconclusão.
-- ============================================================
create or replace function public.rewards_mission_set_progress(
  p_mission_id uuid,
  p_company_id uuid,
  p_progress   integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  m public.rewards_missions;
  np integer;
  was_completed boolean;
begin
  if not public.is_admin() then
    raise exception 'apenas o escritório pode alterar missões';
  end if;

  select * into m from public.rewards_missions where id = p_mission_id;
  if m.id is null then
    raise exception 'missão não encontrada';
  end if;
  -- Missão específica só aceita progresso da própria empresa.
  if m.company_id is not null and m.company_id <> p_company_id then
    raise exception 'empresa não elegível para esta missão';
  end if;

  np := greatest(0, coalesce(p_progress, 0));

  insert into public.rewards_mission_progress(mission_id, company_id, progress)
  values (p_mission_id, p_company_id, np)
  on conflict (mission_id, company_id)
  do update set progress = excluded.progress, updated_at = now();

  select completed_at is not null into was_completed
    from public.rewards_mission_progress
    where mission_id = p_mission_id and company_id = p_company_id;

  if np >= m.target and not was_completed then
    update public.rewards_mission_progress
       set completed_at = now(), updated_at = now()
     where mission_id = p_mission_id and company_id = p_company_id;

    perform public.rewards_credit(
      p_company_id,
      'Missão concluída: ' || m.title,
      coalesce(nullif(m.icon, ''), 'target'),
      m.coins, m.xp,
      'missao',
      'missao:' || p_mission_id::text || ':' || p_company_id::text
    );
  elsif np < m.target and was_completed then
    update public.rewards_mission_progress
       set completed_at = null, updated_at = now()
     where mission_id = p_mission_id and company_id = p_company_id;
  end if;
end $$;

grant execute on function public.rewards_mission_set_progress(uuid, uuid, integer) to authenticated;
