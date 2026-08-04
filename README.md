# Fidgets

Loja online de fidgets impressos em 3D sob encomenda: preview do modelo em 3D, escolha de
cor/material (sólido, dual-color ou especiais como madeira) e tamanho, checkout como
convidado com Pix (Woovi) e entrega por retirada em mãos ou Superfrete.

## Stack

- **App**: Next.js 16 (App Router) + TypeScript + React, Tailwind CSS + shadcn/ui
- **Preview 3D**: react-three-fiber + drei (modelos convertidos de STL para GLB no upload)
- **Dados**: Supabase (Postgres + Storage + Auth do admin) via Drizzle ORM
- **E-mail**: Resend (confirmação de pedido + link de rastreio)
- **Pagamento**: Woovi (Pix) na Fase 1, com abstração pronta para plugar Asaas depois
- **Frete**: retirada em mãos na Fase 1; Superfrete na Fase 2
- **Testes**: Vitest + React Testing Library (unit/integração), Playwright (E2E)
- **Hospedagem**: Vercel

Arquitetura organizada por feature em [src/features](src/features) (catalog, checkout,
orders, payments, shipping), rotas em [src/app](src/app), acesso a dados em
[src/server/db](src/server/db).

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um projeto no [Supabase](https://supabase.com) e copie `.env.example` para `.env`,
   preenchendo com as chaves do projeto (URL, anon key, connection strings do Postgres).

3. Gere e aplique as migrations do banco:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. Rode o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando              | Descrição                                        |
| --------------------- | ------------------------------------------------- |
| `npm run dev`          | Servidor de desenvolvimento                        |
| `npm run build`        | Build de produção                                  |
| `npm run lint`         | ESLint                                             |
| `npm run test`         | Testes unitários/integração (Vitest)               |
| `npm run test:watch`   | Vitest em modo watch                               |
| `npm run test:e2e`     | Testes E2E (Playwright — builda e sobe o app antes) |
| `npm run db:generate`  | Gera migration a partir do schema Drizzle          |
| `npm run db:migrate`   | Aplica migrations pendentes no banco               |
| `npm run db:studio`    | Abre o Drizzle Studio para inspecionar o banco      |

## Observações

- O plano gratuito (Hobby) da Vercel tem restrição de uso comercial nos termos de serviço;
  o plano é migrar para o Pro quando a loja for ao ar para vendas reais.
- `src/proxy.ts` é o arquivo de Proxy do Next.js 16 (substituiu o antigo `middleware.ts`) —
  protege as rotas `/admin` exigindo sessão do Supabase Auth.
