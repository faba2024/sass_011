# TESTING — TOP BURGER OS

Este documento separa com clareza **o que foi executado de verdade** do que ainda precisa ser executado no seu ambiente.

## 1. Situação dos testes (outubro/2026)

| Camada | Como | Resultado |
|---|---|---|
| Banco: schema, constraints, triggers, RPCs, RLS | `npm run test:db` em PostgreSQL 16 local (stub de `auth`/`storage`/`realtime`) | **378 verificações aprovadas, 0 falhas** |
| Concorrência (numeração e cupom) | `supabase/tests/60_concurrency.sh`, pedidos simultâneos em conexões separadas | **aprovado** (5 verificações, incluídas acima) |
| Bundle das migrations + seed | `schema+seed.sql` aplicado em banco vazio | **aplicado sem erro** |
| Funções puras do front (Pix BR Code, carrinho, formatação, WhatsApp, horários, CSV, assinatura do webhook do Mercado Pago) | `npm test` (Node test runner) | **21 testes aprovados** |
| TypeScript de todo o `src/` | `npm run typecheck` com os pacotes reais | **sem erros** |
| `npm install`, `typecheck`, `lint`, `npm test`, `npm run build` | `VERIFICAR.cmd` no Windows do usuário (Node 24, Next 15.5.27) | **todos OK** — build gerou as 47 páginas/rotas sem erro |
| Telas no navegador, Realtime no Supabase real, upload no Storage, e-mails do Auth | — | **não executados** (ainda sem projeto Supabase) |
| Playwright (`tests/e2e`) | escrito | **não executado** |

Ou seja: a lógica de negócio e a segurança multiempresa estão testadas no banco; a interface foi escrita e checada por tipos, mas precisa da primeira execução real (`npm install && npm run build`) e do checklist manual abaixo.

## 2. Testes automatizados

### 2.1 Banco (`supabase/tests`)

| Arquivo | Cobre |
|---|---|
| `10_checkout.sql` | cotação e pedido online: preços recalculados no servidor (total enviado pelo cliente é ignorado), grupos obrigatórios/mín./máx., `max_quantity`, combos, cupons (validade, limite, mínimo, primeira compra, produtos permitidos, frete grátis, produto grátis), zona e pedido mínimo, loja fechada, agendamento, número sequencial, cliente/endereço criados |
| `20_order_lifecycle.sql` | transições válidas/inválidas, histórico com usuário, baixa de estoque **uma única vez** pela ficha técnica (produto + adicionais + combo), cancelamento com motivo e regra de estorno, pagamento → financeiro/caixa, entregue → CRM e fidelidade, estorno de pontos e cupom |
| `30_cash_tables.sql` | abertura/fechamento de caixa com diferença, sangria/suprimento, um caixa aberto por loja, mesas (sessão, pedidos, fechamento da conta) |
| `40_multitenant_rls.sql` | **dono de outra empresa não lê, altera nem exclui** produtos, pedidos, itens, clientes, endereços, financeiro, despesas, estoque, caixa, cupons, fidelidade etc. da Levi Burguer; funcionários limitados ao papel (cozinha, caixa, entregador, atendente, gerente); visitante anônimo sem acesso a tabelas |
| `50_rules.sql` | horários (turno que cruza a meia-noite, feriado, horário especial), custo médio ponderado, produto esgota e volta sozinho pelo estoque, despesas recorrentes, resgate de fidelidade, limites do plano (produtos e usuários), validações de preço e de grupos |
| `60_concurrency.sh` | pedidos simultâneos: números sem repetição e cupom de uso único não usado duas vezes |
| `70_reports.sql` | dashboard, relatórios e resumo financeiro (CMV, lucro) |
| `90_payments.sql` | Pix automático: só o dono configura, token nunca volta para o navegador nem é lido por usuários, confirmação só pela service_role, valor conferido, webhook repetido não duplica receita, outra empresa não acessa |
| `95_saas_billing.sql` | mensalidade online: token da plataforma só para admin e nunca lido por usuários, fatura em aberto criada/reaproveitada, só quem tem `billing.view` gera, confirmação só pela service_role com valor conferido, idempotente, assinatura ativada e loja suspensa reativada |
| `96_trial.sql` | teste grátis de 15 dias: empresa nova (dia 1) com tudo liberado e sem limites, dia 14, dia 15 (último dia), teste vencido sem plano (pede escolha, volta ao Starter, dados preservados, limite volta), upgrade durante o teste (Premium continua até o fim), fim do teste aplica o plano escolhido, downgrade sem apagar dados, pagamento durante o teste, linhas antigas e isolamento entre empresas |
| `80_platform.sql` | painel master só para admin; faturas, inadimplência, baixa reativa assinatura; loja suspensa não recebe pedidos; cadastro aberto/fechado e trial configuráveis |

Executar (Postgres 16 local com usuário `postgres`):

```bash
PGHOST=/caminho/do/socket PGPORT=5432 npm run test:db
```

### 2.2 Unitários (`tests/unit`)

```bash
npm test
```

### 2.3 Ponta a ponta (`tests/e2e`)

Com o app rodando contra um Supabase de teste com o seed:

```bash
npx playwright install chromium
E2E_EMAIL=dono@exemplo.com E2E_PASSWORD=... npm run test:e2e
```

## 3. Primeira execução (obrigatória)

1. `npm install` — sem erros de dependência.
2. `npm run typecheck` — sem erros.
3. `npm run lint` — corrigir avisos que aparecerem.
4. `npm run build` — build concluído.
5. Seguir o SETUP.md até a demo LEVI BURGUER aparecer em `/leviburguer`.

## 4. Checklist manual

Marque cada item em celular (360 px), notebook (1366 px) e monitor grande (2560 px ou mais).

### Cardápio e pedido online (`/leviburguer`)
- [ ] Logo, banner, status aberto/fechado, tempo e taxa aparecem; categorias rolam e ficam fixas no topo
- [ ] Produto: fotos nítidas, preço muda ao escolher carne/ponto/adicionais; botão bloqueado até preencher obrigatórios
- [ ] Remover ingrediente (“Sem cebola”) aparece no carrinho e na comanda
- [ ] Combo: cada etapa obriga escolha; acréscimo de preço somado
- [ ] Barra “VER CARRINHO • N ITENS • R$ X” sempre visível no celular
- [ ] Carrinho: alterar quantidade, duplicar, editar, remover; fechar e reabrir a aba mantém o carrinho
- [ ] Desativar um produto no painel com ele no carrinho → cliente é avisado e o item sai
- [ ] Checkout: Entrega com CEP preenche endereço; taxa e tempo pela zona; abaixo do mínimo bloqueia
- [ ] Retirada e Consumo no local (via QR da mesa detecta a mesa)
- [ ] Cupom `LEVI10`, `FRETEGRATIS`, `BATATAFREE`, `PRIMEIRA` (2º pedido do mesmo telefone recusa), cupom inexistente
- [ ] Dinheiro: “Precisa de troco?” → troco calculado
- [ ] Pix: página do pedido mostra chave e copia-e-cola; pedido continua “aguardando pagamento” até a loja confirmar
- [ ] Página “PEDIDO RECEBIDO” com número; acompanhamento muda sozinho quando o painel avança o status
- [ ] Loja fechada: mensagem + próximo horário; com agendamento ligado, escolher horário funciona
- [ ] Avaliação após entregue (uma vez)
- [ ] Pix automático (com credenciais de TESTE do Mercado Pago em Configurações → Pagamentos): QR aparece, pagamento aprovado no sandbox marca o pedido como pago sozinho em até ~6 s; QR expirado oferece gerar outro

### Painel da hamburgueria (`/app`)
- [ ] Pedido novo toca som e aparece no quadro sem recarregar
- [ ] Avançar status pelo quadro e pelo detalhe; histórico mostra quem e quando
- [ ] Cancelar exige motivo; pedido some do quadro e fica no histórico
- [ ] Imprimir comanda (58/80 mm)
- [ ] PDV (`/app/pedidos/novo`) cria pedido de balcão/mesa já pago
- [ ] Cozinha (`/app/cozinha`) mostra só pedidos reais confirmados/em preparo, tempo por pedido, “Pronto” com um toque
- [ ] Entregador (`/app/entregador`) vê só as próprias entregas; “Saí” e “Entreguei”
- [ ] Estoque: pedido confirmado baixa insumos da ficha técnica uma vez; cancelamento antes do preparo devolve
- [ ] Insumo zerado deixa produto “esgotado” automaticamente (quando marcado)
- [ ] Caixa: abrir, sangria, suprimento, fechar com diferença; pedidos pagos entram no caixa
- [ ] Financeiro e despesas (recorrente gera próxima)
- [ ] Clientes: VIP/inativo, histórico; fidelidade credita pontos e resgata recompensa
- [ ] Mesas: QR Code baixa/imprime; conta da mesa fecha com pagamento
- [ ] Relatórios: períodos, exportar CSV abre no Excel com acentos
- [ ] Funcionários: convidar (cria login), trocar função, desativar; permissões personalizadas escondem menus
- [ ] Configurações: logo/banner (upload), cores com prévia, horários com turno após meia-noite, exceções, Pix, CRM
- [ ] Abrir/fechar loja manualmente pelo topo
- [ ] Ctrl+K, busca global, atalhos (N, P, C…) não disparam dentro de campos de texto
- [ ] Notificações: novo pedido, estoque baixo, avaliação

### Cadastro e onboarding
- [ ] `/cadastro` cria conta + loja; endereço do cardápio validado em tempo real
- [ ] Onboarding: 6 etapas com barra de progresso, “Terminar depois” e retomada na etapa certa
- [ ] Ao concluir, cardápio publicado com o produto criado

### Painel master (`/master`)
- [ ] Visão geral com MRR, recebido no mês, atraso, trials
- [ ] Nova empresa cria login do dono e a loja
- [ ] Alterar plano/preço; gerar fatura; dar baixa reativa a assinatura
- [ ] Suspender: loja para de receber pedidos; reativar volta
- [ ] Abrir painel da empresa (suporte)
- [ ] Tornar/remover admin da plataforma; não é possível remover o próprio acesso
- [ ] Fechar cadastros em Configurações bloqueia `/cadastro`
- [ ] Recebimento das mensalidades: salvar token TEST-, “Testar conexão”; na loja, Configurações → Assinatura → Pagar mensalidade mostra QR; pagamento aprovado no sandbox dá baixa sozinho em até ~6 s

### Segurança (fazer com duas contas de empresas diferentes)
- [ ] Usuário da empresa B, logado, abre `/app/pedidos/<id-de-pedido-da-A>` → 404
- [ ] Chamadas diretas à API REST do Supabase com o token da B não retornam dados da A
- [ ] `SUPABASE_SERVICE_ROLE_KEY` não aparece em nenhum arquivo `.js` servido ao navegador (procure em `.next/static`)
