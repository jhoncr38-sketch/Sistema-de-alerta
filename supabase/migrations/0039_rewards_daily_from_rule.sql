-- ============================================================
-- ContAlert — SJ Rewards: bônus de acesso diário passa a vir da boa ação.
-- Rode DEPOIS de 0018 e 0022 (rewards_earn_rules), no SQL Editor do Supabase.
--
-- Antes: rewards_register_access creditava +20 moedas/XP FIXO no código. Isso
-- divergia do card "Como ganhar" (que já lia o valor editável da tabela
-- rewards_earn_rules e mostrava, por ex., 10). Agora a função LÊ o valor da regra
-- 'acessar-app': o card e o crédito real ficam sempre iguais, e o contador ajusta
-- o valor (ou desliga) pela tela "Boas ações", sem precisar de migration.
--
-- Regras:
--   • regra 'acessar-app' ativa   → credita coins/xp dela;
--   • regra oculta (active=false) → só atualiza a sequência, sem creditar;
--   • regra ausente / pré-0022    → cai no padrão 10/10.
-- A sequência (streak) e o "1x por dia" continuam iguais.
-- ============================================================
create or replace function public.rewards_register_access(c uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  la       date;
  sd       integer;
  r_coins  integer;
  r_xp     integer;
  r_active boolean;
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

  -- Valor do bônus diário: vem da boa ação 'acessar-app' (editável pelo contador).
  select coins, xp, active into r_coins, r_xp, r_active
    from public.rewards_earn_rules where key = 'acessar-app';
  if not found then
    r_coins := 10; r_xp := 10; r_active := true; -- padrão (tabela/regra ausente)
  end if;
  if not coalesce(r_active, true) then
    r_coins := 0; r_xp := 0; -- ação desligada → sem crédito (só atualiza a sequência)
  end if;
  r_coins := coalesce(r_coins, 0);
  r_xp    := coalesce(r_xp, 0);

  update public.rewards_accounts
     set streak_days = case when la = current_date - 1 then coalesce(sd, 0) + 1 else 1 end,
         last_access = current_date,
         coins = coins + r_coins,
         xp    = xp + r_xp,
         updated_at = now()
   where company_id = c;

  -- Só lança no extrato se creditou algo (evita linha "+0" quando a ação está oculta).
  if r_coins <> 0 or r_xp <> 0 then
    insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
    values (c, 'Acesso ao aplicativo', 'smartphone', r_coins, r_xp, 'acessar-app',
            'acesso:' || c::text || ':' || current_date::text, auth.uid());
  end if;
end $$;
