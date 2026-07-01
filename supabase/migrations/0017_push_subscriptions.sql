-- ============================================================
-- ContAlert — Web Push (assinaturas de notificação do navegador/PWA)
-- Rode DEPOIS de 0016_profile_active.sql, no SQL Editor do Supabase.
--
-- Cada linha é a inscrição de UM aparelho/navegador de um cliente. O envio é
-- feito pelo cron (service role) usando endpoint + as chaves p256dh/auth. Quando
-- o serviço de push responde 404/410 ("assinatura morta"), o servidor apaga a
-- linha sozinho — por isso não há faxina manual.
-- ============================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,                 -- identifica o aparelho no serviço de push
  p256dh      text not null,                        -- chave pública do aparelho (criptografia)
  auth        text not null,                        -- segredo de autenticação do aparelho
  ua          text,                                 -- user-agent (só para diagnóstico)
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subs_profile on public.push_subscriptions(profile_id);

-- ----- RLS: cada cliente gerencia só as próprias assinaturas; admin, todas ----
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
