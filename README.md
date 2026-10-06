# TOP BURGER OS

Sistema operacional SaaS (assinatura mensal, multiempresa) para hamburguerias: cardápio online com pedido real, painel de pedidos em tempo real, cozinha (KDS), delivery e entregadores, mesas com QR Code, caixa/PDV, estoque por ficha técnica, financeiro, clientes/CRM, fidelidade, cupons, relatórios, equipe com permissões e painel master da plataforma.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS, Realtime, Storage) · pronto para Vercel.

## Começar

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run db:bundle            # gera supabase/bundle/schema.sql para colar no SQL Editor
npm run dev
```

No Windows: `VERIFICAR.cmd` instala e testa tudo; `INICIAR.cmd` sobe o sistema em http://localhost:3000.

Passo a passo completo (Supabase, Auth, primeiro admin, demo, deploy, domínios): **[SETUP.md](SETUP.md)**.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [SETUP.md](SETUP.md) | Instalação, `.env`, Supabase, migrations, primeiro usuário e empresa, demo, build, Vercel |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Modelo de dados, RPCs, triggers, rotas, permissões, fluxos, segurança |
| [TESTING.md](TESTING.md) | Testes automatizados e checklist manual |
| [AUDITORIA.md](AUDITORIA.md) | O que está testado, o que depende de build, de credenciais e o que falta |
| `.env.example` | Variáveis necessárias (sem credenciais reais) |

## Estrutura

```
src/
  app/
    page.tsx              landing (planos vindos do banco)
    (auth)/               login, cadastro, esqueci/redefinir senha
    onboarding/           6 etapas com barra de progresso
    [slug]/               cardápio público, produto, carrinho, checkout, pedido, mesa
    app/(shell)/          painel da hamburgueria (dashboard, pedidos, cardápio, estoque…)
    app/(bare)/           cozinha (KDS), app do entregador, impressão
    master/               painel da plataforma (empresas, planos, faturas, usuários)
  components/             UI própria (ícones SVG, tabelas, modais, gráficos) e módulos
  lib/                    Supabase, auth/permissões, formatação, Pix BR Code, carrinho
  middleware.ts           subdomínio / domínio próprio → loja; proteção de rotas
supabase/
  migrations/             0001–0010 (schema, lógica, RLS, realtime/storage, master, Pix automático, mensalidade online, teste grátis)
  seed.sql                demo LEVI BURGUER (dados fictícios)
  tests/                  suíte SQL: checkout, ciclo do pedido, caixa, RLS multiempresa, concorrência, master
tests/
  unit/                   testes unitários (Pix, carrinho, formatação, WhatsApp)
  e2e/                    Playwright (exige app + Supabase com seed)
public/demo/              ilustrações SVG da demo
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | desenvolvimento |
| `npm run build` / `npm run start` | produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | testes unitários |
| `npm run test:db` | suíte SQL em Postgres 16 local (ver TESTING.md) |
| `npm run test:e2e` | Playwright |
| `npm run db:bundle` | junta migrations (e `-- --seed`) em um arquivo |

## Segurança, em resumo

- Toda tabela de negócio tem `organization_id` e RLS; o visitante (`anon`) não lê nenhuma tabela, só executa RPCs públicas (cardápio, cotação, pedido, acompanhamento por token).
- Preços, adicionais, cupom, taxa e total são **recalculados no servidor**; o navegador envia apenas IDs e quantidades.
- `SUPABASE_SERVICE_ROLE_KEY` é usada só em Server Actions (criar logins) e nunca chega ao navegador.

## Licença

Uso privado do titular do projeto.
