-- ============================================================
-- ContAlert — SJ Rewards: retirada manual de SJ Coins/XP pelo contador.
-- Rode DEPOIS de 0001..0023. Requer can_access_company() (0007).
--
-- Complementa o rewards_credit (envio). Aqui o admin RETIRA moedas/XP de uma
-- empresa — correção, estorno de bônus dado por engano, etc. Nunca deixa o saldo
-- negativo: retira no máximo o que a empresa tem (o valor efetivamente retirado
-- é o que vai para o extrato, mantendo saldo e extrato sempre coerentes).
-- ============================================================
create or replace function public.rewards_debit(
  c            uuid,
  p_label      text,
  p_icon       text,
  p_coins      integer,
  p_xp         integer,
  p_action_key text default null,
  p_dedupe_key text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cur_coins integer;
  cur_xp    integer;
  rm_coins  integer;
  rm_xp     integer;
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  if coalesce(p_coins, 0) < 0 or coalesce(p_xp, 0) < 0 then
    raise exception 'valores de retirada não podem ser negativos';
  end if;

  insert into public.rewards_accounts(company_id) values (c)
  on conflict (company_id) do nothing;

  -- Idempotência opcional (mesma dedupe_key não retira duas vezes).
  if p_dedupe_key is not null and exists (
    select 1 from public.rewards_ledger
    where company_id = c and dedupe_key = p_dedupe_key
  ) then
    return;
  end if;

  -- Trava a conta e retira no máximo o saldo disponível (nunca negativo).
  select coins, xp into cur_coins, cur_xp
    from public.rewards_accounts where company_id = c for update;

  rm_coins := least(coalesce(p_coins, 0), coalesce(cur_coins, 0));
  rm_xp    := least(coalesce(p_xp, 0), coalesce(cur_xp, 0));

  if rm_coins = 0 and rm_xp = 0 then
    return; -- nada a retirar
  end if;

  update public.rewards_accounts
     set coins = coins - rm_coins,
         xp    = xp - rm_xp,
         updated_at = now()
   where company_id = c;

  insert into public.rewards_ledger(company_id, label, icon, coins, xp, action_key, dedupe_key, created_by)
  values (c, coalesce(nullif(p_label, ''), 'Retirada do escritório'),
          coalesce(nullif(p_icon, ''), 'trending-down'),
          -rm_coins, -rm_xp, p_action_key, p_dedupe_key, auth.uid());
end $$;

grant execute on function public.rewards_debit(uuid, text, text, integer, integer, text, text) to authenticated;
