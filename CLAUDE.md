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
- Pagamento: Woovi (Pix) implementado (`src/features/payments/woovi.ts`).
  Endpoint `https://api.woovi.com/api/v1/charge`, header `Authorization:
  <AppID>` (sem prefixo Bearer). Webhook em `src/app/api/webhooks/woovi/route.ts`
  valida a assinatura (`x-webhook-signature`) com a **chave pública da própria
  Woovi**, que é fixa/hardcoded no código (é pública por definição, só serve
  pra verificar — não precisa de env var de secret). Criar cobrança é
  "best effort" no checkout: se `WOOVI_APP_ID` não estiver configurada ou a
  chamada falhar, o pedido é criado do mesmo jeito, só sem QR code de Pix
  ainda. **Nunca testado de verdade** (sem AppID de sandbox/produção
  disponível nesta sessão) — conferir contra a doc oficial
  (developers.woovi.com) antes de confiar 100% em produção. Asaas fica pra
  Fase 3, nada implementado.
- Frete: só retirada em mãos funciona (Fase 1) — o checkout nem oferece
  Superfrete ainda como opção. Tipos em `src/features/shipping/types.ts`.
- Checkout: **sem conta de cliente** — convidado, pedido criado via
  `submitOrder` (`src/features/checkout/actions.ts`), que recalcula os preços
  no servidor a partir do catálogo (nunca confia no preço do carrinho),
  tenta gerar a cobrança Woovi e manda e-mail de confirmação — os dois
  últimos passos são best-effort e não derrubam a criação do pedido se
  falharem. Rastreio por link único (`/pedido/[token]`), com o QR/copia-cola
  do Pix quando existir.
- E-mail: Resend (`src/features/orders/email.ts`), best-effort (loga e
  segue se `RESEND_API_KEY` não existir). **Atenção**: o remetente padrão
  `onboarding@resend.dev` só é confiável pra testes — a Resend normalmente só
  entrega esse remetente pro e-mail dono da conta; pra mandar pra clientes de
  verdade precisa verificar um domínio próprio na Resend e trocar
  `RESEND_FROM_EMAIL`.
- Testes: Vitest + RTL (`npm run test`), Playwright E2E (`npm run test:e2e`).
  CI (GitHub Actions) instala o Chromium sozinho na nuvem — **não precisa
  instalar os browsers do Playwright localmente**, são ~700MB e a máquina do
  usuário tem espaço limitado. Se precisar rodar E2E localmente por algum
  motivo, `npx playwright install chromium` e remover depois.

## Status (atualizado em 2026-08-04)

O usuário já conseguiu logar no `/admin` (confirma que Supabase Auth + env
vars da Vercel para autenticação estão funcionando). Ainda não confirmado se
`/admin/produtos` e `/admin/materiais` mostram os dados seedados (depende de
`DATABASE_URL`/`DIRECT_DATABASE_URL` estarem certas na Vercel) — **primeira
coisa a checar numa sessão nova se o usuário disser que algo não carrega**.

**Feito — infraestrutura:**
- Scaffold completo, CI (lint/test/build/e2e), schema do banco, migration
  (`drizzle/0000_romantic_piledriver.sql`) e seed (`scripts/seed.sql`) já
  aplicados no Supabase pelo usuário
- Repositório no GitHub (mateusbatatais/3dteu, branch `main`), Vercel
  conectado ao GitHub (deploy automático a cada push) e ao Supabase
  (integração nativa)
- Login do admin funcionando de verdade (confirmado pelo usuário)

**Feito — catálogo:**
- `/produtos` e `/produtos/[slug]` **ligados ao banco real** (nada de dado
  mockado — `demo-data.ts` foi removido)
- Preview 3D + configurador de produto (tamanho/cor por parte + preço ao
  vivo)
- CRUD de produtos (`/admin/produtos`), materiais (`/admin/materiais`),
  tamanhos e partes+materiais (dentro da edição do produto)

**Feito — compra (implementado nesta sessão, ainda não testado contra banco
real nem contra a API da Woovi de verdade):**
- Carrinho (Zustand + localStorage) — testado antes, continua igual
- Checkout (`/checkout`): formulário de nome/e-mail/telefone, só retirada em
  mãos por enquanto, cria o pedido via `submitOrder`
- Pedido: `Order` + `OrderItem`s gravados com preço recalculado no servidor
- Pagamento: `WooviProvider` criado, tenta gerar cobrança Pix ao finalizar o
  pedido (best-effort — sem `WOOVI_APP_ID` o pedido é criado normalmente, só
  sem QR code)
- Webhook `/api/webhooks/woovi` — recebe confirmação de pagamento, valida
  assinatura RSA com a chave pública da Woovi, marca o pedido como pago
- E-mail de confirmação via Resend (best-effort, idem)
- `/pedido/[token]` — página de rastreio real (status, itens, total, QR Pix
  se existir)
- Admin de pedidos (`/admin/pedidos`, `/admin/pedidos/[id]`) — lista, detalhe,
  trocar status manualmente

**Pendente pra fechar o ciclo:**
- Confirmar env vars da Vercel (`DATABASE_URL`, `DIRECT_DATABASE_URL`
  principalmente) e testar uma compra de ponta a ponta
- Criar conta na Woovi e configurar `WOOVI_APP_ID` + a URL do webhook
  (`https://SEU-DOMINIO/api/webhooks/woovi`) no painel deles — sem isso, o
  Pix não é gerado (pedido é criado mas fica "aguardando configuração")
- Criar conta na Resend, configurar `RESEND_API_KEY` e verificar um domínio
  próprio (sem isso, e-mail não é enviado ou só chega pro dono da conta)
- Criar o primeiro usuário admin (o usuário já fez isso e confirmou que
  loga) — só falta garantir a linha em `admin_users` existe de fato
- Usuário autorizou os conectores MCP da Vercel/Supabase no claude.ai, mas
  as ferramentas não apareceram em nenhuma sessão até agora — continuar
  rodando `ToolSearch` no início de sessões novas pra checar

**Ainda não iniciado:**
- Upload de STL com conversão pra GLB (partes hoje só têm nome + materiais,
  sem arquivo de malha — o viewer usa placeholder)
- Superfrete (cálculo de frete + etiqueta) — Fase 2
- Asaas (cartão/boleto) — Fase 3
- SEO avançado (sitemap, JSON-LD, OG dinâmico)

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
