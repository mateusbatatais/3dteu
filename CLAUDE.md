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
- Rotas da loja (home, produtos, carrinho, checkout, pedido) ficam no route
  group `src/app/(loja)/` com layout próprio (`SiteHeader`/`SiteFooter`,
  `src/components/site-*.tsx`). Rotas autenticadas do admin ficam em
  `src/app/admin/(dashboard)/` com menu lateral (`admin/(dashboard)/layout.tsx`);
  `admin/login` fica fora desse grupo, só dentro do `admin/layout.tsx` externo
  (bem enxuto), pra não mostrar o menu na tela de login. Nomes de grupo entre
  parênteses não aparecem na URL.
- Cor de marca: roxo/violeta (`--primary` em `oklch(... 293)` no
  `globals.css`) substituindo o cinza neutro puro do preset original do
  shadcn — decisão de design, não peça de dado técnico; se o usuário definir
  uma identidade visual própria depois, é só trocar essas variáveis.
- **Bug real corrigido**: `globals.css` tinha `--font-sans: var(--font-sans)`
  (circular!) em vez de `var(--font-geist-sans)` — a fonte nunca resolvia e
  o site inteiro caía no serif padrão do navegador. Isso não era só um
  detalhe estético, contribuiu bastante pra sensação de "site malfeito"
  reportada pelo usuário. Corrigido; qualquer relato futuro de "fonte
  estranha" merece checar se essa variável não foi reintroduzida errada.
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
- Preview 3D: react-three-fiber + drei + `three-stdlib` (`STLLoader`). O STL
  é carregado **direto no navegador, sem conversão pra GLB** — decisão
  deliberada pra simplificar (GLB era over-engineering; STL já é geometria
  pura, dá pra tingir o material sem precisar clonar/percorrer uma cena).
  Upload de STL é feito no admin (ver "Upload de arquivo 3D" abaixo). Enquanto
  uma parte não tem `meshFileUrl`, o viewer (`product-viewer-3d.tsx`) desenha
  uma peça placeholder colorida em vez de quebrar. `ProductViewer3D` aceita
  `interactive={false}` (sem `OrbitControls`) — é o que a listagem
  (`/produtos`) usa pra desenhar uma miniatura 3D real de cada produto em vez
  de um ícone genérico; a query `getPublishedProductsForCatalog` traz a
  primeira parte+material de cada produto só pra isso.
- **Toda mutação de produto (preço/status, tamanhos, partes, materiais por
  parte, upload de STL) precisa revalidar tanto o admin quanto a página
  pública** (`/produtos/[slug]`) **e a listagem** (`/produtos`) —
  `revalidateProductPages(productId)` em `actions.ts` centraliza isso. Bug
  real que já aconteceu: upload de STL só revalidava o admin, então a loja
  continuava mostrando a peça antiga/placeholder. Se um admin mudar algo e o
  cliente relatar "não mudou nada", primeiro suspeitar de uma action nova
  que esqueceu de chamar `revalidateProductPages`.
- **Upload de arquivo 3D**: `uploadPartMesh` (`src/features/catalog/actions.ts`)
  recebe o `.stl` de um `<input type="file">`, sobe pro bucket `models` do
  Supabase Storage (público — são só modelos de preview, sem dado sensível)
  via `src/lib/supabase/storage.ts` (cliente com a service role key, só usar
  em código de servidor) e grava a URL pública em `meshFileUrl`/`stlFileUrl`.
  O bucket precisa existir no Supabase antes de funcionar — SQL em
  `scripts/storage-setup.sql`, rodar uma vez no SQL Editor (ainda não
  confirmado que o usuário rodou). UI fica em `MeshUploadForm`
  (`src/features/catalog/components/mesh-upload-form.tsx`), um Client
  Component usando `useActionState` pra mostrar erro/loading — é a única
  parte do admin que precisou de `"use client"` pra isso; o resto do CRUD
  usa Server Actions ligadas direto a `<form>` sem JS de cliente.
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
- Testes: Vitest + RTL (`npm run test`) rodam no CI e no pre-commit (Husky).
  Playwright E2E (`npm run test:e2e`) é **só manual** — tirado do CI porque
  instalar o Chromium a cada push consumia muita cota do GitHub Actions. Os
  browsers do Playwright (~700MB) não ficam instalados localmente por padrão
  — máquina do usuário tem espaço limitado; se precisar rodar E2E localmente,
  `npx playwright install chromium` e remover depois (`rm -rf` nas pastas
  `chromium-*`/`chromium_headless_shell-*` dentro de
  `%LOCALAPPDATA%\ms-playwright`, sem mexer em versões que já existiam antes).

## Status (atualizado em 2026-08-04)

Login do admin confirmado funcionando em produção. `/admin/produtos` deu erro
("This page couldn't load") — causa raiz identificada e corrigida: a
integração nativa Vercel↔Supabase cria as env vars do Postgres com nomes
`POSTGRES_URL`/`POSTGRES_URL_NON_POOLING`, não `DATABASE_URL`/
`DIRECT_DATABASE_URL` (que o código pedia). `src/server/db/client.ts` e
`drizzle.config.ts` agora aceitam os dois nomes (fallback), então **não é
necessário duplicar nada na Vercel** — só falta o usuário confirmar que
funcionou depois do redeploy desse fix.

Usuário achou o visual "muito feio e mal feito" **duas vezes seguidas**,
mesmo depois de uma primeira passada de design só na loja — e nessa segunda
rodada também disse "não achei aonde incluir o STL, estou perdido" e
perguntou se não valeria trocar pro Material UI. Decisões tomadas:
- **Não trocamos pra Material UI** — recomendei manter shadcn/Base UI
  (biblioteca sólida e atual; MUI tem estética "Google Material" datada e
  trocar significaria reescrever tudo sem garantia de resolver o problema
  real). Se o usuário insistir depois de ver a segunda passada de design,
  reconsiderar — mas não fazer de novo sem alinhar antes, é uma mudança grande.
- Causa raiz real da "feiura" era em boa parte o **bug da fonte serifada**
  (ver acima) — confirmado reproduzindo o **site real em produção**, não só
  local. Corrigido.
- "Estou perdido" no admin era porque **não existia upload de STL nenhum**
  e **não existia menu de navegação** no admin (só um link de texto pra
  voltar ao dashboard) — os dois foram implementados nesta sessão (ver
  abaixo). O admin também recebeu uma passada de polimento visual (cantos
  arredondados/anel consistente com a loja), mas não uma reformulação
  completa.

Rodada seguinte: usuário testou o upload de STL num produto já existente e
"não mudou o cubo no site", e notou que o catálogo não mostra nenhum preview
do produto (só um ícone genérico). Duas causas reais, corrigidas:
- **Bug de revalidação**: `uploadPartMesh` (e toda outra action de
  tamanho/parte/material) só revalidava a página do admin, nunca a página
  pública do produto nem a listagem — por isso a loja podia continuar
  mostrando a versão antiga mesmo com o upload tendo funcionado. Centralizei
  a revalidação em `revalidateProductPages()`. **Ainda não confirmado se
  isso resolve o caso relatado** — também é possível que o upload em si
  tenha falhado (ex.: bucket `models` não criado ainda); pedir pro usuário
  tentar de novo e reportar se aparece alguma mensagem de erro no formulário.
- **Catálogo sem preview**: implementado — `/produtos` agora desenha uma
  miniatura 3D de verdade (mesmo `ProductViewer3D`, sem `OrbitControls`) pra
  cada produto que já tem STL, com fallback pro ícone genérico.

Rodada seguinte a essa: usuário confirmou "na verdade parece que não salva o
stl" — **achei a causa raiz de verdade**, reproduzida localmente: **Server
Actions do Next.js limitam o corpo da requisição a 1MB por padrão**, e um
`.stl` real passa disso com folga. O upload travava a página inteira com o
mesmo erro genérico "This page couldn't load" que apareceu antes pro
`DATABASE_URL`. Corrigido em `next.config.ts`
(`experimental.serverActions.bodySizeLimit: "50mb"`) — **testei de verdade**:
gerei um arquivo de 2MB, submeti via Playwright contra o `uploadPartMesh`
real, e confirmei que ele passa da barreira de tamanho e chega no código
(o erro que aparece depois é só a falta de credencial do Supabase nesta
máquina, esperado). Também:
- Envolvi `uploadPartMesh` inteiro num try/catch — antes, qualquer erro
  inesperado (não só o de tamanho) derrubava a página inteira em vez de
  mostrar uma mensagem no formulário. Esse padrão (nunca deixar uma Server
  Action lançar sem tratamento pro cliente) vale a pena revisar nas outras
  actions também se aparecer o mesmo tipo de sintoma.
- Adicionei uma prévia 3D de verdade **dentro do editor de partes no
  admin** (`ProductPartsManager`), miniatura pequena ao lado do botão de
  upload, mais um link "Ver arquivo enviado" com a URL direta — resolve o
  "não sei mais qual STL subiu": antes só existia um texto
  "Malha 3D cadastrada ✓" sem nenhuma confirmação visual real.

**Ainda não confirmado**: se isso resolve o caso relatado end-to-end contra
o Supabase de produção (só testei localmente sem credenciais reais, o que
prova que a barreira de tamanho foi removida mas não prova que o upload
completo — Storage + banco — funciona de ponta a ponta). Também não
confirmado se o bucket `models` já foi criado (`scripts/storage-setup.sql`).
  cada produto que já tem STL cadastrado, com fallback pro ícone genérico
  só quando nenhuma parte tem malha ainda.

**Feito — infraestrutura:**
- Scaffold completo, schema do banco, migration
  (`drizzle/0000_romantic_piledriver.sql`) e seed (`scripts/seed.sql`) já
  aplicados no Supabase pelo usuário
- Repositório no GitHub (mateusbatatais/3dteu, branch `main`), Vercel
  conectado ao GitHub (deploy automático a cada push) e ao Supabase
  (integração nativa)
- Login do admin funcionando de verdade (confirmado pelo usuário)
- CI (GitHub Actions) roda só lint+test+build a cada push — **E2E saiu do CI**
  (consumia muita cota instalando o Chromium a cada vez) e agora só roda
  manualmente com `npm run test:e2e`. Em troca, **Husky** foi configurado:
  `pre-commit` roda lint+testes unitários, `pre-push` roda o build — ambos
  locais, testados e funcionando.

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

**Feito — design (loja completa + base do admin):**
- `SiteHeader` (logo, link pro catálogo, ícone de carrinho com contador) e
  `SiteFooter` — loja inteira em `src/app/(loja)/`
- Cor de marca violeta aplicada via `globals.css` (afeta o app inteiro)
- **Bug da fonte serifada corrigido** (impacto grande, ver acima)
- Home com seção de destaques (3 cards com ícone), cards de produto na
  listagem com thumbnail placeholder, swatches de material com anel de
  seleção em vez de borda+escala, caixa de preço destacada no configurador
- **Admin ganhou um menu lateral de verdade**
  (`admin/(dashboard)/layout.tsx`): Dashboard/Produtos/Materiais/Pedidos
  sempre visíveis, com fallback de nav horizontal no mobile (sem hamburguer/
  drawer, só uma lista com scroll horizontal — simplificação deliberada)
- Cantos/anel do admin (materiais, tamanhos, pedidos) alinhados ao mesmo
  padrão visual da loja (`rounded-xl` + `ring-1 ring-foreground/10`)
- Verificado visualmente (headless) contra **o site real em produção**
  (não só local) pra confirmar o bug da fonte e o resultado das mudanças.
  O upload de STL e o carregamento via `STLLoader` foram testados com um
  arquivo STL de exemplo gerado na hora (cubo ASCII simples) servido
  localmente — confirma que o parsing/render funciona, mas **não testei o
  upload de verdade pro Supabase Storage** (sem credenciais nesta máquina,
  e o bucket `models` pode nem existir ainda — ver `scripts/storage-setup.sql`).

**Pendente pra fechar o ciclo:**
- Rodar `scripts/storage-setup.sql` no SQL Editor do Supabase (cria o bucket
  `models`) — sem isso, o upload de STL falha. **Provavelmente ainda não foi
  feito**, perguntar/confirmar numa sessão nova.
- Confirmar que o upload de STL funciona de ponta a ponta contra o Supabase
  real (só testei o parsing/render do STLLoader com arquivo local, não o
  upload em si)
- Testar uma compra de ponta a ponta contra o banco de produção
- Criar conta na Woovi e configurar `WOOVI_APP_ID` + a URL do webhook
  (`https://SEU-DOMINIO/api/webhooks/woovi`) no painel deles — sem isso, o
  Pix não é gerado (pedido é criado mas fica "aguardando configuração")
- Criar conta na Resend, configurar `RESEND_API_KEY` e verificar um domínio
  próprio (sem isso, e-mail não é enviado ou só chega pro dono da conta)
- Usuário autorizou os conectores MCP da Vercel/Supabase no claude.ai, mas
  as ferramentas não apareceram em nenhuma sessão até agora — continuar
  rodando `ToolSearch` no início de sessões novas pra checar

**Ainda não iniciado:**
- Superfrete (cálculo de frete + etiqueta) — Fase 2
- Asaas (cartão/boleto) — Fase 3
- SEO avançado (sitemap, JSON-LD, OG dinâmico)
- Reformulação visual mais profunda do admin, se o usuário ainda achar
  insuficiente depois desta rodada (menu + polimento básico já entraram)

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
