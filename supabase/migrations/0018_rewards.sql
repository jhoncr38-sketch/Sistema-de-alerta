-- ============================================================
-- ContAlert — SJ Rewards (Clube SJ): gamificação por empresa.
-- Rode DEPOIS de 0001..0017. Requer os helpers is_admin() e
-- can_access_company() (criados em 0001 e 0007).
--
-- Modelo de segurança (igual ao resto do sistema):
--   • Cliente SÓ LÊ os dados das empresas que acessa (RLS + can_access_company).
--   • Escritas do cliente passam por funções SECURITY DEFINER que se
--     autoautorizam — o cliente nunca dá INSERT/UPDATE direto no saldo
--     (senão poderia "fabricar" moedas). Admin escreve tudo.
-- ============================================================

-- ----- Tabelas -----

-- Saldo/estado do clube por empresa (uma linha por empresa).
create table if not exists public.rewards_accounts (
  company_id   uuid primary key references public.companies(id) on delete cascade,
  coins        integer not null default 0,   -- saldo gastável (SJ Coins)
  xp           integer not null default 0,   -- pontuação permanente (nível)
  streak_days  integer not null default 0,   -- dias consecutivos de acesso
  last_access  date,                          -- último dia contabilizado (streak)
  updated_at   timestamptz not null default now(),
  constraint rewards_accounts_coins_nonneg check (coins >= 0),
  constraint rewards_accounts_xp_nonneg    check (xp >= 0)
);

-- Extrato: toda movimentação de moedas/XP (+ganho / -resgate).
create table if not exists public.rewards_ledger (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  label        text not null,                 -- descrição exibida no extrato
  icon         text not null default 'sparkles',
  coins        integer not null default 0,    -- + ganho, - resgate
  xp           integer not null default 0,
  action_key   text,                          -- ex.: 'doc-no-prazo', 'resgate:consultoria'
  dedupe_key   text,                          -- idempotência (opcional)
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Idempotência: uma ação "única" credita no máximo uma vez por empresa.
-- Ex.: acesso do dia, "12 meses sem atraso". dedupe_key nulo = pode repetir.
create unique index if not exists uq_rewards_ledger_dedupe
  on public.rewards_ledger(company_id, dedupe_key)
  where dedupe_key is not null;

-- Índice do extrato: filtra por empresa e ordena por data (o que a tela faz).
create index if not exists idx_rewards_ledger_company_date
  on public.rewards_ledger(company_id, created_at desc);

-- Resgates de prêmios (fila para o escritório entregar).
create table if not exists public.rewards_redemptions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  reward_id    text not null,                 -- id do prêmio no catálogo (lib/rewards.ts)
  cost         integer not null,
  status       text not null default 'pending', -- pending | fulfilled | canceled
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_rewards_redemptions_company
  on public.rewards_redemptions(company_id, created_at desc);

-- Conquistas desbloqueadas (medalhas). A definição fica no código; aqui só o
-- fato de estar desbloqueada e quando.
create table if not exists public.rewards_achievements (
  company_id      uuid not null references public.companies(id) on delete cascade,
  achievement_key text not null,
  unlocked_at     timestamptz not null default now(),
  primary key (company_id, achievement_key)
);

-- ============================================================
-- Row Level Security — cliente LÊ o que pode acessar; só admin escreve direto.
-- (as escritas do cliente acontecem pelas funções SECURITY DEFINER abaixo)
-- ============================================================
alter table public.rewards_accounts     enable row level security;
alter table public.rewards_ledger       enable row level security;
alter table public.rewards_redemptions  enable row level security;
alter table public.rewards_achievements enable row level security;

drop policy if exists rewards_accounts_read on public.rewards_accounts;
create policy rewards_accounts_read on public.rewards_accounts for select
  using (public.is_admin() or public.can_access_company(company_id));
drop policy if exists rewards_accounts_admin_write on public.rewards_accounts;
create policy rewards_accounts_admin_write on public.rewards_accounts for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists rewards_ledger_read on public.rewards_ledger;
create policy rewards_ledger_read on public.rewards_ledger for select
  using (public.is_admin() or public.can_access_company(company_id));
drop policy if exists rewards_ledger_admin_write on public.rewards_ledger;
create policy rewards_ledger_admin_write on public.rewards_ledger for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists rewards_redemptions_read on public.rewards_redemptions;
create policy rewards_redemptions_read on public.rewards_redemptions for select
  using (public.is_admin() or public.can_access_company(company_id));
drop policy if exists rewards_redemptions_admin_write on public.rewards_redemptions;
create policy rewards_redemptions_admin_write on public.rewards_redemptions for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists rewards_achievements_read on public.rewards_achievements;
create policy rewards_achievements_read on public.rewards_achievements for select
  using (public.is_admin() or public.can_access_company(company_id));
drop policy if exists rewards_achievements_admin_write on public.rewards_achievements;
create policy rewards_achievements_admin_write on public.rewards_achievements for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Funções (SECURITY DEFINER) — únicas vias de escrita do cliente.
-- Cada uma valida can_access_company antes de mexer em qualquer coisa.
-- ============================================================

-- Garante que a empresa tem conta no clube (idempotente).
create or replace function public.rewards_ensure_account(c uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;
end $$;

-- Credita uma boa ação (só ganhos, nunca negativo). Idempotente por dedupe_key.
-- É o gancho para premiar eventos existentes (ex.: chamar no toggleDocumentPaid
-- quando um boleto é pago em dia).
create or replace function public.rewards_credit(
  c            uuid,
  p_label      text,
  p_icon       text,
  p_coins      integer,
  p_xp         integer,
  p_action_key text default null,
  p_dedupe_key text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  if coalesce(p_coins, 0) < 0 or coalesce(p_xp, 0) < 0 then
    raise exception 'crédito não pode ser negativo (use rewards_redeem para gastar)';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  -- Já creditado (mesma dedupe_key)? Sai sem duplicar.
  if p_dedupe_key is not null and exists (
    select 1 from public.rewards_ledger
    where company_id = c and dedupe_key = p_dedupe_key
  ) then
    return;
  end if;

  insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
  values (c, p_label, coalesce(nullif(p_icon, ''), 'sparkles'),
          coalesce(p_coins, 0), coalesce(p_xp, 0), p_action_key, p_dedupe_key, auth.uid());

  update public.rewards_accounts
     set coins = coins + coalesce(p_coins, 0),
         xp    = xp + coalesce(p_xp, 0),
         updated_at = now()
   where company_id = c;
end $$;

-- Resgata um prêmio: trava a conta, confere saldo, debita, registra extrato e
-- cria o pedido — tudo atômico. Retorna o novo saldo. O CUSTO é decidido pelo
-- servidor (catálogo no código), nunca pelo cliente.
create or replace function public.rewards_redeem(
  c          uuid,
  p_reward_id text,
  p_cost      integer,
  p_label     text,
  p_icon      text
) returns integer language plpgsql security definer set search_path = public as $$
declare
  bal integer;
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  if coalesce(p_cost, 0) <= 0 then
    raise exception 'custo inválido';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  -- for update: serializa resgates concorrentes e impede saldo negativo.
  select coins into bal from public.rewards_accounts where company_id = c for update;
  if bal < p_cost then
    raise exception 'saldo insuficiente';
  end if;

  update public.rewards_accounts
     set coins = coins - p_cost, updated_at = now()
   where company_id = c;

  insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, created_by)
  values (c, coalesce(nullif(p_label, ''), 'Resgate'),
          coalesce(nullif(p_icon, ''), 'gift'), -p_cost, 0, 'resgate:' || p_reward_id, auth.uid());

  insert into public.rewards_redemptions(company_id, reward_id, cost, status, created_by)
  values (c, p_reward_id, p_cost, 'pending', auth.uid());

  return bal - p_cost;
end $$;

-- Contabiliza o acesso do dia: atualiza a sequência e credita o bônus de acesso
-- (uma vez por dia, via dedupe). Chamado quando o cliente abre a aba.
create or replace function public.rewards_register_access(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  la date;
  sd integer;
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  select last_access, streak_days into la, sd
    from public.rewards_accounts where company_id = c for update;

  if la = current_date then
    return; -- já contabilizado hoje
  end if;

  update public.rewards_accounts
     set streak_days = case when la = current_date - 1 then coalesce(sd, 0) + 1 else 1 end,
         last_access = current_date,
         coins = coins + 20,
         xp    = xp + 20,
         updated_at = now()
   where company_id = c;

  insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
  values (c, 'Acesso ao aplicativo', 'smartphone', 20, 20, 'acessar-app',
          'acesso:' || c::text || ':' || current_date::text, auth.uid());
end $$;

-- Execução liberada para usuários autenticados (as funções já checam permissão
-- por dentro; anon cai no can_access_company = false).
grant execute on function public.rewards_ensure_account(uuid) to authenticated;
grant execute on function public.rewards_credit(uuid, text, text, integer, integer, text, text) to authenticated;
grant execute on function public.rewards_redeem(uuid, text, integer, text, text) to authenticated;
grant execute on function public.rewards_register_access(uuid) to authenticated;
