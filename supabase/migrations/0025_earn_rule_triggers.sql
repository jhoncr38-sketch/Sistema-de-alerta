-- ============================================================
-- ContAlert — SJ Rewards: vínculo editável tipo de documento → boa ação.
-- Rode DEPOIS de 0001..0024.
--
-- Até aqui, QUAL recompensa um pagamento gera estava fixo no código
-- (mensalidade → honorários; parcela → parcelamento; demais boletos → genérico).
-- Agora esse vínculo vira dado: cada boa ação pode declarar que é disparada ao
-- PAGAR EM DIA um documento de certa categoria/tipo. Assim o contador liga, pela
-- própria tela de "Boas ações", qualquer tipo de imposto (DAS, ISS, Mensalidade…)
-- a qualquer recompensa/valor — sem mexer no código. O gatilho aproveita o "Tipo
-- de imposto" já escolhido no upload do boleto.
--
--   pay_categoria: 'boleto' | 'parcelamento' | null (null = não é automática por pagamento)
--   pay_type:      DocType específico (ex.: 'mensalidade') ou null = qualquer tipo da categoria
-- ============================================================

alter table public.rewards_earn_rules
  add column if not exists pay_categoria text,
  add column if not exists pay_type text;

-- Preserva o comportamento atual: mensalidade → honorários; parcela → parcelamento.
update public.rewards_earn_rules
   set pay_categoria = 'boleto', pay_type = 'mensalidade'
 where key = 'honorarios-em-dia';

update public.rewards_earn_rules
   set pay_categoria = 'parcelamento', pay_type = null
 where key = 'parcelamento-em-dia';
