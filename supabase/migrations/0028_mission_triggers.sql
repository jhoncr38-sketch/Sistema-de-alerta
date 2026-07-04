-- ============================================================
-- ContAlert — SJ Rewards: missões que avançam sozinhas por evento.
-- Rode DEPOIS de 0001..0027. Requer is_admin(), can_access_company(),
-- rewards_credit() (0018) e as tabelas de missões (0020).
--
-- Até aqui o progresso das missões era 100% manual (o contador clicava +/−).
-- Agora uma missão pode declarar um GATILHO: um evento real do portal que
-- avança o progresso em +1 automaticamente, empresa a empresa. Ao bater a meta,
-- credita a recompensa uma única vez (mesma regra da conclusão manual).
--
--   trigger NULL           = manual (comportamento atual)
--   'pagamento_em_dia'     = +1 quando uma guia/parcela é paga na data ou antes
--   'documento_no_prazo'   = +1 quando um documento solicitado é enviado no prazo
--   'acesso_app'           = +1 por dia de acesso ao portal
--
-- Idempotência: cada evento (identificado por uma dedupe_key, ex. 'pago:<id>')
-- avança cada missão no máximo UMA vez — remarcar/reenviar não conta em dobro.
-- O avanço é monotônico: estornar um pagamento NÃO desfaz o progresso da missão
-- (para não anular uma missão que já pagou a recompensa).
-- ============================================================

alter table public.rewards_missions
  add column if not exists trigger text;

-- Dedupe de eventos: avanço exatamente-uma-vez por (missão, empresa, evento).
create table if not exists public.rewards_mission_events (
  mission_id uuid not null references public.rewards_missions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  primary key (mission_id, company_id, dedupe_key)
);

alter table public.rewards_mission_events enable row level security;
drop policy if exists rewards_mission_events_admin on public.rewards_mission_events;
create policy rewards_mission_events_admin on public.rewards_mission_events for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Avanço automático (SECURITY DEFINER). Chamado logo após o evento real
-- (pagamento em dia, envio no prazo, acesso). Valida a permissão por dentro:
-- admin OU quem acessa a empresa. Best-effort no chamador (nunca quebra o fluxo).
-- ============================================================
create or replace function public.rewards_mission_advance(
  c uuid, p_trigger text, p_dedupe_key text
) returns void language plpgsql security definer set search_path = public as $$
declare
  m public.rewards_missions;
  np integer;
  was_completed boolean;
begin
  if c is null or p_trigger is null or p_dedupe_key is null then
    return;
  end if;
  if not (public.is_admin() or public.can_access_company(c)) then
    raise exception 'sem permissão para avançar missões desta empresa';
  end if;

  for m in
    select * from public.rewards_missions
     where active = true
       and trigger = p_trigger
       and (company_id is null or company_id = c)
  loop
    -- Um mesmo evento só avança cada missão uma vez.
    insert into public.rewards_mission_events(mission_id, company_id, dedupe_key)
    values (m.id, c, p_dedupe_key)
    on conflict do nothing;
    if not found then
      continue;
    end if;

    -- Garante a linha de progresso e incrementa (sem passar da meta).
    insert into public.rewards_mission_progress(mission_id, company_id, progress)
    values (m.id, c, 1)
    on conflict (mission_id, company_id) do update
      set progress = least(m.target, rewards_mission_progress.progress + 1),
          updated_at = now();

    select progress, (completed_at is not null)
      into np, was_completed
      from public.rewards_mission_progress
     where mission_id = m.id and company_id = c;

    -- Bateu a meta pela 1ª vez → carimba e credita a recompensa (idempotente).
    if np >= m.target and not was_completed then
      update public.rewards_mission_progress
         set completed_at = now(), updated_at = now()
       where mission_id = m.id and company_id = c;

      perform public.rewards_credit(
        c,
        'Missão concluída: ' || m.title,
        coalesce(nullif(m.icon, ''), 'target'),
        m.coins, m.xp,
        'missao',
        'missao:' || m.id::text || ':' || c::text
      );
    end if;
  end loop;
end $$;

grant execute on function public.rewards_mission_advance(uuid, text, text) to authenticated;
