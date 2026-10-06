# SETUP — TOP BURGER OS

Guia para rodar o sistema do zero: desenvolvimento local, Supabase e deploy na Vercel.

## 1. Requisitos

| Item | Versão |
|---|---|
| Node.js | 20.9 ou superior (testado com 22) |
| npm | 10+ |
| Conta Supabase | plano Free serve para começar |
| Conta Vercel | para produção |
| (opcional) PostgreSQL 16 + `psql` | só para rodar a suíte de testes do banco localmente |

## 2. Instalação

```bash
cd top-burger-os
npm install
cp .env.example .env.local
```

## 3. Criar o projeto no Supabase

1. Em <https://supabase.com/dashboard> → **New project**. Região sugerida: `South America (São Paulo)`.
2. Guarde a senha do banco.
3. Em **Project Settings → API** copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**somente** no `.env.local` e nas variáveis da Vercel; nunca no código, nunca com prefixo `NEXT_PUBLIC_`)

## 4. Variáveis de ambiente (`.env.local`)

| Variável | Exemplo | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcd.supabase.co` | cliente e servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon | cliente e servidor (protegido por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role | **só servidor**: criar login de funcionários e de empresas no master |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | links de e-mail, WhatsApp e QR Code |
| `NEXT_PUBLIC_ROOT_DOMAIN` | vazio em dev; `topburger.app` em produção | subdomínio por loja (`loja.topburger.app`) |

Sem `NEXT_PUBLIC_ROOT_DOMAIN` o cardápio fica em `http://localhost:3000/<slug>`.

## 5. Banco de dados (migrations)

As migrations estão em `supabase/migrations` (0001 a 0010). Escolha **uma** forma:

### Opção A — SQL Editor (mais simples)

```bash
npm run db:bundle      # gera supabase/bundle/schema.sql
```

No Supabase: **SQL Editor → New query**, cole o conteúdo de `supabase/bundle/schema.sql` e clique **Run**. Rode apenas uma vez em projeto novo.

### Opção B — Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

> Não rode `supabase/tests/_supabase_stub.sql` no Supabase. Ele só simula `auth`, `storage` e `realtime` no Postgres local de testes.

O que as migrations criam: tabelas com `organization_id`, RLS em todas, funções de checkout/estoque/caixa/financeiro, publicação Realtime e o bucket público `org-assets` (5 MB, imagens).

## 6. Configurar o Auth

**Authentication → URL Configuration**

- Site URL: o valor de `NEXT_PUBLIC_APP_URL`
- Redirect URLs: `http://localhost:3000/auth/callback` e `https://SEU-DOMINIO/auth/callback`

**Authentication → Email Templates** (recomendado: links funcionam em qualquer navegador/aparelho)

- *Confirm signup* — troque o link por:
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
- *Reset password* — troque o link por:
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha`

Para testar sem e-mail em desenvolvimento: **Authentication → Providers → Email → desligue "Confirm email"**. O cadastro então entra direto no onboarding.

**Importante — e-mails de confirmação:** sem SMTP próprio, o Supabase usa um servidor de teste que **só entrega e-mails para membros da equipe do projeto** e tem limite de poucos envios por hora. Clientes reais **não recebem** a confirmação. Configure um SMTP (Resend, Brevo, Amazon SES, Gmail com senha de app) em **Authentication → Emails → SMTP Settings** antes de abrir o cadastro ao público.

Em produção configure um SMTP próprio (**Project Settings → Auth → SMTP**); o SMTP padrão do Supabase tem limite baixo de envios por hora.

## 7. Realtime

A migration já adiciona as tabelas à publicação `supabase_realtime`. O acompanhamento do pedido pelo cliente usa **Broadcast** em canal público (`order:<token>`). Em **Realtime → Settings**, mantenha **"Allow public access"** habilitado (desligar "private channels only"). Se o Broadcast estiver bloqueado, a página do pedido continua atualizando sozinha a cada 20 segundos.

## 8. Primeiro usuário (administrador da plataforma)

1. **Authentication → Users → Add user → Create new user**: e-mail + senha, marque *Auto Confirm User*.
2. No SQL Editor:

```sql
update public.profiles set is_platform_admin = true where email = 'seu@email.com';
```

Esse usuário acessa `/master` (empresas, planos, faturas, usuários, configurações).

## 9. Dados de demonstração (LEVI BURGUER)

Depois do passo 8, rode no SQL Editor o conteúdo de `supabase/seed.sql`. Ele cria a organização **LEVI BURGUER** (`/leviburguer`) com dono = primeiro admin da plataforma: cardápio com fotos ilustrativas, adicionais, combo, ficha técnica, estoque, zonas de entrega, mesas, entregadores, cupons, fidelidade, 25 clientes e cerca de 160 pedidos históricos. **Todos os dados são fictícios.**

Para criar a demo para outro usuário: `select public.seed_demo_levi('<uuid-do-usuario>');`

## 10. Primeira empresa real

Duas formas:

- **Self-service**: a hamburgueria acessa `/cadastro`, cria conta + loja e cai no onboarding (6 etapas). Plano e dias de teste vêm de **/master/configuracoes**.
- **Pelo master**: `/master/empresas → Nova empresa` cria o login do dono (usa a service role no servidor), a empresa, funções, permissões e a assinatura.

## 11. Desenvolvimento

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # TypeScript
npm run lint         # ESLint (next/core-web-vitals)
npm test             # testes unitários (Node test runner)
```

Para testar o cardápio no celular pela rede local: `npm run dev -- -H 0.0.0.0` e acesse `http://<ip-do-computador>:3000/leviburguer`.

## 12. Build de produção

```bash
npm run build
npm run start
```

## 13. Deploy na Vercel

1. Suba o repositório para o GitHub e importe em <https://vercel.com/new> (framework detectado: Next.js).
2. **Settings → Environment Variables**: as cinco variáveis do passo 4 (Production e Preview). `SUPABASE_SERVICE_ROLE_KEY` sem prefixo público.
3. Deploy.
4. No Supabase, adicione a URL da Vercel em *Site URL* / *Redirect URLs* (passo 6).

### Subdomínio por loja (`loja.seudominio.com`)

1. Na Vercel, **Settings → Domains**: adicione `seudominio.com` e `*.seudominio.com`. Domínio curinga exige que o DNS esteja com os nameservers da Vercel.
2. Defina `NEXT_PUBLIC_ROOT_DOMAIN=seudominio.com` e `NEXT_PUBLIC_APP_URL=https://seudominio.com`.
3. O `middleware.ts` reescreve `loja.seudominio.com/...` para `/<slug>/...`. Subdomínios reservados: `www`, `app`, `admin`, `master`, `api`.

### Domínio próprio da loja (plano Premium)

1. O cliente cria um CNAME (ex.: `pedidos.hamburgueria.com.br` → `cname.vercel-dns.com`).
2. Você adiciona o domínio em **Vercel → Settings → Domains**.
3. Em `/master/empresas → menu da empresa → Domínio próprio`, vincule o domínio. O middleware resolve o host pela função `resolve_domain`.

## 14. Pix automático (Mercado Pago) — opcional

1. Em <https://www.mercadopago.com.br/developers/panel> crie uma aplicação e copie o **Access Token** (use o de **teste** primeiro: começa com `TEST-`).
2. No painel da loja: **Configurações → Pagamentos → Pix automático**, cole o token, marque "Usar Pix automático" e salve. O token é validado no Mercado Pago e fica guardado numa tabela que nenhum usuário consegue ler (só o servidor).
3. Em produção (HTTPS), cadastre a **URL de notificação** mostrada na tela em *Suas integrações → Webhooks* (evento Pagamentos) e copie a **assinatura secreta** para o campo correspondente.
4. Em localhost não há webhook: a página do pedido confere o pagamento no Mercado Pago a cada 6 segundos.

Requer `SUPABASE_SERVICE_ROLE_KEY` configurada no servidor.

### Mensalidade online (Pix na conta da plataforma)

1. Rode `supabase/migrations/0009_saas_billing.sql` no SQL Editor (projeto já existente).
2. Entre como admin da plataforma em **/master/configuracoes → Recebimento das mensalidades**, cole o **seu** Access Token do Mercado Pago (teste `TEST-` primeiro) e salve. O token é conferido no Mercado Pago e guardado em `platform_secrets` (só o servidor lê).
3. Em produção (HTTPS), cadastre a URL `https://SEU-DOMINIO/api/webhooks/mercadopago?scope=platform` em Webhooks (evento Pagamentos) e cole a assinatura secreta.
4. A loja vê **Configurações → Assinatura → Pagar mensalidade**: gera/reaproveita a fatura em aberto, mostra o QR Pix e, quando aprovado, a fatura é baixada, a assinatura fica ativa por mais 1 mês e a loja suspensa volta a funcionar.

### Teste grátis de 15 dias

Rode `supabase/migrations/0010_trial.sql` no SQL Editor (pode rodar mais de uma vez). Empresas antigas são ajustadas sem perder dados.

## 15. Testes do banco (opcional, Postgres local)

```bash
# Postgres 16 ouvindo em socket/porta próprios (exemplo)
PGHOST=/var/lib/pgtest PGPORT=54322 npm run test:db
```

O script recria o banco `topburger_test`, aplica o stub do Supabase, as migrations e o seed, e roda os arquivos de `supabase/tests`. Detalhes em `TESTING.md`.

## 16. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Supabase não configurado" | `.env.local` ausente ou sem as duas variáveis públicas |
| Login funciona mas `/app` volta para `/onboarding` | usuário sem empresa: termine o cadastro ou crie pelo master |
| "SUPABASE_SERVICE_ROLE_KEY não configurada" ao criar funcionário | variável ausente no servidor (local ou Vercel) |
| Link do e-mail cai em `/login?erro=link` | Redirect URL não cadastrada ou template sem `token_hash` (passo 6) |
| Fotos não carregam | bucket `org-assets` não criado (migration 0006 não rodou) |
| Pedido do cliente não atualiza ao vivo | Realtime público desligado (passo 7); a página ainda atualiza a cada 20 s |
