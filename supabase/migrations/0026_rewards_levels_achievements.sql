-- ============================================================
-- ContAlert — SJ Rewards: bônus de nível + conquistas automáticas + level-up.
-- Rode DEPOIS de 0001..0025.
--
-- (2) Nível passa a VALER: crédito de boas ações do dia a dia recebe um bônus de
--     SJ Coins conforme o nível (Diamante +10%, Master +15%, Elite +20%).
-- (1) Conquistas AUTOMÁTICAS: rewards_evaluate() confere condições reais e
--     desbloqueia as medalhas; também detecta quando a empresa subiu de nível
--     (para o app notificar por e-mail). Idempotente.
-- ============================================================

-- Marca até qual nível a empresa já foi avisada (evita reavisar a cada acesso).
alter table public.rewards_accounts
  add column if not exists notified_level_idx integer;

-- Índice do nível a partir do XP (0 = Bronze … 5 = Elite). Espelha LEVELS no código.
create or replace function public.rewards_level_idx(p_xp integer)
returns integer language sql immutable as $$
  select case
    when coalesce(p_xp,0) >= 30000 then 5
    when coalesce(p_xp,0) >= 15000 then 4
    when coalesce(p_xp,0) >=  7000 then 3
    when coalesce(p_xp,0) >=  3000 then 2
    when coalesce(p_xp,0) >=  1000 then 1
    else 0 end;
$$;

-- Multiplicador de SJ Coins por nível (só coins; XP nunca é multiplicado).
create or replace function public.rewards_level_coin_mult(p_xp integer)
returns numeric language sql immutable as $$
  select case
    when coalesce(p_xp,0) >= 30000 then 1.20  -- Elite
    when coalesce(p_xp,0) >= 15000 then 1.15  -- Master
    when coalesce(p_xp,0) >=  7000 then 1.10  -- Diamante
    else 1.00 end;
$$;

-- Crédito de BOA AÇÃO com bônus de nível aplicado às SJ Coins. Igual ao
-- rewards_credit, mas multiplica coins pelo bônus do nível ATUAL da empresa
-- (o nível no momento da ação). Idempotente por dedupe_key. Usado nos créditos
-- automáticos do dia a dia (pagamento em dia, envio de documento). Créditos
-- manuais/estorno continuam no rewards_credit (sem bônus).
create or replace function public.rewards_credit_earned(
  c            uuid,
  p_label      text,
  p_icon       text,
  p_coins      integer,
  p_xp         integer,
  p_action_key text default null,
  p_dedupe_key text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cur_xp  integer;
  mult    numeric;
  boosted integer;
  lbl     text;
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  if coalesce(p_coins, 0) < 0 or coalesce(p_xp, 0) < 0 then
    raise exception 'crédito não pode ser negativo';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  if p_dedupe_key is not null and exists (
    select 1 from public.rewards_ledger where company_id = c and dedupe_key = p_dedupe_key
  ) then
    return;
  end if;

  select xp into cur_xp from public.rewards_accounts where company_id = c for update;
  mult := public.rewards_level_coin_mult(coalesce(cur_xp, 0));
  boosted := floor(coalesce(p_coins, 0) * mult);

  lbl := p_label;
  if boosted > coalesce(p_coins, 0) then
    lbl := p_label || ' (+' || round((mult - 1) * 100) || '% nível)';
  end if;

  insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
  values (c, lbl, coalesce(nullif(p_icon, ''), 'sparkles'),
          boosted, coalesce(p_xp, 0), p_action_key, p_dedupe_key, auth.uid());

  update public.rewards_accounts
     set coins = coins + boosted,
         xp    = xp + coalesce(p_xp, 0),
         updated_at = now()
   where company_id = c;
end $$;

grant execute on function public.rewards_credit_earned(uuid, text, text, integer, integer, text, text) to authenticated;

-- Reescreve register_access para aplicar o bônus de nível ao bônus diário.
create or replace function public.rewards_register_access(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  la date;
  sd integer;
  x  integer;
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

  select last_access, streak_days, xp into la, sd, x
    from public.rewards_accounts where company_id = c for update;

  if la = current_date then
    return; -- já contabilizado hoje
  end if;

  -- Bônus de acesso vem da regra editável 'acessar-app'. Ausente/inativa = sem bônus.
  select coins, xp, active into r_coins, r_xp, r_active
    from public.rewards_earn_rules where key = 'acessar-app';
  if found and r_active then
    b_coins := floor(coalesce(r_coins, 0) * public.rewards_level_coin_mult(coalesce(x, 0)));
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

-- Avalia conquistas + level-up para a empresa. Desbloqueia medalhas cujas
-- condições reais foram atingidas (idempotente) e devolve o que ACABOU de
-- acontecer, para o app notificar: { levelUp: <id do nível ou null>,
-- achievements: [<chaves recém-desbloqueadas>] }.
create or replace function public.rewards_evaluate(c uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_xp integer;
  not_idx integer;
  cur_idx integer;
  v_levelup text := null;
  v_created timestamptz;
  m_start date;
  m_end date;
  v_met text[] := array[]::text[];
  v_new text[] := array[]::text[];
  levels text[] := array['bronze','prata','ouro','diamante','master','elite'];
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  select xp, notified_level_idx into v_xp, not_idx
    from public.rewards_accounts where company_id = c for update;
  v_xp := coalesce(v_xp, 0);
  cur_idx := public.rewards_level_idx(v_xp);

  if not_idx is null then
    -- 1ª avaliação: só registra o nível atual, sem avisar (evita alarme falso).
    update public.rewards_accounts set notified_level_idx = cur_idx where company_id = c;
  elsif cur_idx > not_idx then
    v_levelup := levels[cur_idx + 1];
    update public.rewards_accounts set notified_level_idx = cur_idx where company_id = c;
  end if;

  select created_at into v_created from public.companies where id = c;
  m_start := (date_trunc('month', current_date) - interval '1 month')::date;
  m_end   := (date_trunc('month', current_date) - interval '1 day')::date;

  -- Cliente Ouro: alcançou o nível Ouro (XP >= 3000).
  if v_xp >= 3000 then
    v_met := array_append(v_met, 'cliente-ouro');
  end if;

  -- Parceiro Premium: mais de 2 anos de parceria.
  if v_created is not null and v_created <= now() - interval '2 years' then
    v_met := array_append(v_met, 'parceiro-premium');
  end if;

  -- 12 meses sem atraso: empresa com 1+ ano e nenhuma guia paga com atraso ou
  -- ainda vencida nos últimos 12 meses.
  if v_created is not null and v_created <= now() - interval '12 months'
     and not exists (
       select 1 from public.documents d
       where d.company_id = c and d.categoria in ('boleto','parcelamento')
         and d.due_date is not null
         and d.due_date >= (current_date - interval '12 months')::date
         and ( (d.status = 'open' and d.due_date < current_date)
               or (d.paid_at is not null and d.paid_at::date > d.due_date) )
     ) then
    v_met := array_append(v_met, 'ano-sem-atraso');
  end if;

  -- Empresa Organizada: nos últimos 3 meses houve solicitações e nenhuma foi
  -- enviada com atraso nem ficou pendente após o prazo.
  if exists (
       select 1 from public.document_requests r
       where r.company_id = c and r.due_date is not null
         and r.due_date >= (current_date - interval '3 months')::date
     )
     and not exists (
       select 1 from public.document_requests r
       where r.company_id = c and r.due_date is not null
         and r.due_date >= (current_date - interval '3 months')::date
         and ( (r.status <> 'submitted' and r.due_date < current_date)
               or (r.status = 'submitted' and r.submitted_at is not null
                   and r.submitted_at::date > r.due_date) )
     ) then
    v_met := array_append(v_met, 'empresa-organizada');
  end if;

  -- Empresa Nota 10: fechou o mês passado sem nenhum atraso (com atividade).
  if exists (
       select 1 from public.documents d
       where d.company_id = c and d.categoria in ('boleto','parcelamento')
         and d.due_date between m_start and m_end
     )
     and not exists (
       select 1 from public.documents d
       where d.company_id = c and d.categoria in ('boleto','parcelamento')
         and d.due_date between m_start and m_end
         and ( (d.status = 'open' and d.due_date < current_date)
               or (d.paid_at is not null and d.paid_at::date > d.due_date) )
     ) then
    v_met := array_append(v_met, 'empresa-nota-10');
  end if;

  -- Insere só as que ainda não estavam desbloqueadas; devolve as novas.
  with ins as (
    insert into public.rewards_achievements(company_id, achievement_key)
    select c, k from unnest(v_met) as k
    on conflict (company_id, achievement_key) do nothing
    returning achievement_key
  )
  select coalesce(array_agg(achievement_key), array[]::text[]) into v_new from ins;

  return jsonb_build_object('levelUp', v_levelup, 'achievements', to_jsonb(v_new));
end $$;

grant execute on function public.rewards_evaluate(uuid) to authenticated;
