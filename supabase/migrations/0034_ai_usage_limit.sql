-- ============================================================
-- ContAlert — teto mensal de uso da IA por empresa (controle de custo)
-- ------------------------------------------------------------
-- Cada pergunta à IA (assistente flutuante ou aba "Converse com sua empresa")
-- conta 1 uso no mês corrente da empresa. Ao atingir o teto, o portal para de
-- chamar a OpenAI (custo zero) e mostra uma mensagem — renova no dia 1º.
--
-- O teto é POR EMPRESA (o contador ajusta): companies.ai_monthly_limit.
--   • valor > 0  = teto de perguntas/mês
--   • valor = 0  = SEM LIMITE (ilimitado) — para clientes premium/VIP
--   • NULL       = usa o padrão global (constante no código: AI_DEFAULT_LIMIT)
-- ============================================================

-- Teto por empresa. NULL => cai no padrão global do código. Empresas nascem
-- com NULL (usam o padrão) — o contador ajusta quando quiser.
alter table public.companies
  add column if not exists ai_monthly_limit integer;

-- Uso acumulado por empresa e mês ("YYYY-MM"). Uma linha por empresa/mês.
create table if not exists public.ai_usage (
  company_id  uuid not null references public.companies(id) on delete cascade,
  month       text not null,                    -- "2026-07"
  count       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (company_id, month)
);

alter table public.ai_usage enable row level security;

-- Leitura: admin tudo; cliente vê o uso das empresas que acessa (para mostrar
-- "restam N perguntas"). Escrita só via a função abaixo (service role/definer).
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select
  using (public.is_admin() or public.can_access_company(company_id));

-- ------------------------------------------------------------
-- Função atômica: confere o teto e, se houver espaço, consome 1 uso.
-- Retorna JSON: { allowed, used, limit, remaining }.
--   limit = 0  => ilimitado (allowed sempre true, não incrementa contador)
-- É a ÚNICA via de escrita em ai_usage. O escopo (companyId correto) é
-- garantido por quem chama (endpoints validam a sessão); usada via service role.
-- ------------------------------------------------------------
create or replace function public.ai_check_and_count(
  c             uuid,
  p_month       text,
  p_default     integer            -- padrão global quando a empresa é NULL
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
begin
  -- Teto efetivo da empresa (NULL => padrão global).
  select coalesce(ai_monthly_limit, p_default) into v_limit
  from public.companies where id = c;
  if v_limit is null then v_limit := p_default; end if;

  -- Ilimitado: libera sem contar.
  if v_limit <= 0 then
    return jsonb_build_object('allowed', true, 'used', 0, 'limit', 0, 'remaining', -1);
  end if;

  -- Garante a linha do mês e TRAVA (for update) para contagem atômica.
  insert into public.ai_usage(company_id, month, count)
  values (c, p_month, 0)
  on conflict (company_id, month) do nothing;

  select count into v_used
  from public.ai_usage
  where company_id = c and month = p_month
  for update;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'remaining', 0);
  end if;

  update public.ai_usage
     set count = count + 1, updated_at = now()
   where company_id = c and month = p_month;

  return jsonb_build_object(
    'allowed', true, 'used', v_used + 1, 'limit', v_limit, 'remaining', v_limit - v_used - 1
  );
end $$;
