# TOP BURGER OS — Arquitetura

Sistema operacional para hamburguerias, vendido como SaaS por assinatura.
Uma instalação atende N hamburguerias (organizações), cada uma isolada por `organization_id` + Row Level Security.

---

## 1. Visão geral

```
                ┌───────────────────────────── Vercel ─────────────────────────────┐
 Cliente final  │  Next.js (App Router)                                              │
 (celular)  ──► │   /[slug]/*        Cardápio público, carrinho, checkout, pedido   │
                │   middleware.ts    subdomínio → /[slug], refresh de sessão         │
 Equipe     ──► │   /app/*           Painel da hamburgueria (RBAC)                   │
                │   /master/*        Painel do dono do SaaS                          │
                │   Server Actions   Mutations validadas com zod + checagem RBAC     │
                └──────────────┬───────────────────────────────┬────────────────────┘
                               │ supabase-js (JWT do usuário)  │ service_role (apenas
                               ▼                               ▼  criação de usuários)
                ┌──────────────────────────── Supabase ─────────────────────────────┐
                │ Auth · Postgres (RLS em todas as tabelas) · Realtime · Storage     │
                │ RPCs SECURITY DEFINER: place_order, quote_order, get_storefront,   │
                │ update_order_status, caixa, fidelidade, avaliação, provisionamento │
                │ Triggers: estoque, financeiro, CRM, fidelidade, notificações       │
                └────────────────────────────────────────────────────────────────────┘
```

### Princípios

1. **O banco é a fonte da verdade e a última linha de defesa.** Preço, total, cupom, taxa de entrega, estoque, pontos e caixa são calculados no Postgres. O frontend nunca envia um preço que seja aceito.
2. **RLS em 100% das tabelas** de `public`. O papel `anon` não tem acesso direto a nenhuma tabela: o público só fala com o banco por RPCs com validação.
3. **RBAC no banco.** `has_permission(org, 'perm')` é usado tanto nas policies quanto nas RPCs. O Next.js repete a checagem para UX (esconder menus / redirecionar), mas não depende dela.
4. **Efeitos colaterais por trigger.** Mudou status do pedido → histórico, estoque, financeiro, CRM, fidelidade, caixa e notificação acontecem no mesmo commit. Não existe "esqueci de baixar o estoque" porque uma tela chamou outra API.
5. **Snapshots.** Pedido guarda nome/preço do produto, adicionais e endereço no momento da compra. Editar o cardápio não altera pedidos antigos.

### Stack

| Camada | Escolha |
|---|---|
| Web | Next.js 15 (App Router, Server Components, Server Actions), TypeScript estrito |
| Estilo | Tailwind CSS v4, design tokens próprios, ícones SVG próprios (sem lib de ícones) |
| Dados | Supabase: Postgres 15+, Auth, RLS, Realtime, Storage |
| Validação | zod (server actions) + constraints/RPCs no banco |
| Gráficos | SVG próprio (sem dependência) |
| QR Code | `qrcode` |
| Deploy | Vercel (wildcard `*.topburger.app`) |

---

## 2. Multi-tenant

- Toda tabela de negócio tem `organization_id uuid not null references organizations(id) on delete cascade`.
- Índice composto começando por `organization_id` nas tabelas consultadas por lista.
- Funções helper (`SECURITY DEFINER`, `STABLE`, `search_path` fixo):
  - `is_platform_admin()` — dono do SaaS (`profiles.is_platform_admin`).
  - `is_org_member(org)` — usuário ativo na organização.
  - `has_permission(org, perm)` — membro ativo cujo papel tem a permissão (ou platform admin).
- Policy padrão de cada tabela:
  - `select`: `is_org_member(organization_id)` (ou permissão de leitura específica, ex. `finance.view`).
  - `insert/update/delete`: `has_permission(organization_id, '<modulo>.manage')`.
- Escritas sensíveis (status de pedido, caixa, pontos) são feitas por RPCs que checam permissão e regras de negócio.
- **Teste automatizado** (`supabase/tests/02_multitenant.sql`): usuário da Org A tenta ler/alterar dados da Org B e falha.

### Domínios

- `leviburguer.topburger.app` → middleware reescreve para `/leviburguer`.
- `organizations.custom_domain` (ex. `pedidos.leviburguer.com.br`) → middleware resolve via RPC `resolve_domain` (cache em memória na edge) e reescreve para `/[slug]`.
- `NEXT_PUBLIC_ROOT_DOMAIN` define o domínio raiz. Em dev, `/leviburguer` funciona direto.

---

## 3. Modelo de dados

Convenções: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` (trigger `set_updated_at`), `deleted_at` (soft delete) onde o registro tem histórico relevante. Dinheiro em `numeric(12,2)`. Quantidades de estoque em `numeric(14,3)`.

### 3.1 Plataforma / SaaS

| Tabela | Função |
|---|---|
| `plans` | STARTER / PRO / PREMIUM: preço, `limits` (jsonb: `max_members`, `max_products`, `max_orders_month`), `features` |
| `organizations` | A hamburgueria: slug, dados, cores, logo/banner, domínio, status, configurações de loja (tipos de pedido, pedido mínimo, tempo padrão, override aberto/fechado), sequência de pedidos, onboarding |
| `subscriptions` | 1 ativa por org: plano, status (`trialing`, `active`, `pending`, `past_due`, `cancelled`), período, preço travado, `provider`/`provider_ref` (preparado para Asaas/Stripe/Mercado Pago) |
| `subscription_payments` | Faturas da assinatura (master marca como paga; webhook futuro) |
| `platform_settings` | Configurações globais do SaaS (chave/valor) |
| `profiles` | 1:1 com `auth.users`: nome, telefone, `is_platform_admin`, último acesso |

### 3.2 Acesso (RBAC)

| Tabela | Função |
|---|---|
| `permissions` | Catálogo global de permissões (`orders.manage`, `finance.view`, …) |
| `roles` | Papéis por organização (6 de sistema criados no provisionamento; personalizáveis) |
| `role_permissions` | Papel × permissão |
| `organization_members` | Usuário × organização × papel, ativo/inativo |

### 3.3 Loja e cardápio

| Tabela | Função |
|---|---|
| `opening_hours` | Turnos por dia da semana (vários por dia, cruza meia-noite) |
| `opening_exceptions` | Feriados, eventos, fechamento temporário |
| `categories` | Categorias personalizáveis com ordem |
| `products` | `type` = `simple` ou `combo`; preço, promo, ingredientes, tempo, ativo, disponível/esgotado (`unavailable_reason` = manual/estoque), destaque, ordem |
| `product_images` | Múltiplas fotos por produto |
| `modifier_groups` | Grupo de opções: `kind` = `variation` (tamanho, carnes, pão, ponto, queijo, molho), `addon` (ADICIONE MAIS) ou `removal` (Retirar ingredientes); `min_select`, `max_select` (1 = escolha única), `required` |
| `modifiers` | Opção do grupo com `price_delta` e `max_quantity` (ex.: até 3× bacon) |
| `product_modifier_groups` | Quais grupos aparecem em quais produtos (N:N, com ordem) |
| `combo_groups` | Slots de um combo ("Escolha o hambúrguer") |
| `combo_group_options` | Produtos permitidos no slot (+ acréscimo opcional) |

> **Variações x adicionais:** em vez de uma tabela `product_variants` rígida, variações são grupos `kind='variation'` com `min=max=1`. Isso cobre tamanho, nº de carnes, pão, ponto, queijo e molho com o mesmo motor de preço/validação e reaproveitamento entre produtos (o grupo "Pão" serve para 20 hambúrgueres). Combos são produtos `type='combo'` com slots — aparecem no cardápio e no carrinho como qualquer item.

### 3.4 Pedidos

| Tabela | Função |
|---|---|
| `orders` | Número sequencial por org, `public_token` (link do cliente), tipo (`delivery`, `pickup`, `dine_in`, `counter`), status, origem (`online`, `table`, `pdv`, `admin`), snapshot do cliente/endereço, zona, mesa, entregador, valores, cupom, pagamento, troco, timestamps de cada etapa, flags de efeitos (`stock_deducted`, `loyalty_points_earned`) |
| `order_items` | Snapshot do produto, preço unitário final, qtd, observação |
| `order_item_modifiers` | Snapshot de cada variação/adicional/escolha de combo (`kind` = `modifier` / `combo_choice`) |
| `order_status_history` | Toda transição (de, para, quem, quando) |

Status: `new` → `awaiting_confirmation` (opcional, ex. aguardando comprovante Pix) → `confirmed` → `preparing` → `ready` → `out_for_delivery` (só delivery) → `delivered` · `cancelled` de qualquer estado não final.

### 3.5 Clientes, CRM, fidelidade, cupons, avaliações, marketing

| Tabela | Função |
|---|---|
| `customers` | Único por (org, telefone normalizado). Estatísticas mantidas por trigger: pedidos, total gasto, primeiro/último pedido. `tags text[]` |
| `customer_addresses` | Endereços salvos (criados no checkout) |
| `customer_segments` (view) | `new`, `recurring`, `vip`, `inactive` calculados com limiares por org |
| `loyalty_programs` | 1 por org: ativo, pontos por real |
| `loyalty_rewards` | Recompensas configuráveis (100 pts = batata…) |
| `loyalty_accounts` | Saldo por cliente |
| `loyalty_transactions` | Extrato: `earn`, `redeem`, `reverse`, `adjust` |
| `coupons` | `percent`, `fixed`, `free_delivery`, `free_product`; validade, limite total, por cliente (telefone), pedido mínimo, primeira compra, `product_ids` (produtos permitidos) |
| `coupon_redemptions` | Uso por pedido/cliente |
| `reviews` | 1 por pedido entregue, 1–5 estrelas, comentário, resposta da loja |
| `campaigns` / `campaign_recipients` | Campanhas por segmento com mensagem preparada e controle de envio |
| `whatsapp_templates` | Templates com variáveis `{{cliente}}`, `{{numero}}`, `{{total}}`, `{{link}}`… |
| `whatsapp_messages` | Log de mensagens abertas/enviadas |

### 3.6 Delivery, mesas

| Tabela | Função |
|---|---|
| `delivery_zones` | Bairro / prefixos de CEP, taxa, pedido mínimo, tempo. (Campo `max_distance_km` reservado para cálculo por distância) |
| `drivers` | Entregador (opcionalmente vinculado a um usuário com papel `driver`), status `available` / `on_delivery` / `offline` |
| `dining_tables` | Mesa, lugares, status, `qr_token` |
| `table_sessions` | Conta aberta da mesa; pedidos `dine_in` ficam vinculados; fechamento gera pagamento |

### 3.7 Estoque

| Tabela | Função |
|---|---|
| `suppliers` | Fornecedores |
| `ingredients` | Insumo: unidade, saldo, mínimo, custo médio, fornecedor |
| `product_recipes` | Ficha técnica do produto (ingrediente × quantidade) |
| `modifier_recipes` | Ficha técnica do adicional (ex. Bacon extra = 30 g bacon) |
| `inventory_movements` | Entrada, saída, ajuste, perda, venda, estorno. Trigger atualiza saldo e custo médio ponderado |

### 3.8 Caixa e financeiro

| Tabela | Função |
|---|---|
| `cash_registers` | Abertura/fechamento (1 aberto por org — índice único parcial), valores informado/esperado/diferença |
| `cash_movements` | `sale`, `withdrawal` (sangria, motivo obrigatório), `supply` (suprimento), `refund` por forma de pagamento |
| `expenses` | Despesas por categoria, únicas ou recorrentes (mensal/semanal), pendente/paga |
| `financial_entries` | Livro-razão: receitas (pedido pago), estornos e despesas pagas. Dashboard e DRE simples leem daqui |
| `product_costs` (view) | Custo pela ficha técnica, preço, margem R$ e % |

### 3.9 Sistema

| Tabela | Função |
|---|---|
| `notifications` / `notification_reads` | Central: pedido novo, estoque baixo, assinatura, avaliação |
| `audit_logs` | Quem alterou o quê (produtos, preços, cupons, membros, caixa, configurações) |

### Relacionamentos principais

```
organizations 1─N organization_members N─1 profiles(auth.users)
organizations 1─N roles 1─N role_permissions N─1 permissions
organizations 1─1 subscriptions N─1 plans
categories 1─N products 1─N product_images
products N─N modifier_groups (product_modifier_groups) 1─N modifiers
products(combo) 1─N combo_groups 1─N combo_group_options N─1 products
products 1─N product_recipes N─1 ingredients N─1 suppliers
modifiers 1─N modifier_recipes N─1 ingredients
customers 1─N customer_addresses · 1─1 loyalty_accounts 1─N loyalty_transactions
orders N─1 customers · N─1 delivery_zones · N─1 drivers · N─1 dining_tables/table_sessions · N─1 coupons
orders 1─N order_items 1─N order_item_modifiers · 1─N order_status_history · 1─1 reviews
orders 1─N inventory_movements · 1─N financial_entries · 1─N cash_movements
cash_registers 1─N cash_movements
```

---

## 4. Lógica no banco (RPCs e triggers)

| RPC | Quem chama | O que faz |
|---|---|---|
| `get_storefront(slug)` | anon | JSON único com loja, status aberto/fechado, horários, categorias, produtos, fotos, grupos, combos, zonas. Só itens ativos. |
| `quote_order(payload)` | anon | Recalcula carrinho no servidor (preço, adicionais, combos, cupom, taxa) sem gravar |
| `place_order(payload)` | anon | Valida tudo (loja aberta, tipo habilitado, produto ativo/disponível, regras min/max dos grupos, slots do combo, zona, pedido mínimo, cupom, limite do plano, anti-flood por telefone), cria/atualiza cliente e endereço, grava pedido + itens + snapshots, uso do cupom, notificação |
| `create_staff_order(org, payload)` | PDV / atendente | Mesmo motor, origem `pdv`/`admin`, desconto manual, pagamento já registrado |
| `get_public_order(token)` | anon | Acompanhamento do pedido |
| `submit_review(token, rating, comment)` | anon | Só para pedido entregue, 1 vez |
| `get_table(token)` | anon | Identifica mesa do QR |
| `update_order_status(order, status, note)` | equipe | Valida transição + permissão por etapa (cozinha só `preparing`/`ready`; entregador só os próprios) |
| `assign_driver(order, driver)` | atendente | Atribui entregador |
| `open_cash_register` / `add_cash_movement` / `close_cash_register` | caixa | PDV |
| `close_table_session(session, method)` | caixa/atendente | Fecha conta da mesa |
| `redeem_loyalty_reward(org, customer, reward)` | caixa | Debita pontos |
| `provision_organization(...)` | master / service | Cria org + papéis + permissões + templates + fidelidade + horários + trial |
| `create_my_organization(name, slug)` | usuário recém-cadastrado | Self-service com trial (plano e dias vêm de `platform_settings.signup`) |
| `set_store_mode(org, mode, message)` | gerente/atendente | Abrir/fechar a loja manualmente ou voltar ao automático |
| `slug_available(slug)` | anon | Checagem do endereço no cadastro |
| `platform_overview()` / `platform_organizations()` / `platform_users()` | admin da plataforma | Agregados do painel master (MRR, inadimplência, uso) |
| `platform_update_subscription` / `platform_create_invoice` / `platform_register_payment` / `platform_refresh_billing` | admin da plataforma | Plano, faturas, baixa (ativa e estende 1 mês), vencimentos e trials expirados |
| `platform_public()` | anon | Dias de teste e contato de suporte para a landing |
| `set_payment_integration` / `payment_integration_status` / `remove_payment_integration` | dono/gerente (`settings.manage`) | Conecta o Mercado Pago; o token nunca volta ao navegador (status mostra só os 4 últimos caracteres) |
| `get_order_pix(token)` | anon | Diz se a loja usa Pix automático e devolve a cobrança atual do pedido |
| `confirm_provider_payment(order, provider, id, valor)` | **somente service_role** | Marca o pedido como pago após o servidor consultar o pagamento na API do gateway; confere valor; idempotente |

| Trigger em `orders` | Efeito |
|---|---|
| status muda | `order_status_history`, timestamp da etapa, status do entregador/mesa |
| → `confirmed` (1ª vez) | baixa estoque pela ficha técnica (produto + adicionais + escolhas do combo) → recalcula disponibilidade → alerta de estoque baixo |
| `payment_status` → `paid` | `financial_entries` (receita) + `cash_movements` se houver caixa aberto |
| → `delivered` | marca pago (se pendente), atualiza estatísticas do cliente (CRM), credita pontos de fidelidade |
| → `cancelled` | estorna financeiro (refund), pontos e uso de cupom; **estoque** volta só se o preparo não começou (novo/aguardando/confirmado) — depois disso o insumo foi usado; o gerente pode forçar com `p_restock` |

---

## 5. Rotas

### Público (cliente final)

| Rota | Tela |
|---|---|
| `/` | Site comercial do TOP BURGER OS (planos, CTA) |
| `/login`, `/cadastro` | Acesso / criação de conta + empresa (trial) |
| `/onboarding` | 6 passos com barra de progresso |
| `/[slug]` e `/[slug]/cardapio` | Cardápio: logo, banner, aberto/fechado, tempo, taxa, mínimo, horários, Instagram, WhatsApp, categorias |
| `/[slug]/produto/[id]` | Produto com fotos, variações, adicionais, combo |
| `/[slug]/carrinho` | Editar, remover, duplicar, observações |
| `/[slug]/checkout` | Dados, tipo, endereço, pagamento, troco, cupom (cotação no servidor) |
| `/[slug]/pedido/[token]` | Acompanhamento em tempo quase real + avaliação |
| `/[slug]/mesa/[token]` | Entrada via QR Code (identifica a mesa) |

### Admin (`/app`, exige membro ativo)

| Rota | Permissão |
|---|---|
| `/app` | `dashboard.view` |
| `/app/pedidos`, `/app/pedidos/[id]`, `/app/pedidos/novo`, `/app/imprimir/[id]` | `orders.view` / `orders.create` |
| `/app/cozinha` | `kitchen.view` |
| `/app/cardapio`, `/app/produtos`, `/app/categorias`, `/app/combos`, `/app/adicionais` | `menu.view` / `menu.manage` |
| `/app/clientes`, `/app/clientes/[id]` | `customers.view` |
| `/app/fidelidade` | `loyalty.manage` |
| `/app/cupons` | `coupons.manage` |
| `/app/estoque`, `/app/fornecedores` | `inventory.view` / `inventory.manage` |
| `/app/delivery`, `/app/entregadores` | `delivery.manage` |
| `/app/entregador` | `deliveries.own` (tela mobile do entregador) |
| `/app/mesas`, `/app/imprimir/mesas` | `tables.manage` |
| `/app/caixa` | `cash.operate` |
| `/app/financeiro`, `/app/despesas` | `finance.view` / `finance.manage` |
| `/app/relatorios` | `reports.view` |
| `/app/marketing`, `/app/whatsapp` | `marketing.manage` |
| `/app/avaliacoes` | `reviews.manage` |
| `/app/funcionarios` | `staff.manage` |
| `/app/configuracoes` | `settings.manage` |

### Master (`/master`, exige `profiles.is_platform_admin`)

`/master` (MRR, recebido no mês, inadimplência, trials, crescimento), `/master/empresas` (criar empresa + dono, plano, fatura, domínio próprio, suspender/reativar/cancelar, abrir painel da empresa), `/master/assinaturas` (faturas: baixa, cancelamento, vencimentos), `/master/planos`, `/master/usuarios` (admin da plataforma, link de nova senha), `/master/configuracoes` (cadastro aberto/fechado, plano e dias de trial, suporte). Todas as agregações são RPCs `platform_*` (migration `0007_platform.sql`).

---

## 6. Permissões (RBAC)

| Permissão | Dono | Gerente | Atendente | Caixa | Cozinha | Entregador |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| dashboard.view | ✓ | ✓ | ✓ | ✓ | | |
| orders.view | ✓ | ✓ | ✓ | ✓ | ✓ | |
| orders.manage | ✓ | ✓ | ✓ | ✓ | | |
| orders.create | ✓ | ✓ | ✓ | ✓ | | |
| kitchen.view | ✓ | ✓ | ✓ | | ✓ | |
| menu.view | ✓ | ✓ | ✓ | ✓ | ✓ | |
| menu.manage | ✓ | ✓ | | | | |
| customers.view | ✓ | ✓ | ✓ | ✓ | | |
| customers.manage | ✓ | ✓ | ✓ | ✓ | | |
| loyalty.manage | ✓ | ✓ | | | | |
| coupons.manage | ✓ | ✓ | | | | |
| inventory.view | ✓ | ✓ | | | ✓ | |
| inventory.manage | ✓ | ✓ | | | | |
| delivery.manage | ✓ | ✓ | ✓ | | | |
| deliveries.own | ✓ | ✓ | | | | ✓ |
| tables.manage | ✓ | ✓ | ✓ | ✓ | | |
| cash.operate | ✓ | ✓ | | ✓ | | |
| finance.view | ✓ | ✓ | | | | |
| finance.manage | ✓ | ✓ | | | | |
| reports.view | ✓ | ✓ | | | | |
| marketing.manage | ✓ | ✓ | | | | |
| reviews.manage | ✓ | ✓ | | | | |
| staff.manage | ✓ | ✓ | | | | |
| settings.manage | ✓ | ✓ | | | | |
| billing.view | ✓ | | | | | |

Regras extras: só o dono altera/remove outro dono; ninguém remove o último dono; limite de funcionários/produtos/pedidos por plano é validado por trigger.

Camadas: **middleware** (sessão) → **layout** `/app` (membro ativo, carrega permissões, filtra navegação) → **página** (`requirePermission`) → **server action** (`requirePermission` + zod) → **RLS/RPC** (definitivo).

---

## 7. Fluxos

### 7.1 Pedido de ponta a ponta

```
Cliente monta carrinho (localStorage por loja)
  → checkout chama quote_order (preview de totais calculado no servidor)
  → place_order  ── cria customer (CRM) + endereço + pedido 'new' + notificação
Painel /app/pedidos (Realtime: INSERT) → som + toast + badge
  → Confirmar  (update_order_status → confirmed) ── trigger baixa ESTOQUE
Cozinha /app/cozinha (Realtime) → INICIAR (preparing) → PRONTO (ready)
Atendente atribui entregador → entregador vê em /app/entregador
  → Iniciar entrega (out_for_delivery) → Entregue (delivered)
       └ trigger: pagamento 'paid' → FINANCEIRO (+ caixa aberto)
                  CRM: pedidos/total gasto/último pedido
                  FIDELIDADE: pontos creditados
Cliente acompanha em /[slug]/pedido/[token] e avalia
```

### 7.2 Mesa (QR)
QR → `/[slug]/mesa/[token]` → carrinho marcado como `dine_in` + mesa → pedido entra na cozinha já confirmado (configurável) → conta da mesa acumula pedidos → caixa fecha a conta (`close_table_session`) com forma de pagamento → mesa livre.

### 7.3 PDV
Abrir caixa (valor inicial) → venda balcão (busca, categorias, desconto, pagamento) → `create_staff_order` (pago) → sangria/suprimento → fechamento com esperado × informado × diferença.

### 7.4 Nova empresa
`/cadastro` (ou master cria) → `provision_organization` → trial 15 dias → `/onboarding` (nome, logo, endereço, horário, delivery, primeiro produto) → cardápio publicado.

---

## 8. Realtime

Publicação `supabase_realtime` com `orders`, `order_status_history`, `drivers`, `notifications`, `dining_tables`, `products`. O acompanhamento público usa Broadcast (`realtime.send`, tópico `order:<token>`). As inscrições respeitam RLS, então cada tela só recebe eventos da própria organização (e o entregador só os pedidos dele).

## 9. Storage

Bucket público `org-assets`, caminho `{organization_id}/{pasta}/{arquivo}`. Policies de escrita exigem `has_permission(<org do caminho>, 'menu.manage' | 'settings.manage')`.

## 10. Segurança

- RLS em todas as tabelas; `anon` sem grants em tabelas, só `EXECUTE` em RPCs públicas.
- RPCs `SECURITY DEFINER` com `search_path = public, pg_temp` e checagens explícitas.
- `SUPABASE_SERVICE_ROLE_KEY` usada **apenas** em server actions do master/funcionários (criar usuário no Auth), nunca no browser.
- Validação zod em toda server action; constraints `check` no banco (preço ≥ 0, rating 1–5, etc.).
- Anti-flood no `place_order` (pedidos por telefone/janela).
- Auditoria (`audit_logs`) para alterações sensíveis.

## 11. Fases de desenvolvimento

| Fase | Entrega | Onde |
|---|---|---|
| 1 | Arquitetura | este arquivo |
| 2 | Banco | `supabase/migrations/0001…` |
| 3 | Auth | Supabase Auth + `profiles` trigger + `/login`, `/cadastro`, middleware |
| 4 | Multi-tenant + RLS | `0005_security.sql` + testes `supabase/tests` |
| 5 | Dashboard | `/app` |
| 6 | Produtos/cardápio | `/app/produtos…`, `get_storefront` |
| 7 | Pedidos | `/app/pedidos`, Realtime |
| 8 | Checkout | `/[slug]/checkout`, `place_order` |
| 9 | Cozinha | `/app/cozinha` |
| 10 | Estoque | `/app/estoque`, ficha técnica, triggers |
| 11 | Clientes | `/app/clientes`, CRM |
| 12 | Delivery | zonas, entregadores, tela do entregador |
| 13 | PDV/Caixa | `/app/caixa` |
| 14 | Financeiro | `/app/financeiro`, `/app/despesas` |
| 15 | Relatórios | `/app/relatorios` |
| 16 | Fidelidade/cupons | `/app/fidelidade`, `/app/cupons` |
| 17 | Funcionários/permissões | `/app/funcionarios` |
| 18 | Master SaaS | `/master/*`, `0007_platform.sql` |
| 19 | Auditoria | testes SQL ponta a ponta, typecheck, checklist |

## 12. Pedido online — regras obrigatórias

- O cliente compra como visitante (nome + telefone). Nada de "mandar lista pro WhatsApp": o pedido nasce no banco via `place_order`.
- O navegador envia **apenas IDs e quantidades** (produto, opções, escolhas de combo, cupom, zona). Preço, adicionais, desconto, taxa e total são recalculados no servidor em `quote_order` (preview) e de novo em `place_order` (gravação).
- Validações do servidor: empresa ativa, loja aberta (ou horário agendado válido), tipo de recebimento habilitado, produto ativo/disponível da mesma empresa, regras min/máx/obrigatório de cada grupo, `max_quantity` de cada opção, slots do combo, zona de entrega e pedido mínimo da zona, cupom (validade, limite total, limite por telefone, mínimo, primeira compra, produtos permitidos), limite mensal do plano e anti-flood.
- Grava `orders` + `order_items` + `order_item_modifiers` + `order_status_history` e gera número sequencial por loja (`#1058`) na mesma transação.
- **Pix**: chave configurada pela loja; a página do pedido mostra chave e Pix copia-e-cola (BR Code estático gerado no servidor). O pedido **nunca** é marcado como pago sem confirmação humana (ou, no futuro, do webhook do gateway — `payment_provider`, `payment_ref`).
- **Dinheiro**: "Precisa de troco?" → "Troco para quanto?" → troco calculado e impresso para o entregador.
- **Agendamento** (`organizations.allow_scheduling`): com a loja fechada o cliente pode escolher um horário (hoje/amanhã) dentro do expediente; `place_order` valida com `is_open_at(org, horário)`. Sem agendamento, pedidos são bloqueados com "Estamos fechados no momento" e o próximo horário.
- **Carrinho** persistido em `localStorage` por loja, expira em 48 h e é reconciliado com o cardápio atual a cada visita: item removido/indisponível sai do carrinho, preço alterado é atualizado e o cliente é avisado.
- **Acompanhamento** `/[slug]/pedido/[token]`: trigger publica cada mudança de status por Supabase Realtime Broadcast no tópico `order:<token>` (token aleatório de 128 bits, não adivinhável); a página escuta o canal e, por segurança, também revalida a cada 20 s.
- **Cancelamento** nunca exclui: grava motivo, usuário e horário (`cancel_reason`, `cancelled_by`, `cancelled_at` + histórico) e estorna estoque, financeiro, cupom e pontos.

## 12.1 Pix automático (migration 0008)

`payment_integrations` (credencial por loja, sem grants para anon/authenticated) e `order_payments` (cobranças). Fluxo: página do pedido → `POST /api/pagamentos/pix/[token]` cria a cobrança no Mercado Pago (servidor, service_role) → cliente paga → webhook `POST /api/webhooks/mercadopago?org=` (assinatura HMAC verificada quando configurada) **ou** a própria página (`GET /api/pagamentos/pix/[token]`) consulta `GET /v1/payments/{id}` → `confirm_provider_payment` → triggers de pagamento (financeiro, caixa, notificação).

## 12.2 Mensalidade online (migration 0009)

`platform_secrets` (token Mercado Pago da plataforma; só service_role) e colunas de Pix em `subscription_payments`. Fluxo: Configurações → Assinatura → **Pagar** → server action `startSubscriptionPaymentAction` → `billing_open_invoice(org)` (exige `billing.view`; reaproveita a fatura pendente/atrasada ou gera a do próximo período) → `lib/payments/saas-billing.ts` cria o Pix (`external_reference = sub:<fatura>`) → loja paga → webhook `?scope=platform` **ou** a tela (`checkSubscriptionPaymentAction` a cada 6 s) consulta o gateway → `confirm_subscription_pix` (service_role, valor conferido, idempotente) → `_apply_subscription_payment`: fatura paga, assinatura `active` +1 mês, organização suspensa reativada, auditoria e notificação. Admin: `platform_payment_status`, `set_platform_payment` em /master/configuracoes.

## 12.3 Teste grátis de 15 dias (migration 0010)

Colunas em `subscriptions`: `trial_started_at`, `trial_ends_at` (já existia), `trial_active`, `plan_chosen_at` (o plano é `plan_id`). Toda empresa criada com status `trialing` recebe 15 dias (trigger `subscriptions_trial_defaults`; dias configuráveis em /master/configuracoes, padrão 15).

Regra única: **teste ativo** (`trial_active` e `trial_ends_at > now()`) libera todos os recursos e remove limites; senão valem `plans.features`/`plans.limits` do plano contratado. No banco: `trial_is_on`, `org_features`, `plan_limit`. No app: `src/lib/plan-access.ts` → `hasFeature(access, feature)`, usado por `lib/auth.ts` (servidor) e `useApp().has` (navegador). Estado para o painel: RPC `org_plan_state` (também encerra testes vencidos: `trial_active = false`, status `pending`). Troca de plano: RPC `choose_plan` (upgrade/downgrade, não apaga nada; durante o teste o acesso total continua). Sem plano escolhido após o teste, o layout do painel mostra a escolha de plano no lugar da página. Pagar durante o teste mantém o teste e o mês pago começa no fim dele.

## 13. Próximos passos (fora do MVP, arquitetura preparada)

- Cobrança recorrente automática no cartão (hoje: Pix mês a mês pelo botão Pagar).
- Cartão online (`payment_method = 'card_online'`, `payment_status`).
- WhatsApp API oficial (hoje: templates + `wa.me`, sem custo).
- Taxa por distância (`delivery_zones.max_distance_km` + geocoding).
- Impressão automática via agente local (hoje: layout térmico 58/80 mm via navegador).
