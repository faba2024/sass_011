# Auditoria final do repositório — TOP BURGER OS

Data: 01/10/2026. Classificação honesta do estado de cada parte. "Testado" significa que foi executado; "escrito" significa que o código existe e passou na checagem de tipos, mas não rodou em navegador.

## 1. Implementado e testado de verdade

- **Schema completo** (8 migrations, ~3.850 linhas SQL): multiempresa com `organization_id`, constraints, índices, views com `security_invoker`.
- **RLS em todas as tabelas** + RBAC (25 permissões, 6 papéis padrão, permissões personalizáveis) — 77 verificações de isolamento entre empresas e por papel.
- **Checkout transacional no servidor** (`quote_order`/`place_order`/`create_staff_order`): recálculo de preço, grupos obrigatórios/mín./máx., combos, cupons, zonas, pedido mínimo, loja aberta/agendamento, limite do plano, número sequencial com trava de linha.
- **Concorrência**: pedidos simultâneos sem número repetido e cupom de uso único respeitado.
- **Fluxo de status** com histórico (usuário e horário), permissões por etapa, cancelamento com motivo sem exclusão.
- **Estoque por ficha técnica**: baixa uma única vez (flag `stock_deducted`), produto + adicionais (inclusive negativos, ex. “sem cebola”) + escolhas do combo; regra de estorno clara; custo médio ponderado; esgotamento e reativação automáticos.
- **Caixa, financeiro, despesas recorrentes, CRM, fidelidade, relatórios** (triggers e RPCs).
- **Painel master no banco**: visão geral, faturas, inadimplência, baixa, suspensão, configurações de cadastro.
- **Bundle de migrations + seed** aplicado em banco vazio sem erro.
- **Funções puras do front**: Pix BR Code (CRC conferido com vetor padrão), carrinho e reconciliação, formatação, WhatsApp, horários, CSV.

- **Pix automático (Mercado Pago)**: credencial da loja inacessível para usuários (só o servidor lê), confirmação apenas pelo servidor após consultar a API do gateway, conferência de valor, idempotência e notificação à loja — 22 verificações SQL + teste da assinatura do webhook.

- **Mensalidade online (Pix na conta da plataforma)**: fatura em aberto gerada pela loja, QR do Mercado Pago, baixa só pelo servidor após consultar o gateway (valor conferido, idempotente), ativação da assinatura e reativação da loja — 20 verificações SQL.

- **Teste grátis de 15 dias (Premium completo)**: regra única `hasFeature` (teste ativo primeiro, depois o plano) no banco e no front, escolha/troca de plano pela loja, tela de escolha quando o teste acaba sem plano, nenhum dado apagado — 40 verificações SQL + 4 testes unitários.

Total executado: **378 verificações SQL + 21 testes unitários, 0 falhas.**

## 2. Implementado e compilado; falta testar no navegador com Supabase

Todo o código Next.js (≈15.600 linhas TS/TSX) passou em `npm install`, `typecheck`, `lint`, testes e `npm run build` no Windows do usuário (Next 15.5.27, Node 24). O que ainda não foi exercitado é o uso real das telas, que depende de um projeto Supabase configurado:

- Landing, login/cadastro/recuperação de senha, onboarding de 6 etapas.
- Cardápio público, produto com personalização e preço ao vivo, carrinho (gaveta/bottom sheet), checkout, página “PEDIDO RECEBIDO”, acompanhamento, entrada por QR da mesa.
- Painel `/app`: dashboard, quadro de pedidos com som, detalhe, PDV, cozinha (KDS), app do entregador, impressão térmica e de QR, cardápio/produtos/combos/adicionais/categorias, estoque e fornecedores, delivery e entregadores, mesas, clientes, fidelidade, cupons, caixa, financeiro, despesas, relatórios com CSV, marketing, WhatsApp (wa.me), avaliações, funcionários, configurações, notificações, busca global, Ctrl+K e atalhos.
- Painel `/master`: visão geral, empresas, assinaturas e faturas, planos, usuários, configurações.

## 3. Precisa de credenciais externas

- **Supabase** (URL, anon key, service role): login, dados, Realtime, Storage. Sem isso nenhuma tela com dados abre.
- **Service role** no servidor: criar login de funcionários e de empresas pelo master.
- **SMTP** (recomendado em produção) para e-mails de confirmação e recuperação.
- **Vercel + DNS** para subdomínio curinga e domínio próprio das lojas.
- **ViaCEP** (público, sem chave) para preencher endereço pelo CEP — depende de internet.

## 4. Ainda não pronto / fora do escopo atual

- **Pix automático com conta real do Mercado Pago**: implementado (QR dinâmico, webhook assinado, conferência pela página do cliente), testado no banco e nas funções puras, mas **não testado contra a API real** do Mercado Pago (exige a sua conta e credenciais de teste). Estorno de Pix pago após cancelamento é manual (a loja é notificada).
- **Cartão online**: estrutura pronta (`card_online`), sem integração.
- **Mensalidade online**: implementada (Pix do Mercado Pago da plataforma), **não testada contra a API real** — exige o Access Token do dono da plataforma em /master/configuracoes. Cobrança recorrente automática no cartão não existe; a loja paga cada mês pelo botão.
- **WhatsApp API oficial**: o sistema usa templates + links `wa.me` (sem custo), sem envio automático.
- **Taxa por distância/geocodificação**: entrega é por bairro/prefixo de CEP.
- **Impressão automática** sem diálogo: hoje a impressão é pelo navegador (58/80 mm).
- **Rotina diária de vencimentos**: `platform_refresh_billing()` roda ao abrir o master ou pelo botão; para rodar sozinho, agende com `pg_cron` no Supabase.
- **Testes de interface** (Playwright) escritos, não executados; Realtime/Broadcast e upload no Storage não testados em Supabase real.

## 5. Situação do Supabase (02/10/2026)

- Projeto em uso: **faba2024'f Project** (organização Top Burger OS, São Paulo), URL `https://wdktoipuwrqzezmhgwft.supabase.co`.
- Schema completo aplicado e conferido (55 tabelas, 77 funções, Realtime, bucket `org-assets`) — idêntico ao banco de testes.
- Auth: Site URL `http://localhost:3000` e Redirect URL `http://localhost:3000/**`.
- Usuário admin da plataforma criado: `fc63542@gmail.com` (ID `ebf31fdc-49c4-45b0-98af-be7dff94e2f3`).
- **Pendente:** rodar `supabase/migrations/0008_payments.sql` (Pix automático) e `supabase/seed.sql` no SQL Editor (demo LEVI BURGUER), colar as chaves no `.env.local` e abrir com `INICIAR.cmd`.
