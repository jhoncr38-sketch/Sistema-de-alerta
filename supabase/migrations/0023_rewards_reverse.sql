-- ============================================================
-- ContAlert — SJ Rewards: estorno (anulação) de crédito.
-- Rode DEPOIS de 0001..0022. Requer can_access_company() (0007).
--
-- Quando uma guia paga é DESMARCADA (o contador/cliente percebeu que marcou por
-- engano), a recompensa que tinha sido creditada precisa ser ANULADA. Esta função
-- localiza o crédito original pelo dedupe_key (ex.: 'pago:{id do documento}'),
-- desfaz o saldo (sem deixar negativo) e REMOVE a linha do extrato — como se o
-- crédito nunca tivesse existido. Assim, se a guia for marcada como paga de novo,
-- o crédito volta a ser concedido normalmente (o dedupe_key fica livre).
--
-- É idempotente: se não houver crédito com aquele dedupe_key, não faz nada.
-- ============================================================
create or replace function public.rewards_reverse_credit(
  c uuid,
  p_dedupe_key text
) returns void language plpgsql security definer set search_path = public as $$
declare
  rec record;
begin
  if not public.can_access_company(c) then
    raise exception 'sem permissão para esta empresa';
  end if;
  if p_dedupe_key is null then
    return;
  end if;

  -- Localiza o crédito original (idempotente: sem linha = nada a estornar).
  select id, coins, xp into rec
    from public.rewards_ledger
    where company_id = c and dedupe_key = p_dedupe_key
    limit 1;
  if not found then
    return;
  end if;

  -- Só estorna créditos (ganhos). Nunca mexe em débitos/resgates.
  if coalesce(rec.coins, 0) < 0 or coalesce(rec.xp, 0) < 0 then
    return;
  end if;

  -- Desfaz o saldo, sem deixar negativo (o cliente pode já ter gastado parte).
  update public.rewards_accounts
     set coins = greatest(0, coins - coalesce(rec.coins, 0)),
         xp    = greatest(0, xp - coalesce(rec.xp, 0)),
         updated_at = now()
   where company_id = c;

  -- Remove a linha do extrato: o crédito é anulado e o dedupe_key fica livre
  -- para um novo crédito caso a guia volte a ser marcada como paga.
  delete from public.rewards_ledger where id = rec.id;
end $$;

grant execute on function public.rewards_reverse_credit(uuid, text) to authenticated;
