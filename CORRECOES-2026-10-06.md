# Correções aplicadas — TOP BURGER OS

## Build / Vercel
- Removido `next/font/google` do `src/app/layout.tsx`, eliminando a falha observada no loader de fontes durante `npm run build` na Vercel.
- Fontes trocadas por pilhas locais/sistema no `globals.css`, sem depender de download externo em tempo de build.
- Node.js fixado em `22.x` (`package.json` + `.nvmrc`) para evitar diferenças com Node 24 no ambiente de deploy.
- Dependências principais fixadas em versões exatas para reduzir quebra por atualização automática.

## Supabase / variáveis
- `NEXT_PUBLIC_SUPABASE_URL` agora normaliza automaticamente URL com `/rest/v1`, `/auth/v1`, barras, espaços e aspas.
- Se uma chave `sb_secret_*` ou `sb_publishable_*` for colada por engano no campo de URL, o sistema rejeita a configuração com mensagem clara.
- A chave pública aceita `sb_publishable_*` e anon JWT legado.
- `NEXT_PUBLIC_APP_URL` agora é normalizada e possui fallback seguro para desenvolvimento.
- `SUPABASE_SERVICE_ROLE_KEY` é limpa de espaços/aspas e permanece somente no servidor.

## Carrinho / cupom
- Corrigido o fluxo que mostrava “Informe seu telefone para usar este cupom” sem oferecer onde preencher.
- O carrinho reutiliza o telefone salvo no aparelho quando disponível.
- Se o cupom exigir identificação, aparece um campo de celular/WhatsApp com máscara e botão de validação.
- O telefone é enviado somente para a cotação/validação do cupom.

## Trial / planos
- Mantida a lógica existente de 15 dias grátis com acesso completo aos recursos durante o trial.
- Documentação arquitetural atualizada de 14 para 15 dias.
- Bundles SQL regenerados com todas as 10 migrations, incluindo a migration de trial.

## Auditoria executada
- Todos os arquivos `src/**/*.ts` e `src/**/*.tsx` passaram por verificação de sintaxe via compilador TypeScript.
- Todos os imports locais (`@/` e relativos) foram verificados e resolvem para arquivos existentes.
- Teste unitário de normalização do ambiente Supabase executado com sucesso.
- Nenhuma chave real do Supabase foi adicionada ao projeto; `.env.local` continua ignorado pelo Git.

## Antes de publicar
No Vercel configure:

- `NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...`
- `SUPABASE_SERVICE_ROLE_KEY=sb_secret_...` (segredo, somente servidor)
- `NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO.vercel.app` ou seu domínio final

Depois faça um novo Deploy/Redeploy.
