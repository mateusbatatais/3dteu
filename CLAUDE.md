@AGENTS.md

# 3dteu — Fidgets sob encomenda

Loja de fidgets impressos em 3D sob encomenda: preview 3D do modelo, escolha de
cor/material/tamanho, checkout como convidado com Pix, admin para cadastrar
produtos. Pode vender outras categorias de produto no futuro (arquitetura já
pensada pra isso).

- Repo: https://github.com/mateusbatatais/3dteu
- Deploy: https://3dteu.vercel.app (Vercel Hobby por enquanto — trocar pro Pro
  quando começar a vender de verdade, o Hobby não permite uso comercial)

## Stack e decisões de arquitetura

- Next.js 16 (App Router) + TypeScript, Tailwind + shadcn/ui. **Atenção**:
  este projeto usa o preset "base-nova" do shadcn, que roda em cima de
  `@base-ui/react`, não Radix. `Button` não tem `asChild` — para renderizar
  como outro elemento (ex.: um `<Link>`), usa-se `render={<Link .../>}` +
  `nativeButton={false}`. `Select` usa `defaultValue`/`value`/`onValueChange`
  (igual Radix), mas `Dialog`/`Sheet` também usam `render` em vez de `asChild`.
- Banco: Supabase (Postgres) via Drizzle ORM. `src/server/db/client.ts` é
  **lazy de propósito** (um `Proxy` que só abre a conexão no primeiro uso
  real) — importar o módulo não exige `DATABASE_URL`. Isso existe porque o
  `next build` avalia o módulo de toda rota ao coletar dados de página, e sem
  isso o build quebrava antes do banco existir.
- `/admin` inteiro tem `export const dynamic = "force-dynamic"` no
  `layout.tsx` — é área autenticada, nunca deve ser pré-renderizada
  estaticamente.
- Auth do admin: Supabase Auth. Sessão validada em `src/proxy.ts` — Next 16
  renomeou `middleware.ts` → `proxy.ts` (função exportada é `proxy()`, não
  `middleware()`). Sem `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` configuradas, o
  proxy deixa passar sem checar sessão (só loga um warning) em vez de quebrar
  o app inteiro.
- Preview 3D: react-three-fiber + drei. Modelos são convertidos de STL para
  GLB no upload (upload em si ainda não implementado). Enquanto uma parte do
  produto não tem `meshFileUrl`, o viewer (`product-viewer-3d.tsx`) desenha
  uma peça placeholder colorida em vez de quebrar.
- Preço: `calculateProductPriceCents` (`src/features/catalog/pricing.ts`) é a
  fonte única da verdade — base + modificador de tamanho + soma dos
  modificadores de material por parte. Sempre recalcular no servidor no
  checkout, nunca confiar no preço vindo do carrinho do cliente.
- Pagamento: Woovi (Pix) planejado pra Fase 1, Asaas depois. Interface
  `PaymentProvider` já definida (`src/features/payments/types.ts`), nada
  implementado ainda.
- Frete: retirada em mãos na Fase 1, Superfrete na Fase 2 — só os tipos
  existem (`src/features/shipping/types.ts`).
- Checkout: **sem conta de cliente** — convidado, com rastreio do pedido por
  link único (`/pedido/[token]`) enviado por e-mail via Resend (e-mail ainda
  não implementado).
- Testes: Vitest + RTL (`npm run test`), Playwright E2E (`npm run test:e2e`).
  CI (GitHub Actions) instala o Chromium sozinho na nuvem — **não precisa
  instalar os browsers do Playwright localmente**, são ~700MB e a máquina do
  usuário tem espaço limitado. Se precisar rodar E2E localmente por algum
  motivo, `npx playwright install chromium` e remover depois.

## Status (atualizado em 2026-08-04)

**Feito:**
- Scaffold completo, CI (lint/test/build/e2e), schema do banco
  (`src/server/db/schema.ts`), migration gerada
  (`drizzle/0000_romantic_piledriver.sql`) **e já aplicada no Supabase** pelo
  usuário, junto com `scripts/seed.sql` (produto de exemplo "fidget-cubo")
- Preview 3D + configurador de produto (tamanho/cor por parte + preço ao
  vivo) funcionando — hoje a página `/produtos/[slug]` usa dado mockado
  (`src/features/catalog/demo-data.ts`), ainda não trocada pela query real
  (`getProductBySlug`) por falta de confirmação de que as env vars da Vercel
  estão certas
- Carrinho (Zustand + localStorage) funcionando de ponta a ponta, testado
- CRUD de produtos no admin (`/admin/produtos`, `/novo`, `/[id]`) — campos
  básicos (nome, slug, descrição, categoria, preço, status) via Server
  Actions + Zod. **Não testado contra banco real ainda.**
- CRUD de materiais (`/admin/materiais`) e, na edição do produto, gestão de
  tamanhos (`ProductSizesManager`) e de partes + atribuição de materiais por
  parte (`ProductPartsManager`) — todos via Server Actions ligadas direto a
  `<form action={...}>` (sem JS de cliente extra). **Também não testado
  contra banco real ainda.**
- Repositório no GitHub (mateusbatatais/3dteu, branch `main`), 4 commits
  enviados. Vercel conectado ao GitHub (deploy automático a cada push) e ao
  Supabase (integração nativa)

**Pendente / interrompido nisso:**
- Confirmar se a Vercel tem as env vars certas e redeployar. Nomes
  esperados pelo código: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL` (pooler, porta 6543), `DIRECT_DATABASE_URL` (direta, porta
  5432), `NEXT_PUBLIC_SITE_URL`. A integração nativa Vercel↔Supabase pode ter
  criado nomes diferentes (ex.: `POSTGRES_URL`, `SUPABASE_URL`) — se sim,
  ajustar o código pra usar os nomes reais em vez de pedir pra recriar.
- Criar o primeiro usuário admin (Supabase → Authentication → Add user) +
  inserir na tabela `admin_users`:
  ```sql
  insert into admin_users (id, email, name)
  values ('COLE-O-UID-AQUI', 'seu@email.com', 'Seu Nome');
  ```
- Usuário autorizou os conectores MCP da Vercel e do Supabase no claude.ai
  (Settings → Connectors), mas as ferramentas **ainda não apareceram** —
  testado via `ToolSearch` em duas sessões diferentes, nenhuma ferramenta da
  Vercel/Supabase encontrada até agora. **Rodar `ToolSearch` de novo no
  início de uma sessão nova pra confirmar se já propagou**; se continuar sem
  aparecer depois de mais de uma sessão nova, provavelmente a autorização não
  completou do lado do usuário (conferir em claude.ai se aparece como
  "Connected" de fato).
- Depois que o banco estiver confirmado: trocar `demo-data.ts` por
  `getProductBySlug` de verdade em `/produtos/[slug]`, testar o CRUD do admin
  (produtos, materiais, tamanhos, partes) com dado real, testar o login do
  admin.

**Ainda não iniciado:**
- Upload de STL com conversão pra GLB (as partes hoje só têm nome + materiais
  atribuídos, sem arquivo de malha — o viewer usa placeholder)
- Formulário de checkout (dados do cliente, entrega)
- E-mail transacional (Resend) — confirmação de pedido + link de rastreio
- Integração Woovi (Pix)
- Integração Superfrete (Fase 2)

## Preferências do usuário (importante)

- **Evitar rodar localmente** o que puder rodar em outro lugar — máquina com
  espaço em disco limitado. Não instalar Playwright browsers sem necessidade
  (CI já cobre). Preferir Vercel Preview Deployments pra "ver rodando" em vez
  de `npm run dev`.
- **Nunca pedir pra colar segredos/tokens no chat** sem antes explicar a
  alternativa mais segura (conector OAuth do claude.ai). O usuário topa colar
  se decidir que quer, mas quer conhecer a opção seguro primeiro.
- Só commitar/dar push quando explicitamente combinado — não commitar
  proativamente sem esse alinhamento.
