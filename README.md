# ContAlert — Portal de Boletos e Obrigações Contábeis

Plataforma para contadores compartilharem boletos e documentos de impostos com
seus clientes. Os clientes fazem login, baixam os documentos e recebem
**alertas visuais** e **e-mails automáticos** quando o vencimento se aproxima.

- **Contador (admin):** dashboard, aprovação de clientes, vínculo por CNPJ,
  upload de boletos e histórico de alertas.
- **Cliente:** portal com seus boletos, status colorido (vencido / vence hoje /
  próximos dias / pago) e download.
- **Auto-cadastro:** o cliente se cadastra e entra como *pendente* até o contador
  aprovar e vincular à empresa.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · **Supabase**
(Postgres + Auth + Storage, com RLS) · Resend (e-mails) · Vercel (deploy + Cron).

---

## 1. Pré-requisitos

- Node.js 18+ (recomendado 20+)
- Conta gratuita no [Supabase](https://supabase.com)
- (Opcional) Conta no [Resend](https://resend.com) para os e-mails de alerta
- (Opcional) Conta na [Vercel](https://vercel.com) para publicar

## 2. Instalar dependências

```bash
npm install
```

## 3. Criar o projeto no Supabase

1. Crie um projeto novo em [app.supabase.com](https://app.supabase.com).
2. No menu **SQL Editor**, cole e execute o conteúdo de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   (cria as tabelas, funções, RLS e o bucket `boletos`).
3. (Opcional) Execute também [`supabase/seed.sql`](supabase/seed.sql) para criar
   empresas e boletos de exemplo e já ver as telas com dados.
   > Os PDFs dos exemplos não existem no Storage — o botão "Baixar" desses
   > boletos avisa que o arquivo não foi encontrado. Publique um boleto real
   > pela tela **Enviar documento**.

## 4. Configurar variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com os valores do seu projeto
(em **Project Settings → API** no Supabase):

```bash
cp .env.example .env.local
```

| Variável | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role (secreta!) |
| `RESEND_API_KEY` | Painel do Resend (opcional) |
| `EMAIL_FROM` | Ex.: `ContAlert <alertas@seu-dominio.com>` |
| `CRON_SECRET` | Qualquer string aleatória longa |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` em dev |

## 5. Rodar em desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## 6. Criar o primeiro contador (admin)

O **primeiro cadastro** feito no sistema vira automaticamente o **contador
(admin)** já aprovado — basta:

1. Acesse `/register` e cadastre-se com seu e-mail (este é o SEU acesso).
2. Confirme o e-mail (link enviado pelo Supabase) e faça login → você cai no
   painel do contador (`/painel`).

Os cadastros seguintes entram como **cliente pendente**, esperando você aprovar
em **Clientes**.

> Dica: para testar mais rápido sem confirmar e-mail, desligue em
> **Authentication → Sign In / Providers → Email** (Confirm email = off).
>
> Precisa tornar outra conta admin depois? Rode no SQL Editor:
> ```sql
> update public.profiles set role = 'admin', status = 'approved'
> where id = (select id from auth.users where email = 'outro@exemplo.com');
> ```

## 7. Testar o fluxo completo

1. **Como contador:** vá em **Enviar documento**, escolha um cliente, anexe um
   PDF e publique.
2. **Crie um cliente:** abra `/register` em uma janela anônima e cadastre outro
   e-mail.
3. **Aprove:** no painel, em **Clientes**, aprove o cadastro pendente e vincule a
   uma empresa (existente ou nova).
4. **Como cliente:** faça login com a conta do cliente, veja os selos de status e
   baixe o boleto em **Meus boletos**.
5. **RLS:** confirme que um cliente não vê os boletos de outro.

## 8. Alertas por e-mail (Resend)

1. Crie uma conta no Resend e gere uma API key (`RESEND_API_KEY`).
2. Configure um domínio remetente (ou use `onboarding@resend.dev` para testes) em
   `EMAIL_FROM`.
3. Teste o disparo manualmente:

   ```
   http://localhost:3000/api/cron/alerts?secret=SEU_CRON_SECRET
   ```

   Boletos que vencem hoje, em 3 dias ou já vencidos geram um e-mail e ficam
   registrados em **Histórico** / **Notificações** (sem repetir).

## 9. Deploy na Vercel

1. Suba o projeto para o GitHub e importe na Vercel.
2. Em **Settings → Environment Variables**, adicione todas as variáveis do
   `.env.local` (ajuste `NEXT_PUBLIC_SITE_URL` para a URL de produção).
3. O arquivo [`vercel.json`](vercel.json) já agenda o cron diário às 8h:
   `/api/cron/alerts`. A Vercel envia o `CRON_SECRET` automaticamente no header.
4. No Supabase, adicione a URL de produção em **Authentication → URL
   Configuration → Redirect URLs** (ex.: `https://seu-app.vercel.app/auth/confirm`).

---

## Estrutura

```
app/(auth)      Login, cadastro, verificação, reset, "pendente"
app/(admin)     Painel do contador (/painel/*)
app/(client)    Portal do cliente (/portal/*)
app/api         download (signed URL) e cron de alertas
app/auth        confirm (link de e-mail) e signout
components       UI compartilhada (sidebar, status-badge, tabela, etc.)
lib              supabase/ (clients), auth, dates (urgência), email, format
supabase         migrations/ (schema + RLS) e seed.sql
```

## Notas de segurança

- O isolamento por cliente é garantido por **RLS** no Postgres (não só no app):
  cada cliente só lê/baixa os documentos da própria empresa.
- O bucket `boletos` é **privado**; downloads usam URLs assinadas temporárias.
- A `SUPABASE_SERVICE_ROLE_KEY` é usada apenas no servidor (cron) e nunca exposta
  ao navegador.
