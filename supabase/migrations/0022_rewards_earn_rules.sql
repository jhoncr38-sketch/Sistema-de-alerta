-- ============================================================
-- ContAlert — SJ Rewards: "boas ações" (Como ganhar SJ Coins) editáveis.
-- Rode DEPOIS de 0001..0021. Requer is_admin()/can_access_company() (0001/0007).
--
-- Os cards de "Como ganhar SJ Coins" (EARN_RULES) eram fixos no código. Agora
-- viram dados: o contador edita valor, oculta ou apaga. E o VALOR do card passa
-- a ser a fonte da verdade — as ações que creditam sozinhas (enviar documento,
-- honorários/parcela em dia, acesso ao app) leem o quanto pagar desta tabela:
--   • editar valor  → muda o crédito;
--   • ocultar/apagar → o crédito automático daquela ação para de acontecer.
-- ============================================================

create table if not exists public.rewards_earn_rules (
  key          text primary key,               -- action_key estável (ex.: 'doc-no-prazo')
  label        text not null,
  description  text not null default '',
  icon         text not null default 'sparkles',
  coins        integer not null default 0,
  xp           integer not null default 0,
  active       boolean not null default true,  -- inativa = some do card E para de creditar
  sort         integer not null default 0,
  updated_at   timestamptz not null default now(),
  constraint rewards_earn_rules_coins_nonneg check (coins >= 0),
  constraint rewards_earn_rules_xp_nonneg    check (xp >= 0)
);

create index if not exists idx_rewards_earn_rules_active
  on public.rewards_earn_rules(active, sort);

-- ----- RLS: qualquer autenticado LÊ (ativas e inativas — não é sensível, e o
-- caminho de crédito precisa ver o flag 'active'); só admin escreve. -----
alter table public.rewards_earn_rules enable row level security;

drop policy if exists rewards_earn_rules_read on public.rewards_earn_rules;
create policy rewards_earn_rules_read on public.rewards_earn_rules for select
  using (auth.uid() is not null);

drop policy if exists rewards_earn_rules_admin_write on public.rewards_earn_rules;
create policy rewards_earn_rules_admin_write on public.rewards_earn_rules for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- Seed: as 10 boas ações que já estavam no código (idempotente) -----
insert into public.rewards_earn_rules (key, label, description, icon, coins, xp, sort) values
  ('doc-no-prazo',        'Enviar documentos',       'Antes do prazo combinado',   'file-check',    100,  100,  1),
  ('honorarios-em-dia',   'Pagar honorários',        'Em dia, sem atraso',         'dollar',        100,  100,  2),
  ('parcelamento-em-dia', 'Pagar parcelamentos',     'Parcela quitada no prazo',   'calendar-check', 80,   80,  3),
  ('atualizar-cadastro',  'Atualizar cadastro',      'Dados da empresa em dia',    'user-edit',      50,   40,  4),
  ('responder-pesquisa',  'Responder pesquisa',      'Feedback de atendimento',    'survey',         50,   40,  5),
  ('acessar-app',         'Acessar o aplicativo',    'Mantém sua sequência ativa', 'smartphone',     20,   20,  6),
  ('video-educativo',     'Assistir vídeos',         'Conteúdo educativo',         'video',          30,   30,  7),
  ('missao-mes',          'Concluir missão do mês',  'Todas as metas do mês',      'target',        300,  250,  8),
  ('ano-sem-atraso',      '12 meses sem atraso',     'Um ano exemplar',            'shield-check',  1000, 1200,  9),
  ('empresa-nota-10',     'Empresa Nota 10',         'Organização impecável',      'star',          500,  600, 10)
on conflict (key) do nothing;

-- ============================================================
-- Reescreve rewards_register_access: o bônus diário de acesso agora vem da regra
-- 'acessar-app' (editável). Regra ativa → usa seu valor; inativa ou apagada → sem
-- bônus (mas a SEQUÊNCIA continua contando normalmente).
-- ============================================================
create or replace function public.rewards_register_access(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  la date;
  sd integer;
  r_coins integer;
  r_xp integer;
  r_active boolean;
  b_coins integer := 0;
  b_xp integer := 0;
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

  -- Bônus de acesso vem da regra editável (ativa). Ausente/inativa = sem bônus.
  select coins, xp, active into r_coins, r_xp, r_active
    from public.rewards_earn_rules where key = 'acessar-app';
  if found and r_active then
    b_coins := coalesce(r_coins, 0);
    b_xp := coalesce(r_xp, 0);
  end if;

  update public.rewards_accounts
     set streak_days = case when la = current_date - 1 then coalesce(sd, 0) + 1 else 1 end,
         last_access = current_date,
         coins = coins + b_coins,
         xp    = xp + b_xp,
         updated_at = now()
   where company_id = c;

  if b_coins > 0 or b_xp > 0 then
    insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
    values (c, 'Acesso ao aplicativo', 'smartphone', b_coins, b_xp, 'acessar-app',
            'acesso:' || c::text || ':' || current_date::text, auth.uid());
  end if;
end $$;

grant execute on function public.rewards_register_access(uuid) to authenticated;
