-- ============================================================
-- ContAlert — SJ Rewards: catálogo de recompensas editável pelo contador.
-- Rode DEPOIS de 0001..0020. Requer is_admin() (0001).
--
-- Até aqui a loja de prêmios (REWARDS) era fixa no código. Agora vira dado no
-- banco: o escritório pode alterar custo/nome/nível/ativar sem mexer no código.
-- A tabela é semeada com os 7 prêmios que já estavam no ar (mesmos ids), então
-- nada muda para o cliente até você editar. O custo do resgate passa a ser lido
-- daqui (autoritativo no servidor) — o cliente nunca decide o preço.
-- ============================================================

create table if not exists public.rewards_catalog (
  id             text primary key,               -- id estável do prêmio (ex.: 'ebook')
  name           text not null,
  description    text not null default '',
  icon           text not null default 'gift',
  cost           integer not null,               -- custo em SJ Coins
  category       text not null default 'servico',-- servico | consultoria | brinde | desconto
  requires_level text,                            -- nível mínimo p/ resgatar (opcional)
  active         boolean not null default true,  -- inativo = some da loja (mantém histórico)
  sort           integer not null default 0,     -- ordem de exibição
  updated_at     timestamptz not null default now(),
  constraint rewards_catalog_cost_pos check (cost > 0)
);

create index if not exists idx_rewards_catalog_active
  on public.rewards_catalog(active, sort);

-- ----- RLS: autenticado lê os ativos; admin lê tudo e escreve -----
alter table public.rewards_catalog enable row level security;

drop policy if exists rewards_catalog_read on public.rewards_catalog;
create policy rewards_catalog_read on public.rewards_catalog for select
  using (public.is_admin() or (active and auth.uid() is not null));

drop policy if exists rewards_catalog_admin_write on public.rewards_catalog;
create policy rewards_catalog_admin_write on public.rewards_catalog for all
  using (public.is_admin()) with check (public.is_admin());

-- ----- Seed: os 7 prêmios que já estavam no código (idempotente) -----
insert into public.rewards_catalog (id, name, description, icon, cost, category, requires_level, sort) values
  ('ebook',       'E-book exclusivo',        'Guia de gestão financeira para o seu negócio',   'ebook',       150,  'servico',     null,       1),
  ('certidao',    'Certidão gratuita',       'Emissão de uma certidão negativa sem custo',      'certificate', 300,  'servico',     null,       2),
  ('mug',         'Caneca personalizada',    'Caneca premium com a marca da sua empresa',       'mug',         500,  'brinde',      null,       3),
  ('diagnostico', 'Diagnóstico financeiro',  'Análise completa dos indicadores da empresa',     'diagnosis',   600,  'consultoria', null,       4),
  ('prioridade',  'Atendimento prioritário', 'Fila preferencial por 30 dias',                   'priority',    700,  'servico',     'ouro',     5),
  ('consultoria', 'Consultoria de 30 min',   'Sessão individual com um especialista',           'consulting',  800,  'consultoria', null,       6),
  ('desconto',    'Desconto em serviços',    'Abatimento na próxima mensalidade',               'discount',    1000, 'desconto',    'diamante', 7)
on conflict (id) do nothing;
