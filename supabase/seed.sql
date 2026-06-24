-- ============================================================
-- ContAlert — dados de exemplo (opcional)
-- Rode DEPOIS da migração 0001_init.sql, no SQL Editor do Supabase.
-- Cria empresas e boletos de exemplo cobrindo todos os status.
-- Os vencimentos são relativos a HOJE, então as cores ficam realistas
-- independentemente da data em que você rodar.
--
-- Obs.: os arquivos PDF NÃO existem no Storage (são exemplos só para o
-- visual). O botão "Baixar" desses boletos vai avisar que o arquivo não
-- foi encontrado — é esperado. Publique um boleto real pela tela "Enviar".
-- ============================================================

insert into public.companies (id, razao_social, nome_fantasia, cnpj, email, phone) values
  ('00000000-0000-0000-0000-000000000001','Empresa Alpha Ltda','Alpha','12.345.678/0001-00','financeiro@alpha.com.br','(11) 90000-0001'),
  ('00000000-0000-0000-0000-000000000002','Comércio Beta ME','Beta','23.456.789/0001-11','contato@beta.com.br','(11) 90000-0002'),
  ('00000000-0000-0000-0000-000000000003','Serviços Gamma Ltda','Gamma','34.567.890/0001-22','gamma@gamma.com.br','(11) 90000-0003')
on conflict (id) do nothing;

insert into public.documents (company_id, type, competencia, amount, due_date, status, file_path, file_name) values
  ('00000000-0000-0000-0000-000000000001','das',           '05/2026', 1240.00, current_date - 3,  'open', 'seed/exemplo.pdf', 'DAS-Alpha-052026.pdf'),    -- vencido
  ('00000000-0000-0000-0000-000000000001','darf_irpj',     '05/2026',  890.00, current_date,      'open', 'seed/exemplo.pdf', 'DARF-Alpha-052026.pdf'),   -- vence hoje
  ('00000000-0000-0000-0000-000000000001','gps_inss',      '06/2026',  430.50, current_date + 3,  'open', 'seed/exemplo.pdf', 'GPS-Alpha-062026.pdf'),    -- próximos 3 dias
  ('00000000-0000-0000-0000-000000000002','das',           '05/2026', 2100.00, current_date + 8,  'open', 'seed/exemplo.pdf', 'DAS-Beta-052026.pdf'),     -- próximos 7+ dias
  ('00000000-0000-0000-0000-000000000002','iss',           '05/2026',  320.00, current_date - 1,  'open', 'seed/exemplo.pdf', 'ISS-Beta-052026.pdf'),     -- vencido
  ('00000000-0000-0000-0000-000000000003','darf_piscofins','04/2026',  678.20, current_date - 10, 'paid', 'seed/exemplo.pdf', 'DARF-Gamma-042026.pdf');   -- pago
