@AGENTS.md

# 3D Teu

Loja de peças impressas em 3D sob encomenda (fidgets foi só o primeiro
produto — desde a rodada 17 o site e a marca deixaram de ser
fidget-específicos de propósito): preview 3D do modelo, escolha de
cor/material/tamanho, checkout como convidado com Pix, admin para cadastrar
produtos. Nome/logo "3D Teu" — ver rodada 17 pra detalhes do rebrand.

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
- Cor de marca: azul + laranja (`--primary` em `oklch(... 234)` +
  `--brand-orange` em `oklch(... 58)`, ambos no `globals.css`) — extraídas
  por amostragem de pixel da logo oficial (`public/logo-light.png`/
  `logo-dark.png`) na rodada 17, substituindo o roxo/violeta genérico do
  preset original do shadcn usado até então. `--brand-orange` é deliberado
  como acento raro (ex.: a palavra rotativa do slogan), não entra em
  `--primary`/`--accent` (que cobrem toda a UI) pra não pintar tudo de
  laranja.
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
- Preview 3D: react-three-fiber + drei + `three-stdlib` (`STLLoader`,
  `OBJLoader`, `ThreeMFLoader` — os 3 formatos aceitos no upload). Os
  arquivos são carregados **direto no navegador, sem conversão pra GLB**
  (decisão deliberada pra simplificar). STL retorna geometria pura (tinge
  direto); OBJ/3MF retornam um `Group` (clona + percorre a árvore pra
  aplicar a cor escolhida em cada malha — função `retint()`). **Todo
  carregamento fica dentro de um Error Boundary** (`MeshErrorBoundary` em
  `product-viewer-3d.tsx`): um arquivo corrompido ou malformado cai pro
  placeholder daquela parte específica, em vez de derrubar a visualização
  inteira (Suspense sozinho só cobre o estado de carregando, não erro — sem
  o Error Boundary, uma falha de parse sobe até a raiz da árvore do R3F e
  some com todas as partes, não só a que falhou; reproduzi isso com um 3MF
  inválido antes de adicionar a blindagem). Enquanto uma parte não tem
  `meshFileUrl`, o viewer (`product-viewer-3d.tsx`) desenha uma peça
  placeholder colorida. `ProductViewer3D` aceita `interactive={false}` (sem
  `OrbitControls`) — é o que a listagem (`/produtos`) usa pra desenhar uma
  miniatura 3D real de cada produto em vez
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
- **Upload de arquivo 3D — vai direto do navegador pro Supabase Storage,
  NUNCA passa pelo servidor Next.js.** Motivo: Vercel Functions (Server
  Actions inclusive) têm um teto de 4,5MB por requisição que não dá pra
  configurar, e um `.stl` real passa disso com frequência (ver a saga
  completa no histórico de status, mais abaixo, foram 4 rodadas até achar
  essa causa raiz). Fluxo em 3 passos:
  1. `createMeshUploadUrl(partId)` (`src/features/catalog/actions.ts`) pede
     uma signed upload URL ao Supabase (payload minúsculo, só o `partId`)
  2. O navegador manda o arquivo direto pro Supabase com
     `supabase.storage.from("models").uploadToSignedUrl(path, token, file)`
     — usa o cliente **browser** (`src/lib/supabase/client.ts`, anon key),
     não precisa de nenhuma policy de RLS extra (o token já autoriza)
  3. `confirmPartMesh(productId, partId, path)` só grava a URL pública em
     `meshFileUrl`/`stlFileUrl` e revalida
  UI em `MeshUploadForm` (`src/features/catalog/components/mesh-upload-form.tsx`,
  Client Component com `useState`/`useTransition` — é a única parte do
  admin que precisa de JS de cliente pra isso; o resto do CRUD usa Server
  Actions ligadas direto a `<form>`). O bucket `models` precisa existir no
  Supabase antes de funcionar — SQL em `scripts/storage-setup.sql`.
  `src/lib/supabase/storage.ts` (service role, só servidor) e
  `storage-constants.ts` (constante `MODELS_BUCKET`, segura pro cliente
  também) ficam separados de propósito pra não vazar a service role key
  pro bundle do navegador.
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

## Status (atualizado em 2026-08-06, rodada 12 — .3mf pintado/MMU)

Login do admin confirmado funcionando em produção. `/admin/produtos` deu erro
("This page couldn't load") — causa raiz identificada e corrigida: a
integração nativa Vercel↔Supabase cria as env vars do Postgres com nomes
`POSTGRES_URL`/`POSTGRES_URL_NON_POOLING`, não `DATABASE_URL`/
`DIRECT_DATABASE_URL` (que o código pedia). `src/server/db/client.ts` e
`drizzle.config.ts` agora aceitam os dois nomes (fallback), então **não é
necessário duplicar nada na Vercel** — só falta o usuário confirmar que
funcionou depois do redeploy desse fix.

Usuário achou o visual "muito feio e mal feito" e perguntou se não valeria
trocar pro Material UI — **recomendei manter shadcn/Base UI** (biblioteca
atual e sólida; MUI tem estética "Google Material" datada e trocar
significaria reescrever tudo sem garantia de resolver o problema real). A
causa raiz real da "feiura" era em boa parte um **bug real de fonte**: em
`globals.css`, `--font-sans: var(--font-sans)` era **circular** e nunca
resolvia, então o site inteiro caía no serif padrão do navegador — confirmado
reproduzindo **o site real em produção**, não só local. Corrigido.

### A saga do upload de STL (4 rodadas até a causa raiz de verdade)

Isso vale registrar em detalhe porque o sintoma mudava de descrição a cada
rodada, mas a causa foi ficando mais clara conforme reproduzi cada hipótese
em vez de só corrigir no escuro:

1. "Estou perdido, não achei onde incluir o STL" → **não existia upload
   nenhum** nem menu de navegação no admin. Implementados os dois.
2. "Enviei um STL, não mudou o cubo no site" → **bug de revalidação real**:
   toda action de produto (upload incluído) só revalidava a página do
   admin, nunca a pública nem a listagem. Corrigido com
   `revalidateProductPages()`, centralizando a revalidação dos três lugares.
   Também aproveitei pra desenhar uma miniatura 3D de verdade em
   `/produtos` (antes só tinha ícone genérico).
3. "Na verdade parece que não salva" → reproduzi localmente: **Server
   Actions do Next.js limitam o corpo da requisição a 1MB por padrão**, e
   um `.stl` real passa disso. Aumentei pra "50mb" no `next.config.ts` — mas
   isso **não foi suficiente** (ver rodada 4).
4. Usuário testou de novo, deu erro na mesma tela. Causa real: **a Vercel
   tem um teto de 4,5MB por requisição em qualquer Function, e isso NÃO dá
   pra configurar** — o `bodySizeLimit` do Next só ajuda até esse teto da
   plataforma, nunca acima dele. A solução (recomendada pela própria Vercel
   pra esse cenário) é o arquivo nunca passar pelo servidor: **upload direto
   do navegador pro Supabase Storage** via signed upload URL.
   - `createMeshUploadUrl(partId)` (Server Action, payload minúsculo) pede
     uma URL assinada ao Supabase (`storage.createSignedUploadUrl`)
   - o navegador manda o arquivo direto pro Supabase com
     `supabase.storage.uploadToSignedUrl(...)` — o Next.js nunca vê os bytes
   - `confirmPartMesh(productId, partId, path)` (Server Action, também
     minúscula) só grava a URL pública no banco e revalida
   - **Testei de verdade**: gerei um arquivo de 6MB (acima do teto da
     Vercel) e confirmei via Playwright que a requisição que chega no
     servidor tem **40 bytes** — o arquivo nunca passa por lá. A página não
     quebra mais; mostra erro legível no formulário em qualquer cenário de
     falha (todo o fluxo está em try/catch).
   - Também corrigi a usabilidade apontada pelo usuário ("não entendi o
     botão enviar"): `MeshUploadForm` agora tem label clara acima do input
     e o botão "Confirmar envio" abaixo, em vez de lado a lado espremidos.
   - `ProductPartsManager` ganhou uma prévia 3D real por parte (miniatura +
     link "Ver arquivo enviado") — resolve "não sei mais qual STL subiu".

Rodada 5 confirmou que a arquitetura de upload direto **está funcionando de
verdade**: o erro "The related resource does not exist" veio do próprio
Supabase (bucket `models` ainda não criado — usuário não tinha rodado
`storage-setup.sql` ainda), não mais da Vercel/Next.js. Depois de criar o
bucket, rodada 6 trouxe **um terceiro limite de tamanho**, dessa vez do
Supabase: `413 EntityTooLarge`. Existem duas camadas independentes da
Vercel/Next.js:
- **Global file size limit** do projeto (Storage → Configuration no painel) —
  no plano gratuito não passa de 50MB, e o valor inicial costuma vir bem
  menor que isso.
- **file_size_limit por bucket** (opcional, nunca pode ser maior que o
  global) — atualizei `scripts/storage-setup.sql` pra já criar o bucket
  `models` com 50MB explícito (`on conflict do update`, seguro rodar de
  novo), mas isso só ajuda se o limite global do projeto também estiver em
  50MB — **o usuário precisa subir esse valor manualmente no painel**, não
  tem como fazer isso por SQL.

Rodada 7: usuário revelou que **o arquivo real tem 70MB** — passa até do
teto absoluto do plano gratuito do Supabase (50MB, não configurável sem
virar plano pago). Resumo de todas as camadas de limite que apareceram
nessa saga, da mais pra menos restritiva historicamente: Next.js Server
Action body (1MB, contornado com upload direto) → Vercel Function payload
(4,5MB, teto fixo, também contornado) → Supabase Storage global file size
limit + bucket file_size_limit (50MB no free tier, é o teto de verdade).

Nessa rodada, além de explicar o teto de 50MB (opções: reduzir a malha do
STL, exportar como binário em vez de ASCII, ou virar plano Pro do Supabase
— decisão do usuário, não deu pra saber qual ele escolheu), o usuário
repetiu a reclamação de UX: "o file upload tá muito feio e escondido".
Resposta nessa sessão:
- `MAX_MESH_FILE_SIZE_BYTES` (50MB) virou constante compartilhada
  (`storage-constants.ts`) e o `MeshUploadForm` agora **valida o tamanho no
  cliente, na hora de escolher o arquivo** — mostra erro claro
  (`"Esse arquivo tem 70.0MB, e o máximo é 50.0MB..."`) **sem nenhuma
  chamada de rede**, confirmado via Playwright (0 requisições POST feitas
  ao selecionar um arquivo grande demais).
- Redesenhei a seção dentro de `ProductPartsManager`: label
  "ARQUIVO 3D (STL)" em destaque (mesmo estilo dos labels do
  `ProductConfigurator`), caixa com borda tracejada (convenção visual de
  upload), aviso de "Máximo 50.0MB" sempre visível, nome+tamanho do arquivo
  mostrado assim que selecionado. Também reordenei: upload agora vem antes
  da seção de materiais, não depois — é a primeira coisa que aparece dentro
  do card da parte.

Rodada 8: usuário pediu suporte a **.obj e .3mf**, além do .stl. Implementado
de ponta a ponta: `ALLOWED_MESH_EXTENSIONS` (`storage-constants.ts`),
`createMeshUploadUrl` agora recebe a extensão real em vez de fixar `.stl`,
`MeshUploadForm` valida contra a lista e envia com o content-type certo, e
`ProductViewer3D` escolhe o loader certo por extensão. **Testei os 3
formatos de verdade**: gerei um STL e um OBJ válidos à mão e um 3MF (que
acabou saindo inválido — o formato exige uma estrutura de ZIP+XML mais
chata de montar à mão do que vale a pena pra um teste rápido) — STL e OBJ
renderizaram corretamente via Playwright; o 3MF inválido revelou o bug do
Error Boundary acima (ver descrição da blindagem), que só foi adicionada
por causa desse teste. Não teria achado esse problema sem tentar quebrar
de propósito. Ainda não testado um .3mf real exportado de um fatiador de
verdade — o código usa o mesmo padrão comprovado do OBJ, mas vale conferir
na primeira vez que o usuário testar com um arquivo de verdade.

Rodada 9: usuário reportou "o OBJ aparece rápido na página do produto e
depois some — parece algo no eixo/rotação". Reproduzi localmente com um
OBJ em escala realista (cubo de 25mm, como um arquivo de fatiador de
verdade viria, em vez do cubo unitário usado nos testes anteriores) e
`ProductConfigurator` de verdade: a câmera carregava **extremamente
zoomada, cortando o objeto**, e ficava assim indefinidamente (sem
interação) — só corrigia sozinha depois de qualquer clique (cor, tamanho).
Não era rotação nem o objeto sumindo de verdade, era enquadramento de
câmera errado desde o primeiro frame.

Causa raiz (confirmada instrumentando `Bounds` com `console.log`, não
adivinhada): `<OrbitControls>` **não tinha a prop `makeDefault`**, então
nunca se registrava no estado global do react-three-fiber
(`useThree(s => s.controls)` retornava sempre `null`). Sem enxergar os
controles, o método `clip()` do `Bounds` (do `@react-three/drei`) não
conseguia ajustar `controls.maxDistance` pro tamanho real do conteúdo —
e o `maxDistance={6}` fixo que estava no código (pensado pro cubo
placeholder de 1 unidade) capava a câmera bem mais perto do que a
distância de enquadramento correta calculada pro objeto de 25 unidades
(~52). Resultado: câmera grudada no objeto, cortando tudo. Um clique em
cor/tamanho recalculava a malha (`retint` gera um objeto novo) e isso
disparava um novo `fit()+clip()` — mas o `maxDistance` continuava preso em
6, e por pura coincidência de escala o segundo cálculo ficava menos
errado, mascarando o sintoma como "só corrige depois de clicar".

Fix: `<OrbitControls makeDefault enablePan={false} />`, removendo o
`minDistance`/`maxDistance` fixos — agora é o próprio `Bounds` quem ajusta
a distância dinamicamente pro tamanho real de cada malha, seja ela um
cubo placeholder de 1 unidade ou um arquivo real em qualquer escala.
Cheguei a tentar um fix alternativo primeiro (hook manual chamando
`bounds.refresh().fit().clip()` num `useEffect` a cada malha carregada) —
**não funcionou** porque não atacava a causa raiz (controles ausentes),
só repetia a mesma chamada que já rodava automaticamente. Removido depois
de achar a causa real; o `<Bounds fit clip observe>` sozinho já é
suficiente uma vez que os controles estão registrados. Reverificado com
Playwright: enquadramento correto desde os 200ms iniciais, sem precisar
de nenhuma interação, e color/size click continuam funcionando.

**Ainda não confirmado**: se o usuário reduziu/converteu o arquivo pra
caber no limite, ou se optou por upgrade do Supabase. Também não
confirmado se ele já subiu o Global file size limit do projeto pra 50MB no
painel (pendente desde a rodada 6) — sem isso, mesmo um arquivo de 40MB
ainda seria barrado pelo Supabase.

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
- Rodar as migrações `drizzle/0001_brainy_the_order.sql`,
  `drizzle/0002_flawless_runaways.sql`, `drizzle/0003_curvy_boom_boom.sql`,
  `drizzle/0004_empty_amphibian.sql`, `drizzle/0005_solid_lucky_pierre.sql`,
  `drizzle/0006_nappy_banshee.sql`, `drizzle/0007_tan_xavin.sql` e
  `drizzle/0008_rapid_chamber.sql` contra o
  Supabase real (`npm run db:migrate` ou colar o SQL no SQL Editor) — sem
  isso, nada da rodada 10 (Superfrete completo, imagens de produto), da
  rodada 12 (regiões pintadas), da rodada 13 (material padrão por parte),
  da rodada 15 (esconder/definir padrão por região), da rodada 16 (conta de
  cliente — `orders.customer_id` — e avaliações de produto —
  `product_reviews`), da rodada 18 (imagem de categoria —
  `categories.image_url`) nem da rodada 22 (`store_settings.price_per_gram_cents`/
  `fixed_fee_cents`, usados pra sugerir preço a partir do peso estimado)
  funciona contra produção. Todas são só aditivas (CREATE TABLE / ALTER
  TABLE ADD COLUMN), seguras. **Atenção
  pro mesmo problema da rodada 11**: se a 0001 já foi parcialmente aplicada
  antes, rodar de novo pode dar "already exists" num `CREATE TYPE` — nesse
  caso usar a versão idempotente (`DO $$ ... EXCEPTION WHEN
  duplicate_object`) já documentada na rodada 11, não a migração crua.
  **Rodada 15**: usuário relatou `/produtos` com "This page couldn't load"
  em produção — causa raiz quase certa era a 0002/0003 ainda não rodadas
  (a listagem lê `default_filament_option_id`, que só existe depois da
  0003). Passei o SQL idempotente das duas; uma screenshot seguinte do
  usuário já mostra a página de produto funcionando em produção, então
  **provavelmente resolvido**, mas nenhuma confirmação explícita — e a 0004
  (nova nesta rodada) ainda não foi nem oferecida pra rodar.
- Testar upload de um `.3mf` pintado de verdade (o `Bulbasaur.3mf` do
  usuário) contra o Supabase real — só foi testado com o arquivo servido
  estaticamente, nunca através do fluxo de upload signed-URL de verdade.
- Rodar `scripts/storage-setup.sql` no SQL Editor do Supabase (cria o bucket
  `models`) — sem isso, o upload de STL falha. **Provavelmente ainda não foi
  feito**, perguntar/confirmar numa sessão nova.
- Rodar `scripts/storage-media-setup.sql` (cria o bucket `product-media`,
  novo na rodada 10) — sem isso, upload de foto/gif de produto falha.
- Conseguir um token da Superfrete (`SUPERFRETE_API_TOKEN`) e testar a
  cotação de frete de verdade no checkout — a integração inteira (cotação +
  emissão de etiqueta) foi implementada contra a documentação pública, nunca
  contra a API real (mesma ressalva já feita pra Woovi). Preencher
  `/admin/configuracoes` (endereço de remetente) antes de testar a etiqueta.
- Preencher peso/dimensões dos produtos já cadastrados em
  `/admin/produtos/[id]` (aba Info) — sem isso a cotação usa o fallback de
  caixa pequena, que pode dar um valor de frete errado pra peças maiores.
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

### Rodada 10: Superfrete completo + SEO avançado (com imagens/gifs) + polimento do admin

Usuário priorizou 3 frentes de uma vez (Superfrete, SEO avançado, polimento
do admin) e confirmou dois pontos de escopo maior do que o mínimo: (1)
Superfrete inclui emissão de etiqueta de verdade, não só cotação — precisa
de endereço de remetente da loja e dimensões de embalagem por produto, que
não existiam; (2) em vez de imagem OG só gerada por texto, o admin vai poder
subir fotos/gifs reais do produto (a imagem OG usa a primeira foto quando
existir, com fallback pro card gerado por texto). Plano completo (5 etapas)
salvo em `C:\Users\Mateus\.claude\plans\graceful-prancing-corbato.md`.

**Etapa 1 (migração de banco) — feita**: `src/server/db/schema.ts` ganhou
`products.heightCm/widthCm/lengthCm` (nullable — produtos antigos caem num
fallback de caixa pequena até o admin preencher), `orders.shippingCarrierName`
/`shippingServiceId` (guardam o serviço cotado no checkout pra re-cotar na
hora de comprar a etiqueta), tabela `shipments` (espelha `payments`:
provider/externalId/status/rawPayload — só ganha uma linha quando o admin
clica em "comprar etiqueta", nunca automático, já que gasta saldo real da
carteira Superfrete), tabela `storeSettings` (linha única, endereço de
remetente) e tabela `productImages` (galeria de fotos/gifs por produto).
Migração `drizzle/0001_brainy_the_order.sql` gerada e revisada — só `CREATE
TABLE`/`ALTER TABLE ADD COLUMN` aditivos, nada destrutivo, seguro rodar
contra o banco de produção. **Ainda não aplicada no Supabase real** —
próxima sessão/rodada precisa confirmar que o usuário rodou a migração (via
`npm run db:migrate` ou colando o SQL no SQL Editor do Supabase) antes das
próximas etapas fazerem sentido contra o banco de produção.

**Etapa 2 (cotação de frete no checkout) — feita**: `SuperfreteShippingProvider`
(`src/features/shipping/superfrete.ts`) implementado contra a documentação
pública da Superfrete (não testado contra a API real — ver aviso acima).
`checkout-form.tsx` reescrito de `useState` solto pra `react-hook-form` +
`zod` (`schemas.ts`, mesmo padrão do `ProductForm`), com seletor de entrega
(Retirada/Envio), CEP com autocomplete via ViaCEP (`via-cep.ts` — testado de
verdade via Playwright contra a API pública real, funciona), botão "Calcular
frete" e lista de opções de transportadora. `submitOrder` nunca confia no
preço/serviço vindo do cliente: re-cota no servidor (`shipping-quotes.ts`,
`resolveShippingQuotes`) a partir só do CEP + itens, e só aceita gravar o
pedido se o `serviceId` escolhido ainda existir na resposta — mesmo
princípio já usado pra preço de produto. Página de rastreio
(`/pedido/[token]`) e detalhe do pedido no admin passam a mostrar
método de entrega, endereço e transportadora/custo de frete quando houver.

**Bug real pego e corrigido durante o teste desta etapa**: a função que
re-cota o frete (`resolveShippingQuotes`) só tinha try/catch em volta da
chamada à Superfrete — as consultas ao banco (`getStoreSettings`,
`getProductBySlug`) ficavam fora do bloco protegido. Sem banco configurado
localmente (ambiente de dev desta sessão não tem `DATABASE_URL`), cliquei em
"Calcular frete" via Playwright e a falha se propagava sem tratamento.
Corrigido envolvendo a função inteira num único try/catch — reproduzido de
novo depois do fix e confirmado que agora aparece a mensagem "Não foi
possível calcular o frete agora" em vez de quebrar. **Só foi possível testar
a metade client-side do fluxo** (alternar retirada/envio, autofill de CEP
via ViaCEP real, validação de formulário) — a cotação de frete de verdade e
o envio do pedido continuam sem poder ser testados nesta sessão por falta de
banco de dados e de token da Superfrete.

**Etapa 3 (configurações da loja + emissão de etiqueta) — feita**:
`/admin/configuracoes` (novo item no menu lateral) edita o endereço de
remetente (`storeSettings`, upsert por `updateStoreSettings`). `ProductForm`
ganhou 4 campos opcionais (peso/altura/largura/comprimento) — vazio grava
`null` e a cotação usa o fallback de caixa pequena. `purchaseShippingLabel`
(`src/features/shipping/actions.ts`) monta o payload (remetente =
storeSettings, destinatário = endereço do pedido, peso/dimensão = produtos
atuais dos itens) e chama `superfreteProvider.purchaseLabel` — sequência de
3 chamadas (carrinho → pagamento → gerar etiqueta) montada a partir da
documentação pública, **não testada contra a API real** (mesmo aviso da
rodada 2). Botão "Comprar etiqueta com Superfrete" em `/admin/pedidos/[id]`
só aparece se ainda não existe uma linha em `shipments` pro pedido, e pede
confirmação nativa do navegador antes de chamar a action — o clique é a
autorização humana explícita antes do gasto real de saldo.

**Testado nesta etapa** (sem banco real — mesma limitação de sempre neste
ambiente): `StoreSettingsForm` e os novos campos de dimensão do `ProductForm`
são componentes client puros (só recebem props), então deu pra montar os
dois numa página temporária e confirmar visualmente via Playwright que
renderizam e populam corretamente com dados mockados — sem erros de console.
`/admin/configuracoes` de verdade (a Server Component que busca
`storeSettings` no banco) **não pôde ser testada** nesta sessão: como não há
`DATABASE_URL` configurada localmente, ela (e qualquer outra página do admin
que toque o banco, isso já era esperado) retorna 500 neste ambiente de dev.

**Etapa 4 (imagens/gifs de produto + SEO avançado) — feita**:
- Upload de fotos/gifs por produto (`ProductImagesManager`, novo bucket
  `product-media` — `scripts/storage-media-setup.sql`, ainda precisa ser
  rodado no Supabase) reaproveitando 100% a arquitetura de upload direto já
  validada pro STL (signed URL, sem passar pelo servidor). Aparecem como
  galeria abaixo do preview 3D na página do produto (o 3D continua sendo o
  destaque) e no admin com miniatura + badge "Capa" na primeira + botão de
  excluir.
- `Product` (tipo + `getProductBySlug`) passou a expor `description`,
  `metaTitle`, `metaDescription` e `images` — os dois primeiros já existiam
  no banco desde antes mas nunca tinham sido lidos em lugar nenhum.
  `ProductForm` ganhou uma seção "SEO" (título/descrição opcionais).
- `generateMetadata` em `/produtos/[slug]` (título/descrição por produto,
  canonical, JSON-LD `Product` com preço/disponibilidade). Home e listagem
  ganharam `alternates.canonical`. Root layout ganhou `metadataBase`,
  `openGraph`/`twitter` padrão.
- `opengraph-image.tsx` por produto: usa a primeira foto real se existir,
  senão gera um card via `next/og` (nome + preço + marca em fundo violeta) —
  não dá pra "fotografar" o preview 3D no servidor sem um esforço bem maior
  (renderizar three.js fora do navegador), então esse card é o fallback
  pragmático combinado com a opção de foto real da rodada 10.
- `sitemap.ts` e `robots.ts` novos. **Bug de build pego e corrigido**:
  `sitemap.ts` sem `force-dynamic` quebrava o build inteiro tentando
  pré-renderizar contra o banco no momento do build (mesmo motivo que já
  levou `/produtos` a usar `force-dynamic` — CI/local não têm
  `DATABASE_URL`). Reproduzi rodando `npm run build` localmente, adicionei o
  `export const dynamic = "force-dynamic"` e confirmei que o build volta a
  passar.
- Decisão consciente: a coluna `products.ogImageUrl` (já existia no banco,
  nunca usada) ficou sem uso — a galeria de fotos reais supera a utilidade
  dela; não fazia sentido manter dois mecanismos pra mesma coisa.

**Testado nesta etapa** (mesma limitação de sempre — sem `DATABASE_URL`
local): `ProductImagesManager` e a galeria do `ProductConfigurator` são
verificáveis com dados mockados (Playwright confirmou renderização correta,
sem erro de console) e `/robots.txt` é estático — testei contra o dev server
de verdade e o conteúdo saiu certo. `generateMetadata`, o JSON-LD, o
`opengraph-image` de verdade e o `/sitemap.xml` dependem de banco e **não
puderam ser testados** nesta sessão — o build só confirma que compilam
(TypeScript), não que o conteúdo gerado está correto contra dados reais.

**Etapa 5 (polimento visual do admin) — feita, e é a última das 5 etapas
desta rodada**:
- Sidebar e nav mobile ganharam estado ativo de verdade (extraído pra
  `admin-nav.tsx`, client component com `usePathname`) — antes nenhum item
  do menu se destacava na rota atual.
- Dashboard (`/admin`) trocou os 3 cards que só duplicavam o menu por
  números reais (`getAdminDashboardStats`): produtos publicados, pedidos
  aguardando pagamento, pedidos dos últimos 7 dias, faturamento (soma dos
  pedidos com status pago em diante).
- `ConfirmDeleteButton` (novo, `src/components/confirm-delete-button.tsx`,
  usa o `Dialog` do design system que já existia e nunca tinha sido usado em
  lugar nenhum) substitui os `<form><button>Excluir</button></form>` crus
  sem nenhuma confirmação em materiais, parte de produto, tamanho e imagem
  de produto — clique acidental em exclusão era um risco real. Também dá
  toast de sucesso/erro pros 4 fluxos de uma vez só, sem precisar mexer em
  cada um.
- `/admin/produtos/[id]` agrupou Info/Tamanhos/Partes/Imagens em `Tabs`
  (também já existia sem uso) em vez de empilhar tudo verticalmente.
- Status do pedido ganhou uma cor por estado (`ORDER_STATUS_BADGE_CLASSES`)
  — antes só distinguia "aguardando pagamento" do resto; agora os 7 estados
  têm cores distintas (âmbar/esmeralda/azul/violeta/ciano/verde-azulado/
  vermelho), usadas nas 3 telas que mostram o Badge de status.
  `updateOrderStatus` (mudar status do pedido) virou um client component com
  toast (`OrderStatusForm`) em vez de um `<form action>` sem nenhum feedback.
- `/admin/materiais`: pequeno ajuste de respiro/agrupamento no formulário de
  criação (não uma reformulação grande — o formulário já tinha label-em-cima
  -do-campo, só faltava espaçamento e um título de seção).
- **Fora do escopo, por decisão consciente** (mencionado no plano, não
  esquecido): skeletons de loading — exigiria Suspense boundaries por
  página, refactor maior que não compensa pro volume de dados do admin.

**Testado nesta etapa**: Tabs, `ConfirmDeleteButton` (dialog abre, "Excluir"
confirma, dialog fecha, toast "Excluído." aparece), `AdminSidebarNav` (item
da rota atual fica destacado em violeta) e as 7 cores de Badge de status —
tudo verificado com Playwright numa página mockada, sem erro de console. O
dashboard com números reais e o restante do admin continuam sem poder ser
testados contra o banco de verdade nesta sessão (mesma limitação de sempre).

### Resumo da rodada 10 (Superfrete completo + SEO avançado + admin)

As 5 etapas do plano (`C:\Users\Mateus\.claude\plans\graceful-prancing-corbato.md`)
foram concluídas, cada uma com seu próprio commit, lint/test/build passando,
e verificação visual (Playwright) do que dava pra testar sem banco de dados
real. Nada foi testado de ponta a ponta contra o Supabase/Superfrete de
verdade — ver "Pendente pra fechar o ciclo" (mais abaixo) pro que falta o
usuário confirmar/configurar.

**Aviso já registrado no plano**: a integração com a Superfrete (etapas 2 e
3) não pode ser testada contra a API real nesta sessão (sem token) — mesmo
problema já documentado com a Woovi. Vai ser implementada contra a
documentação pública, mas o formato exato de request/response só se
confirma no primeiro teste real.

### Rodada 11: `/admin` quebrado em produção depois da rodada 10

Usuário rodou a migração 0001 (com um recomeço no meio — `CREATE TYPE
"shipment_status"` já existia de uma tentativa anterior que tinha parado no
meio; resolvido com uma versão idempotente do mesmo SQL, `CREATE TABLE IF
NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN
duplicate_object` em volta do `CREATE TYPE`/`ADD CONSTRAINT`, que não têm
"IF NOT EXISTS" nativo no Postgres). Mesmo com a migração aplicada e o
deploy confirmado (`575f6bf`, "Ready" no painel da Vercel), `/admin`
continuava com "This page couldn't load" (React error #441, que em produção
só diz "erro no Server Components render", sem detalhe) logo depois do
login.

**Causa raiz real** (não foi a query de estatísticas do dashboard, que já
tinha sido blindada com try/catch numa tentativa anterior — isso sozinho
não resolveu): `src/app/admin/(dashboard)/admin-nav.tsx` recebia
`NAV_ITEMS` via prop vinda de `layout.tsx` (Server Component), e cada item
carrega `icon: LayoutDashboard` etc. — uma **referência de componente**.
Passar isso de um Server Component pra um Client Component quebra em
produção ("Functions cannot be passed directly to Client Components"),
mesmo passando limpo no `next build` local (TypeScript não pega isso — só
falha no render de verdade, contra uma requisição real). Como o erro
acontecia na camada do **layout**, ele derrubava TODA rota dentro de
`admin/(dashboard)/`, não só o dashboard — o usuário só tinha testado
`/admin` especificamente, mas o sintoma real provavelmente afetava
`/admin/produtos`, `/admin/pedidos` etc. também.

**Por que passou batido na verificação da Etapa 5**: a página de teste usada
pra verificar `AdminSidebarNav` via Playwright tinha `"use client"` no topo
— ou seja, o teste rodou inteiramente do lado do cliente, sem nunca
atravessar a fronteira Server→Client de verdade que só existe quando um
Server Component de verdade (o `layout.tsx` real) passa a prop pro
Client Component. Lição: testar um Client Component isolado numa página
client não prova que o caminho real (Server Component pai → Client
Component filho) funciona.

**Fix**: `NAV_ITEMS` passou a ser definido dentro do próprio
`admin-nav.tsx` (que já é `"use client"`), eliminando a travessia da
fronteira — `AdminSidebarNav`/`AdminMobileNav` não recebem mais `items`
como prop. **Verificado de verdade**: rodei o dev server local e conferi o
log (`.next/dev/logs/next-development.log`) antes/depois — antes da
correção não dava pra reproduzir sem banco real; depois da correção,
`curl http://localhost:3000/admin` retornou **200** mesmo sem
`DATABASE_URL` configurada localmente (o log mostra só o erro esperado de
banco ausente, capturado pelo try/catch do dashboard — nenhum erro de
"functions cannot be passed"). Antes disso, qualquer rota do admin
quebraria já na camada do layout, antes até de tentar consultar o banco.

**Ainda não confirmado pelo usuário**: se `/admin` (e as outras rotas do
admin) já carregam certo em produção depois desse deploy
(commit `0c24f38`) — perguntar/confirmar numa sessão nova se isso não
aparecer registrado como resolvido.

**Ainda não iniciado (fora desta rodada):**
- Asaas (cartão/boleto) — Fase 3

### Rodada 12: suporte a .3mf multi-cor pintado (MMU) por região

Usuário trouxe um arquivo real (`Bulbasaur.3mf`, ~20MB, ~1 milhão de
triângulos) exportado da PrusaSlicer com a ferramenta de **pintura MMU**
(Multi Material Unit) e perguntou se dava pra deixar o cliente escolher uma
cor por região pintada. Investigação revelou que **não é um 3MF
multi-objeto** (a arquitetura multi-peça existente não se aplica) — é uma
malha única com um atributo proprietário por triângulo
(`slic3rpe:mmu_segmentation`) que o `ThreeMFLoader` (three-stdlib) não
entende. Esse formato **não é documentado oficialmente pela Prusa** (há uma
issue aberta pedindo documentação: prusa3d/PrusaSlicer#13900) — o algoritmo
de decodificação foi extraído direto do código-fonte real deles
(`TriangleSelector.cpp`, `Model.cpp`) e **validado rodando contra o arquivo
real do usuário antes de qualquer código React**: um script Node decodificou
os 1.085.466 triângulos sem nenhum erro, achando 6 regiões (padrão +
Extrusora 1-5) — e um dado que mudou a expectativa de performance: **nenhum
triângulo precisou de subdivisão nesse arquivo** (fator 1.00x), então o
algoritmo de subdivisão geométrica (implementado pro caso geral, também
portado do código-fonte) provavelmente não entra em ação na maioria dos
arquivos reais.

**O que foi implementado:**
- `src/features/catalog/mmu-3mf.ts` — parser completo (roda no navegador,
  usa `fflate` pra unzip): decodifica o atributo por triângulo e agrupa por
  região numa `BufferGeometry` cada. Duas funções: `detectPaintedStates`
  (passagem rápida, só descobre quais regiões existem — usada no upload) e
  `parsePaintedThreeMf` (parse completo — usada no viewer).
- `src/features/catalog/mmu-3mf-loader.ts` — `MmuPaintedThreeMFLoader`,
  mesmo padrão do `STLLoader`/`ThreeMFLoader` já usados (`extends
  THREE.Loader`), plugável no `useLoader` do react-three-fiber. **Bug real
  pego no build**: `THREE.Loader<TData = unknown>` por padrão — sem
  parametrizar `extends THREE.Loader<MmuPaintedResult, string>` o
  TypeScript não conseguia inferir o tipo do resultado (`useLoader` lê o
  tipo de `loadAsync`, não do callback de `.load()`).
- Nova tabela `product_part_regions` (migração `0002_flawless_runaways.sql`,
  só aditiva) — guarda só o rótulo e qual estado corresponde a cada região;
  **a geometria em si nunca é armazenada**, é sempre re-parseada do arquivo
  original no navegador.
- Uma parte com regiões escolhe os materiais dos MESMOS já atribuídos à
  parte (reaproveita `productPartMaterialOptions`, sem tabela nova) — uma
  cor por região em vez de uma cor pra peça inteira.
- Admin: `MeshUploadForm` detecta regiões ao escolher um `.3mf` (antes de
  enviar) e mostra "Detectamos N região(ões) pintada(s)"; `confirmPartMesh`
  grava as regiões detectadas (substitui as antigas se o arquivo for
  trocado); `ProductPartsManager` deixa renomear cada região.
- Loja: `ProductConfigurator` mostra uma fileira de swatches por região (em
  vez de uma por parte) quando a parte tem regiões; `pricing.ts` soma o
  modificador de todas as regiões escolhidas.
- Compatibilidade: uma parte sem nenhuma região pintada continua
  funcionando exatamente como antes (0 regiões = comportamento normal).

**Testado de ponta a ponta contra o arquivo real do usuário** (não só o
sintético) — algo raro nesta sessão, que normalmente não tem banco/Supabase
disponível: como a geometria nunca é armazenada no banco, dava pra montar
uma página de teste com `ProductConfigurator` recebendo um produto mockado
apontando pro `Bulbasaur.3mf` servido estaticamente, sem precisar de
DB/Supabase nenhum. Confirmado via Playwright: o Bulbasaur renderiza como um
Bulbasaur de verdade (não um blob), aparecem as 6 fileiras de região
esperadas, e clicar numa cor de uma região específica só recolore aquela
região (testado com um cubo sintético de 2 regiões, mais fácil de verificar
visualmente que uma malha de 1M triângulos). Tempo de carregamento completo
da página (as duas malhas, incluindo o Bulbasaur de 20MB) em ambiente local:
6,8s — não dá pra saber o tempo real em produção (rede real, CPU do
navegador do cliente), mas é esperado que arquivos desse tamanho demorem
alguns segundos pra carregar, pintados ou não — isso já seria verdade sem a
funcionalidade de pintura.

**Não validado**: arquivos exportados do **BambuStudio** (fork da
PrusaSlicer que usa o atributo `paint_color` em vez de
`slic3rpe:mmu_segmentation` — ambos os nomes são aceitos pelo parser, mas só
a codificação de bits da PrusaSlicer foi confirmada contra um arquivo real;
se o BambuStudio usar uma codificação ligeiramente diferente, isso só vai
aparecer no primeiro teste com um arquivo de verdade de lá).

### Rodada 13: investigação de orientação (revertida) + layout compacto + material padrão

Usuário reportou o Bulbasaur "deitado" numa captura de tela (provavelmente a
miniatura pequena e cinza do admin, ambígua nesse tamanho) e pediu pra
corrigir. Cheguei a implementar e aplicar uma rotação -90° em X (correção
clássica de Z-up pra Y-up, comum em viewers de STL/3MF de impressão 3D) —
mas antes de comitar, o usuário mandou uma segunda captura de tela, agora da
loja de produção de verdade, mostrando o Bulbasaur **corretamente em pé**,
sem essa correção. Testei os dois lados (com e sem a rotação) contra o
arquivo real via Playwright antes de decidir: **sem rotação renderiza
correto** (bate com a produção); a correção teria piorado, não corrigido.
Revertida sem commitar — é o tipo de coisa que só o teste real revela; a
"primeira" tentativa de blank/deitado no meu teste local era só o arquivo
grande (20MB/1M triângulos) precisando de mais tempo pra carregar numa
máquina já carregada de tantos testes nesta sessão, não um bug de eixo.
**Lição**: não existe bug de orientação nos arquivos de impressão 3D deste
projeto — não repetir essa hipótese sem evidência visual direta de novo.

Na mesma leva, dois ajustes reais no configurador:
- **Layout compacto**: uma parte com várias regiões pintadas (ex.: o
  Bulbasaur com 6) agora agrupa tudo num card único com as regiões em
  grade de 2-3 colunas (`product-configurator.tsx`), em vez de uma fileira
  cheia por região — antes a tela crescia muito rápido com poucas regiões já.
- **Material padrão por parte**: nova coluna `products_parts
  .default_filament_option_id` (migração `0003_curvy_boom_boom.sql`, só
  aditiva) — o admin marca qual material vem pré-selecionado quando o
  cliente abre a página (rádio "Padrão" ao lado de cada checkbox em
  "Materiais aceitos"), em vez de cair no primeiro material da lista
  (ordem arbitrária, sem esse conceito antes). Uma parte com regiões usa o
  mesmo padrão da parte pra todas as regiões (não dá pra definir um padrão
  diferente por região ainda — se precisar disso, é um pedido separado).
  A miniatura da listagem (`/produtos`) também passou a usar o material
  padrão em vez do primeiro da lista.

**Testado com dados mockados** (mesma limitação de sempre — sem banco real
nesta sessão): confirmei via Playwright que a grade compacta renderiza
certo, que os materiais padrão configurados (verde numa parte, madeira
noutra) aparecem pré-selecionados tanto na loja quanto no admin (rádio
marcado), sem erro de console.

**Pendente**: rodar a migração `0003` contra o Supabase real (mesmo
procedimento das anteriores).

### Rodada 14: editar material, bug do material "sólido" e gradiente dual-color no preview 3D

Usuário reportou três coisas em `/admin/materiais`: (1) não tinha como
editar um material já cadastrado, só criar/excluir; (2) não conseguia
entender como criar um material de uma cor só; (3) o degradê de um material
dual-color não aparecia no preview 3D, só o CSS do swatch mostrava o
gradiente.

**Causa raiz do (2), achada investigando o código antes de assumir que era
só falta de instrução na UI**: o formulário de criação tinha os dois
`<input type="color">` (cor + 2ª cor) sempre visíveis e sempre com um valor
preenchido — um `<input type="color">` **nunca fica vazio** no navegador,
então mesmo escolhendo "Cor sólida" o formulário mandava um
`hexColorSecondary` de verdade (o valor padrão do color picker), e
`createFilament` salvava isso sem checar o tipo. Resultado: **todo material
"sólido" criado por esse formulário na prática virava dual-color** (o swatch
já mostrava gradiente, e agora — depois do fix do item 3 — o preview 3D
também mostraria), sem o usuário ter escolhido isso. Corrigido em duas
camadas: `filament-actions.ts` agora força `hexColorSecondary: null` no
servidor sempre que `type !== "dual_color"` (não confia no que o formulário
manda, mesmo que o campo não devesse nem existir na UI); e o campo "2ª cor"
só é renderizado quando o tipo selecionado é dual-color (não dá mais nem pra
tentar preencher por acidente).

**Fix do (1)**: `createFilament`/`updateFilament` (nova) trocaram de
`FormData` crua pra um objeto tipado (`FilamentInput`), seguindo o mesmo
padrão já usado em `OrderStatusForm` (estado controlado + `useTransition` +
chamar a Server Action direto, sem `<form action>`) em vez do padrão mais
antigo de `<form action={serverAction}>` com `FormData`. `FilamentForm`
(`src/features/catalog/components/filament-form.tsx`) é compartilhado entre
criar e editar (prop `mode`); `FilamentRow`
(`src/features/catalog/components/filament-row.tsx`) troca a linha da
tabela pra esse formulário (pré-preenchido) quando clica em "Editar", com
"Cancelar" pra voltar.

**Causa raiz do (3)**: pra uma peça com arquivo 3D real (STL/OBJ/3MF), o
código só aplicava `part.color` — a `colorSecondary` só era usada no cubo
placeholder (duas caixas empilhadas, nunca um degradê de verdade). Fix:
`buildPartMaterial()` (`product-viewer-3d.tsx`) cria um
`MeshStandardMaterial` normal quando não há 2ª cor, e quando há, remenda o
shader padrão via `onBeforeCompile` pra misturar as duas cores ao longo do
eixo de maior extensão da bounding box da própria geometria (em espaço
local — cada malha/sub-malha tem seu próprio degradê, calculado a partir do
seu próprio tamanho). Escolhido em vez de um material sem iluminação porque
preserva o comportamento de PBR (reflexo do `Environment`, sombreamento)
que as peças de cor única já tinham. `StlPart` e `retint()` (usado por
`ObjPart`/`ThreeMfPart`) passaram a receber `colorSecondary` — antes só o
placeholder recebia.

**Testado com dados mockados** (mesma limitação de sempre — sem
`DATABASE_URL` local): página temporária confirmou via Playwright que (a)
trocar "Tipo" pra "Cor sólida" esconde o campo "2ª cor" (e pra "Dual-color"
mostra), (b) clicar "Editar" numa linha dual-color abre o formulário
pré-preenchido com nome/cor/2ª cor/adicional corretos, (c) um STL real
(caixa de teste 10x30x10mm gerada na hora) com material dual-color mostra
um degradê visível de verdade entre as duas cores ao longo do eixo mais
longo — sem erro de console. Não testei o clique em "Salvar" de verdade
(chamaria `updateFilament`/`createFilament` contra o banco, que não existe
nesta sessão) — a lógica em si é simples (um `UPDATE`/`INSERT` com os
mesmos campos de sempre) e já passa no build/lint/type-check.

### Rodada 15: identificar/esconder/definir padrão por região + paleta única na loja

Usuário mandou uma screenshot do `bulb` real em produção (6 regiões, cada
uma repetindo a mesma paleta de 5 cores — bem verboso na tela) e pediu 3
coisas no admin — (1) conseguir identificar visualmente qual região é qual
antes de renomear, (2) poder esconder uma região que veio errada (ruído da
detecção MMU), (3) escolher um material padrão por região, não só por
parte (a rodada 13 tinha deixado isso de propósito fora do escopo) — e uma
pergunta aberta sobre a repetição de paletas na loja. Como essa última é
uma decisão de UX aberta, usei `AskUserQuestion` com 3 opções antes de
implementar; o usuário escolheu **"Paleta única + lista de regiões"**
(clicar no nome da região pra selecioná-la, depois escolher a cor numa
paleta única compartilhada, em vez de repetir a paleta por região).

**Achado ao investigar o pedido (1)**: a miniatura do admin pra uma parte
com regiões nunca tinha usado `MmuPart` — sempre passava por
`ThreeMfPart`/`retint()` (tingimento único cinza pra malha inteira), então
o admin nunca via as cores reais por região, só um blob cinza. Não era só
"falta uma feature de destacar", a miniatura em si já escondia a
informação por completo.

**Schema** (migração `0004_empty_amphibian.sql`, aditiva): duas colunas
novas em `product_part_regions` — `enabled` (boolean, default true) e
`default_filament_option_id` (uuid, FK pra `filament_options`, mesmo
padrão do default por parte da rodada 13).

**Admin**: `PartRegionsPanel`
(`src/features/catalog/components/part-regions-panel.tsx`, novo) substitui
a miniatura genérica cinza + lista de rename por um preview que realmente
usa `MmuPart` com uma cor por região (a cor do material padrão escolhido,
ou uma cor de uma paleta fixa só pra diferenciar visualmente enquanto
nenhum padrão foi definido). Cada linha de região ganhou: botão
"Destacar" (estado local `highlighted`, sem chamada de servidor — ao
clicar, toda região que NÃO é a destacada vira cinza flat no preview,
isolando visualmente qual pedaço do modelo corresponde àquele nome, antes
de renomear), checkbox "Visível pro cliente" (`enabled`) e um `Select` com
os materiais aceitos da parte pra escolher o padrão daquela região
especificamente (fallback "Usa o padrão da parte" quando null).
`updateRegionSettings` (substituiu `updateRegionLabel`) grava os 3 campos
de uma vez, chamada como função tipada direto do client component
(`useTransition` + toast), mesmo padrão do `FilamentForm` da rodada 14.

**Loja**: `product-configurator.tsx` trocou a grade de "uma paleta por
região" por uma lista de nomes (só as regiões com `enabled=true` — uma
escondida nunca aparece aqui) com um círculo mostrando a cor atual de cada
uma; clicar num nome marca ele como "ativo" (`activeRegionByPart`) e uma
ÚNICA paleta aparece embaixo pra editar só a região ativa
(`resolveRegionDefaultMaterialId`: padrão da região > padrão da parte >
primeiro material). Uma região escondida continua contribuindo pro preço e
pro preview 3D com sua cor padrão fixa (nunca escolhida pelo cliente) — só
não aparece nem na lista nem no resumo do carrinho; não foi preciso mudar
`pricing.ts`, já que o `regionSelections` enviado pro cálculo continua
tendo uma entrada por região (visível ou não), só a UI que filtra.

**Testado de ponta a ponta com o `Bulbasaur.3mf` real** (copiado pra
`public/` temporariamente, removido depois — mesma técnica da rodada 12):
confirmei via Playwright que (a) a miniatura do admin agora mostra cores
reais e distintas por região (antes era um blob cinza), (b) clicar
"Destacar" numa região isola ela mantendo sua cor real e deixa TODO o
resto cinza — revelou inclusive que, neste arquivo real, a região que eu
nomeei de teste como "olhos" corresponde na verdade ao corpo inteiro, não
aos olhos (esperado — os nomes de teste eram arbitrários; o importante é
que o destaque aponta pro pedaço certo da malha, o que confirma a
ferramenta funcionando), (c) uma região com `enabled=false` some da lista
clicável da loja mas continua colorida no preview 3D com o material padrão
definido, (d) clicar numa região diferente da lista + numa cor diferente
da paleta única recolore só o círculo daquela região (confirmado
isoladamente: só "Extrusora 2" mudou de azul pra verde, as outras 4
continuaram azuis) — sem nenhum erro de console em nenhum dos passos.

### Rodada 16 (em andamento): performance do catálogo + novas funcionalidades

Usuário pediu 5 funcionalidades novas em ordem de prioridade (notificação de
pedido novo pro admin, busca/filtro no catálogo, link compartilhável da
configuração, conta de cliente, avaliações de produto) e, antes disso,
reportou o site "muito lento", citando especificamente `/produtos`
("parece tá carregando o modelo e deveria ser só uma img thumb").

**Causa raiz confirmada por leitura de código (não só suspeita)**:
`/produtos` renderizava um `<ProductViewer3D>` completo — um `<Canvas>`
react-three-fiber próprio (WebGL + luzes + `Environment` HDRI buscado por
CDN) — **por card**, e cada um carregava e parseava o arquivo 3D de verdade
(`getPublishedProductsForCatalog` já buscava `meshUrl` pra isso desde a
rodada 8). Pra um produto com regiões pintadas isso significa parsear o
`.3mf` inteiro (no caso do Bulbasaur, 20MB/1M triângulos) só pra desenhar
uma miniatura pequena — multiplicado por N produtos na grade, todos ao
mesmo tempo no carregamento da página. Fazia sentido a "miniatura 3D real"
na época (rodada 8/9), mas o custo ficou claro só com mais produtos
publicados.

**Fix**: `/produtos` não usa mais `ProductViewer3D` nem depende de
three.js — cortado da rota inteira (bundle menor, zero WebGL). A miniatura
agora é: (1) a **foto de capa** do produto (`productImages`, já existente
desde a rodada 10) via `next/image`, se o admin tiver subido alguma; (2) se
não, um bloco colorido simples (CSS, sem 3D) com a cor do material padrão
da primeira parte — sólido ou gradiente pra dual-color; (3) o ícone
genérico de caixa só se o produto não tiver nem foto nem material ainda.
`getPublishedProductsForCatalog` (queries.ts) parou de buscar `meshUrl` e
todas as partes — só a primeira parte (só pra cor) e a primeira imagem
(`limit: 1` nas duas relations). A malha 3D de verdade só é carregada onde
faz sentido: a página do produto individual (`getProductBySlug`), que
sempre teve isso.

De brinde, configurei `next.config.ts` (`images.remotePatterns` pro
domínio `*.supabase.co`) — não existia nenhuma config de imagem antes, por
isso toda imagem vinda do Supabase Storage no projeto (fotos de produto, QR
code Pix) precisava de `unoptimized` pra não quebrar. A nova miniatura já
usa otimização de verdade (resize/WebP via `next/image`) em vez de servir o
arquivo original.

**Testado**: página mockada confirma renderização correta dos 3 estados
(foto/cor/ícone) e **zero `<canvas>` na página** via Playwright — antes
disso não dava pra confirmar objetivamente que o Canvas tinha sumido, só
inferir pelo código. `next build` prova que `ProductViewer3D`/three.js não
é mais importado por essa rota. Não testado contra uma foto real do
Supabase (só uma URL falsa, que confirma que o `remotePattern` deixa a
requisição passar em vez de rejeitar — o 500 que apareceu é só a
otimização de imagem tentando buscar um host que não existe de verdade).

**Feature 1 (feita)**: notificação de pedido novo pro admin —
`sendAdminNewOrderNotification` (`src/features/orders/email.ts`) reaproveita
o Resend já configurado pra confirmação do cliente, manda pra
`ADMIN_NOTIFICATION_EMAIL` (nova env var) com resumo dos itens + link pro
pedido no admin. Best-effort igual ao resto do checkout (não derruba o
pedido se falhar). Chamado em `submitOrder` logo depois do e-mail de
confirmação do cliente.

**Feature 2 (feita)**: busca/filtro no catálogo — `/produtos` agora lê
`?q=` (nome/descrição, `ilike` case-insensitive) e `?categoria=` (slug da
categoria) via `searchParams`, direto na query
(`getPublishedProductsForCatalog` ganhou um parâmetro de filtros opcional).
`CatalogFilters` (client component, `useSearchParams`/`useRouter`) escreve
esses params na URL — busca por texto com debounce de 400ms (`router
.replace`, não polui o histórico a cada tecla), categoria atualiza na
hora. URL fica compartilhável/copiável com o filtro aplicado. Categoria
que não existe (mais) retorna lista vazia em vez de ignorar o filtro
silenciosamente. **Testado** via Playwright contra uma página mockada
(sem banco, mesma limitação de sempre): confirma que digitar e esperar o
debounce atualiza a URL pra `?q=...`, e escolher uma categoria soma
`&categoria=...` preservando o `q` já digitado — sem erro de console. Não
testado contra produtos reais (a query em si é simples e já passa
build/type-check).

**Feature 3 (feita)**: link compartilhável da configuração — botão
"Compartilhar essa cor" em `ProductConfigurator` copia a URL atual da
página com `?config=<selection em JSON>` (`src/features/catalog
/selection-share.ts`: `encodeSelectionForShareUrl`/
`decodeSelectionFromShareParam`) pro clipboard, via `navigator.clipboard
.writeText` + toast. `/produtos/[slug]/page.tsx` decodifica esse param no
servidor e passa como `initialSelection` pro configurador. Nenhum id
(tamanho/material/região) é confiado cegamente: cada campo só usa o valor
do link se ainda for válido pra esse produto (mesma checagem que já existia
pros padrões do admin) — um link antigo com um material removido cai pro
padrão daquele campo específico, não quebra a página nem descarta o resto
da configuração. **Testado de ponta a ponta** via Playwright (com
permissão de clipboard): selecionei tamanho P + cor verde, cliquei
"Compartilhar", li o texto real copiado pro clipboard, abri essa URL exata
numa navegação nova e confirmei que P e verde já vêm pré-selecionados
(preço recalculado corretamente) — sem passar current-selection por props
React nem simular nada, o link copiado de verdade foi reaberto.

**Feature 4 (feita)**: conta de cliente — reaproveita 100% o Supabase Auth
já usado pelo admin (mesmo `signInWithPassword`/`signUp`, mesmo padrão de
formulário do `/admin/login`), sem nenhuma infra nova. Decisão importante:
**checkout continua guest-only, sem nenhuma mudança** — `submitOrder`
(`checkout/actions.ts`) só checa best-effort se existe uma sessão Supabase
ativa no momento da compra e, se existir, grava `orders.customerId` (nova
coluna, migração `0005_solid_lucky_pierre.sql`, nullable, **sem FK** —
mesmo padrão de `admin_users.id` já usado no projeto: `auth.users` vive num
schema do Supabase que o Drizzle não gerencia). Sem sessão (a grande
maioria dos casos hoje), `customerId` fica null e nada muda — zero risco
pro fluxo de checkout já validado nesta sessão.

Páginas novas em `src/app/(loja)/conta/`: `entrar` e `cadastrar` (client
components, mesmo padrão do login do admin), e `/conta` (Server Component
protegido, lista pedidos via `getOrdersByCustomerId` + botão "Sair"). Pedido
feito como convidado ANTES de logar não aparece em "Meus pedidos" (só
pedidos com `customerId` preenchido) — decisão consciente de não tentar
"reivindicar" pedidos antigos por e-mail, evita o risco de alguém ver
pedido de outra pessoa só por saber o e-mail dela. `proxy.ts` ganhou a
mesma proteção que `/admin` já tinha, mas pra `/conta` (exceto
`entrar`/`cadastrar`) — sem checagem de role, qualquer sessão válida entra.
`SiteHeader` ganhou um ícone de usuário linkando pra `/conta`.

**Testado**: `/conta/entrar` e `/conta/cadastrar` renderizam certo contra o
dev server real (sem depender de Supabase pro render inicial, só pro
submit) — confirmado via Playwright, ícone de conta aparece no header.
`/conta` de verdade **não pôde ser testada** (precisa de
`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, ausentes nesta sessão — o
`createClient()` do servidor lança "Your project's URL and Key are
required" sem eles, 500 esperado, mesma limitação de sempre com páginas que
tocam Supabase/banco); a lista de pedidos + badges de status foi conferida
com dados mockados (Playwright, sem erro de console). Fluxo de
signup/login/logout de verdade contra o Supabase real também não testado
— primeira vez que alguém tentar cadastrar uma conta é o teste real desse
caminho.

**Pendente**: rodar a migração `0005` contra o Supabase real (mesmo
procedimento das anteriores — só `ALTER TABLE ADD COLUMN`, aditiva).

**Feature 5 (feita)**: avaliações de produto — nova tabela
`product_reviews` (migração `0006_nappy_banshee.sql`, aditiva): nota (1-5),
comentário opcional, `customerName` (snapshot, mesmo motivo de
`orders.customerName` — `auth.users` não dá pra fazer join direto) e um
índice único `(product_id, customer_id)`. **Decisão**: avaliação exige
conta (`customerId` nunca é null) — evita review anônima/spam fácil sem
precisar de captcha ou moderação. **Não** exige compra verificada nesta v1
(qualquer cliente logado avalia qualquer produto) — poderia cruzar com
`order_items` depois se virar problema de verdade, mas era escopo demais
pro pedido original. Enviar de novo faz `onConflictDoUpdate` na mesma
avaliação (upsert pelo índice único) em vez de duplicar — o mesmo
formulário serve pra criar e editar.

`ProductReviewsSection` (Server Component, `/produtos/[slug]`) mostra
média + contagem (`StarRatingDisplay`, preenchimento fracionário de
verdade via largura percentual, não só arredonda pra estrela inteira),
lista de avaliações, e ou o formulário (`ReviewForm`, com
`StarRatingPicker` de 1-5 discreto) — pré-preenchido se o cliente já tinha
avaliado — ou um convite pra entrar (`/conta/entrar`) quando não há sessão.
A checagem de sessão é best-effort com try/catch: sem isso, um Supabase
Auth mal configurado quebraria a página do produto inteira (que hoje só
depende do banco via Drizzle, nunca de Auth) — a seção de reviews é um
extra, nunca pode derrubar a compra. JSON-LD do produto ganhou
`aggregateRating` quando há pelo menos uma avaliação (rich snippet de
verdade pro Google, não só decorativo).

**Testado com dados mockados** (mesma limitação de sempre — sem
`DATABASE_URL`/Supabase local): confirmei via Playwright que a média
fracionária preenche a estrela proporcionalmente (4.3 preenche ~86% da 5ª
estrela), que escolher uma nota no picker marca exatamente aquela
quantidade de estrelas, e que a lista de avaliações + o aviso de "entre pra
avaliar" renderizam certo — sem erro de console. Não testado o clique em
"Enviar avaliação" de verdade (chamaria `submitProductReview` contra o
banco, que não existe nesta sessão).

**Pendente**: rodar a migração `0006` contra o Supabase real (mesmo
procedimento das anteriores).

Com isso, as 5 funcionalidades pedidas nesta rodada (notificação de pedido
novo, busca/filtro, link compartilhável, conta de cliente, avaliações) e a
correção de performance da listagem estão todas implementadas e commitadas
— nenhuma foi testada de ponta a ponta contra Supabase/produção real
(mesma limitação de toda a sessão).

### Rodada 17: rebrand pra "3D Teu" (logo, cores, slogan rotativo)

Usuário mandou a logo oficial nova (octopus com um carretel de filamento
como "concha", texto "3D TEU" em azul/laranja) e pediu pra redesenhar o
site em cima dela — o nome mudou de "Fidgets" pra "3D Teu" porque a loja
vai vender qualquer peça impressa em 3D, não só fidgets, e o visual antigo
(nome + roxo genérico do preset shadcn) passava a impressão errada de que
só vendia uma coisa só.

**A logo chegou colada na conversa, sem arquivo em disco** — só consegui
processá-la de verdade porque achei os PNGs reais que o usuário tinha
gerado em `Pictures/Screenshots/` (batendo pixel a pixel com o que foi
colado no chat); sem isso não teria como extrair cor nem cortar o slogan.
Encontrei duas variantes (fundo escuro e fundo claro) já prontas pros dois
temas do site.

**Slogan embutido na imagem, removido por corte de verdade** (não
IA/inpainting — o slogan ficava numa faixa própria embaixo do logotipo,
então um crop mecânico com `sharp` resolve sem risco de artefato): cortei
as duas variantes na altura certa (~72% da altura original) e apliquei
`.trim()` pra tirar a margem sobrando, gerando `public/logo-light.png`
(547×141) e `public/logo-dark.png` (574×155) — só o octopus + "3D TEU",
sem texto de slogan. **Limitação conhecida**: são PNGs com fundo
texturizado embutido (não transparente) — cada variante foi pensada pra
combinar com o tema claro/escuro do site respectivamente, mas não é um
recorte perfeito (dá pra notar uma leve textura de fundo diferente do
`--background` do site ao redor do logo, mais perceptível no modo escuro).
Se algum dia o usuário tiver o arquivo fonte (vetor/camadas), dá pra gerar
uma versão realmente transparente.

**Cores extraídas por amostragem de pixel, não chute visual**: escrevi um
script Node que escaneia a logo e agrupa pixels saturados por matiz pra
achar o azul e o laranja dominantes de verdade (picos em `#F0840C`
laranja e `~#1E88B8` azul, não uma média ingênua — a logo tem
gradiente/brilho, então a média simples puxava pra um tom mais apagado
que o real). Convertidos pra OKLCH à mão (fórmula sRGB→OKLab padrão,
sem lib de cor disponível no projeto) pra bater com o formato que o
`globals.css` já usa: `--primary: oklch(0.55 0.14 234)` (claro) /
`oklch(0.72 0.12 234)` (escuro), e um `--brand-orange: oklch(0.72 0.17 58)`
novo, exposto como `--color-brand-orange` (utilitário Tailwind
`text-brand-orange`/`bg-brand-orange`) — usado só em destaques pontuais
(a palavra rotativa do slogan), não em `--primary`/`--accent` (evita pintar
a UI inteira de laranja).

**Slogan rotativo** (pedido explícito do usuário — só "teu", nunca
"tua"/"seu"/"sua" porque não combinam com a logo, que já termina em
"TEU"): `RotatingTeu` (`src/components/rotating-teu.tsx`, client
component) cicla por `["espaço", "negócio", "universo", "dia", "jeito",
"projeto", "mundo"]` a cada 2,4s com fade de opacidade, montando "Teu
___" em laranja. Vira o H1 da home: "Peças em 3D pra **Teu espaço**." (o
resto do texto some por rotação, só a palavra final muda) — reconstrói o
espírito do slogan estático original (`"Fidgets e Criatividade Impressos
para Teu Espaço"`) só que dinâmico, e sem depender do texto embutido na
imagem.

`SiteLogo` (`src/components/site-logo.tsx`) renderiza as duas imagens
sempre (`dark:hidden` / `hidden dark:block`) em vez de trocar via
`useTheme()` client-side — evita o flash de logo errada durante a
hidratação, já que o `next-themes` (`ThemeProvider`, já existia,
`defaultTheme="system"`) aplica a classe `.dark` cedo o suficiente no
`<html>` pro CSS decidir sem esperar JS rodar.

**Copy generalizada** (não é só fidget) em vários lugares: H1 e subtítulo
da home, `metadata` raiz (`título`/descrição/OG), `/produtos` (metadata),
rodapé, sidebar do admin, card de fallback do OG image por produto
(gradiente também trocado de roxo pra azul), remetente padrão dos e-mails
(Resend) e User-Agent mandado pra API da Superfrete — nenhum desses é
crítico funcionalmente, mas deixava "Fidgets" vazando em texto que o
cliente/parceiro de API vê.

**Testado**: Playwright contra o dev server real (não mockado — a home não
depende de banco), luz e escuro via `colorScheme` do browser: confirmei
que a logo certa aparece em cada tema, que o botão/ícones usam o azul novo,
que a palavra rotativa troca de "Teu espaço" pra "Teu negócio" sozinha
depois de ~2,5s, e que rodapé/header batem com a marca nova — sem erro de
console (o único erro visto foi o de sempre, falta de `DATABASE_URL`
local ao testar `/produtos`, não relacionado a essa mudança). `next build`
com o lint/type-check passando confirma que nada quebrou.

**Pendente**: nenhuma migração de banco nesta rodada (mudança 100%
visual). Vale o usuário conferir a logo em produção de verdade (telas
maiores, favicon ainda não trocado — `public/next.svg`/ícone padrão do
Next continuam no lugar, ninguém pediu isso ainda).

### Rodada 18: logo definitiva + favicon + SEO + home vira o catálogo + categorias

Usuário mandou a logo definitiva (substitui a da rodada 17, que era um
rascunho) e o ícone isolado (só o símbolo, pro favicon), pediu pra otimizar
o tamanho dos arquivos, trabalhar SEO, e reformular a home — achou ela
"vazia" e sugeriu não precisar de uma página de catálogo separada (a home
*é* o catálogo), com categorias e mais espaço visual (imagens de fundo,
mesmo que só placeholder por enquanto).

**Logo nova é MUITO melhor que a da rodada 17 — transparência real, não
fundo texturizado**: descobri isso checando o alpha channel de verdade
(`sharp().raw()`) em vez de confiar no preview visual (que mostrava "fundo
preto" — era só o viewer compondo a transparência contra um fundo escuro).
Corner pixels vieram `[0,0,0,0]` (alpha zero de verdade) e a área da letra
`[0,121,154,252]` — arquivo genuinamente transparente. Isso elimina de vez
a limitação registrada na rodada 17 (duas versões claro/escuro por causa de
fundo embutido): agora é **um arquivo só** (`public/logo.png`, 900px,
~127KB) que funciona em cima de qualquer fundo. `SiteLogo` simplificado de
2 `<Image>` com `dark:hidden`/`dark:block` pra 1 só.

**Favicon.ico construído à mão, sem lib**: não tem `png-to-ico`/similar no
projeto nem instalado. O formato ICO com PNGs embutidos (suportado desde
Windows Vista) é simples o suficiente pra montar num script Node: header
`ICONDIR` (6 bytes) + um `ICONDIRENTRY` (16 bytes) por tamanho + os PNGs
crus concatenados. Gerei 4 tamanhos (16/32/48/64px) a partir do ícone
trimado, validei reabrindo cada PNG embutido individualmente com `sharp`
pra confirmar dimensão/formato antes de considerar pronto (sharp não lê
`.ico` direto, então essa foi a forma de validar sem precisar abrir no
Windows/browser). Também gerei `src/app/apple-icon.png` (180×180, fundo
escuro sólido — ícone transparente fica feio no iOS, que não composita
sobre nada) e `src/app/icon.png` (512×512, transparente, convenção do App
Router que cobre navegadores modernos).

**SEO**: JSON-LD `Organization` + `WebSite` (com `SearchAction` apontando
pra `/?q={search_term_string}`, habilita sitelinks search box) adicionado
no `layout.tsx` raiz — antes só existia `Product` JSON-LD por produto.
`robots.ts` ganhou `/conta` no disallow (esquecido quando a conta de
cliente foi implementada na rodada 16). `opengraph-image.tsx` raiz novo
(fallback pra qualquer rota sem OG própria — antes só produto tinha).
Categorias novas geram automaticamente uma URL própria indexável
(`/categorias/slug`) em vez de só um filtro `?categoria=` — melhor pra SEO
que uma URL de busca/filtro genérica.

**Home vira o catálogo, /produtos vira redirect**: o catálogo inteiro
(busca, filtro, grid de produtos — `CatalogFilters`/`ProductGrid`,
`ProductGrid` extraído como componente novo pra ser reaproveitado também
nas páginas de categoria) mudou de `/produtos` pra `/`. `/produtos` virou
uma página que só faz `redirect()` (preserva link antigo/SEO em vez de
404) — `?categoria=X` vira redirect pra `/categorias/X` (categoria é path
agora, não query param), `?q=` é repassado como está. **Efeito colateral
esperado**: a home passou a depender do banco (categorias + produtos),
então ganhou `force-dynamic` e — nesta sessão sem `DATABASE_URL` — não dá
mais pra abrir `/` local sem erro, mesma limitação que já valia pra
`/produtos` antes.

**Categorias viraram uma entidade de verdade**: antes só existiam via um
`categoryId` que o admin escolhia num select ao editar produto — não dava
pra CRIAR uma categoria pela UI, nem dar nome bonito/descrição/imagem.
Nova coluna `categories.image_url` (migração `0007_tan_xavin.sql`,
aditiva) + admin novo em `/admin/categorias` (`CategoryForm`/`CategoryRow`,
mesmo padrão tipado + `useTransition` do `FilamentForm` da rodada 14, não
`FormData`) com upload de imagem de capa (`CategoryImageUpload`,
reaproveita o bucket `product-media` já existente — uma imagem por
categoria, substitui a anterior, não é galeria). `slugify()` (usado no
`ProductForm` também) virou `src/lib/slugify.ts` compartilhado — motivo
real de extrair uma função de 5 linhas pra um arquivo: agora tem 2 call
sites de verdade, deixou de ser prematuro.

**Visual "não vazio" sem fotos de verdade ainda**: como o usuário disse
"pode gerar umas imagens quaisquer que depois atualizo", e não tenho
ferramenta de geração de imagem fotorrealista disponível, optei por
**design abstrato deliberado com as cores da marca** em vez de tentar
fingir fotos de produto (que ficariam obviamente falsas): círculos
desfocados (`blur-3xl`) nas cores azul/laranja atrás do hero (ecoa o glow
neon da própria logo) e tiles de categoria em degradê (uma paleta
diferente por índice) quando a categoria não tem `imageUrl` ainda — o
`CategoryImageUpload` no admin deixa trivial trocar por foto real depois,
sem mudar nenhum componente. `/categorias/[slug]` ganhou um banner
full-width (foto ou degradê) no topo, mesmo padrão.

**Testado com dados mockados** (mesma limitação de sempre — sem
`DATABASE_URL` local, e agora isso vale pra `/` também): confirmei via
Playwright, luz e escuro, que o hero com os círculos de glow + os 4 tiles
de categoria (degradês variados) + o grid de produtos (foto/cor
sólida/dual-color/ícone genérico, os 4 estados) renderizam certo — sem
erro de console. Também confirmei que `/produtos` e
`/produtos?categoria=decoracao&q=vaso` redirecionam pro lugar certo (`/` e
`/categorias/decoracao?q=vaso` respectivamente) contra o dev server real
— isso não precisa de banco, só de `searchParams`, então pôde ser testado
de verdade, diferente do resto.

**Pendente**: rodar a migração `0007` contra o Supabase real (mesmo
procedimento das anteriores — só `ALTER TABLE ADD COLUMN`). Cadastrar
categorias de verdade em `/admin/categorias` (a home só mostra a seção de
categorias se existir pelo menos uma) e, quando tiver fotos reais de
produto/categoria, trocar os placeholders de degradê pelas fotos via
upload — a arquitetura já foi pensada pra essa troca ser só isso, sem
mexer em código.

**Pós-rodada 18**: usuário reportou a home quebrando em produção
("This page couldn't load", erro React #441) — causa raiz confirmada com
uma query de diagnóstico que ele mesmo rodou: `categories.image_url`
(migração 0007) já tinha sido aplicada, mas `orders.customer_id`
(migração 0005) e a tabela `product_reviews` (migração 0006) não. Isso é
mais sério do que parece à primeira vista: **não é só a home** —
`orders.customer_id` quebra qualquer checkout de verdade (o INSERT do
pedido inclui essa coluna incondicionalmente) e `product_reviews` quebra
a página de QUALQUER produto (`ProductReviewsSection` roda em toda
`/produtos/[slug]`). Passei o SQL idempotente das duas.

### Rodada 19: medida automática do arquivo 3D vira sugestão de tamanho (P/M/G)

Usuário perguntou se dava pra extrair as medidas do arquivo 3D enviado, e
uma vez confirmado que sim, pediu pra usar isso pra melhorar o fluxo de
cadastro: hoje o admin cria tamanhos (aba Tamanhos) meio às cegas, sem
saber o tamanho real do arquivo. Proposta dele: subir o arquivo primeiro,
o sistema mede e usa como o tamanho "M" (100%), gerando automaticamente
mais dois — 50% e 150% — com valores arredondados.

**Resposta à pergunta técnica**: sim, dá — os mesmos loaders já usados no
preview 3D (`STLLoader`/`OBJLoader`/`ThreeMFLoader` do three-stdlib) geram
uma geometria da qual dá pra calcular a bounding box (`THREE.Box3`) sem
precisar de nada novo no servidor nem de biblioteca adicional. STL/OBJ/3MF
não têm unidade explícita — assumido milímetro, convenção universal de
fatiadores.

**Implementado**: `measureMeshDimensionsMm()`
(`src/features/catalog/mesh-measure.ts`) roda no navegador, no arquivo que
o admin acabou de escolher (mesmo padrão de "ler antes de subir" já usado
pra detectar regiões pintadas) — devolve largura/altura/profundidade em
mm. `MeshUploadForm` mostra essas medidas assim que o arquivo é
selecionado, e depois do upload confirmado chama `autoGenerateSizeOptions`
(`catalog/actions.ts`): se o produto **ainda não tiver nenhum tamanho**,
cria P (50%), M (100% — o valor medido) e G (150%), com o rótulo
arredondado pro 0,5cm mais próximo pra ficar um número limpo (ex.: 8,37cm
medido vira rótulo "8.5cm") — o `scaleFactor` de verdade aplicado na malha
continua exato (0.5/1/1.5), só o texto mostrado é arredondado. Nunca
sobrescreve tamanhos que o admin já tenha criado manualmente — a checagem
"já existe algum tamanho?" acontece no servidor, não no cliente, pra valer
mesmo se o admin voltar depois. `ProductSizesManager` ganhou uma dica de
texto explicando esse fluxo quando a lista de tamanhos está vazia — não
precisou reestruturar as Tabs (Info/Tamanhos/Partes/Imagens) pra isso, já
que a automação funciona independente da ordem em que o admin navega
entre elas.

**Testado com arquivos reais gerados na hora** (não só teoria): criei um
STL de 10×30×15mm e um OBJ de 20×40×20mm, selecionei cada um via
Playwright (`setInputFiles`, dispara o `<input type="file">` de verdade,
não é mock) e confirmei que o texto exibido bate **exatamente** com as
dimensões reais dos arquivos (ex.: "1.0 × 3.0 × 1.5 cm" pro STL de
10×30×15mm) — sem erro de console. A função de arredondamento
(`labelForCm`) foi conferida à parte com alguns valores fracionários
(83,7mm → P "4cm", M "8.5cm", G "12.5cm") pra confirmar que produz números
limpos nos dois casos (inteiro e fracionário). Não testado o clique em
"Confirmar envio" de ponta a ponta contra o banco real (chamaria
`autoGenerateSizeOptions` contra o Supabase, que não existe nesta sessão)
— a lógica em si (um SELECT pra checar se já existe tamanho + um INSERT de
3 linhas) é simples e já passa lint/build.

### Rodada 20: excluir produto (não existia)

Usuário percebeu que não tinha como excluir um produto pelo admin — só
existia excluir parte/tamanho/imagem/material/categoria, nunca o produto
em si. Confirmado por busca no código antes de assumir: `deleteProduct`
não existia em lugar nenhum, nem botão nem action.

**Decisão de design**: `order_items.product_id` é `onDelete: "restrict"`
de propósito (não `cascade`) — um produto que já foi comprado não pode
sumir do banco e quebrar o histórico de pedidos antigos. Isso significa
que `deleteProduct` precisa **capturar esse erro do Postgres (código
`23503`, foreign key violation)** e devolver uma mensagem explicando o
motivo real ("já tem pedidos associados, mude pra rascunho") em vez de
deixar estourar um erro genérico — sugere a alternativa que já existe
(`products.status = draft`) pra tirar o produto da loja sem perder
histórico.

**`ConfirmDeleteButton` ganhou suporte a retornar `{ error }`**: até agora
toda action de exclusão no projeto (`deleteCategory`, `deleteProductPart`,
`deleteFilament`, etc.) só tinha dois desfechos — sucesso silencioso ou
exceção genérica ("Não foi possível excluir. Tente novamente."). Pra
`deleteProduct` mostrar o motivo específico do bloqueio, o componente
compartilhado passou a checar se a action devolveu `{ error }` e, se sim,
mostra esse texto exato via toast **sem fechar o diálogo** (deixa o admin
decidir o próximo passo, em vez de fechar como se tivesse dado certo) —
mudança retrocompatível, as actions antigas continuam retornando `void` e
caem no fluxo de sempre.

`ProductRow` (`src/features/catalog/components/product-row.tsx`, novo)
segue o mesmo padrão de `CategoryRow`/`FilamentRow` (client component que
importa a action direto, em vez de receber via prop de um Server
Component pai — mesma cautela da rodada 11 sobre cruzar essa fronteira).

**Testado**: página mockada com dois `ConfirmDeleteButton` — um com action
que resolve normalmente, outro que devolve `{ error }` — confirmei via
Playwright que o caso de sucesso fecha o diálogo e mostra "Excluído.", e o
caso bloqueado **mantém o diálogo aberto** e mostra a mensagem específica
exata, não a genérica. Não testado `deleteProduct` de verdade contra o
Postgres (sem banco nesta sessão) — a query em si (um `DELETE` simples +
checagem do código de erro) é direta e já passa lint/build.

### Rodada 21: botão "Editar" inconsistente, tamanho sem editar, gif escondido

Três pedidos rápidos do usuário na mesma leva.

**Botão "Editar" da lista de produtos era um link sublinhado, não um
botão** — só apareceu porque coloquei o "Excluir" novo (`ConfirmDeleteButton`,
sempre `variant="ghost"`) do lado de um `<Link>` de texto puro herdado da
tela antiga. Auditei todo o admin antes de mexer: `CategoryRow`/
`FilamentRow` já usavam `<Button size="sm" variant="outline">` pro Editar
— esse é o padrão real do projeto, não o link. Ajustei `ProductRow`
(produtos) e o "Ver" de `/admin/pedidos` (mesma família de ação, mesma
inconsistência) pra usar esse mesmo botão.

**Tamanhos (P/M/G) nunca tiveram edição, só criar/excluir** — igual o
gap que existia pra produto antes da rodada 20. Segui exatamente o padrão
já usado em Categoria/Material: `SizeForm`/`SizeRow` novos, e
`addSizeOption` (FormData crua) virou `createSizeOption`/
`updateSizeOption` (objeto tipado, `ProductActionResult` com erro).

**Bug real pego durante o teste, não hipotético**: a primeira versão de
`ProductSizesManager` (que é um Server Component) tinha
`<SizeForm onSubmit={(input) => createSizeOption(productId, input)} />` —
uma função-closure criada no servidor sendo passada pra um Client
Component. Isso **não é o mesmo bug da rodada 11** (aquele era passar uma
*referência de componente*), mas é da mesma família: só uma Server Action
"pura" ou `.bind()` em cima dela sobrevive a essa fronteira — uma arrow
function que fecha sobre uma variável não. Rodando a página mockada de
verdade (não só build) o erro apareceu na hora: "Event handlers cannot be
passed to Client Component props." Troquei pra
`createSizeOption.bind(null, productId)` (mesmo truque de sempre usado em
todo `ConfirmDeleteButton` do projeto) e sumiu. **Auditei os outros dois
lugares com a mesma sintaxe** (`category-row.tsx`, `filament-row.tsx`) —
esses estão OK porque o closure é criado dentro de um Client Component
("use client" no topo do arquivo), nunca atravessa a fronteira. Lição:
esse padrão (`onSubmit={(input) => alguméAction(idExtra, input)}`) só é
seguro dentro de um arquivo "use client" — num Server Component precisa
ser `.bind()`.

**Galeria de fotos/gifs da página do produto era pequena demais**
(`size-16`, 64px) e sem nenhum destaque — fácil de não perceber do lado do
preview 3D grande. Aumentada pra `size-28` (112px), ganhou um label
"Fotos e vídeos" acima, e cada thumbnail agora abre um lightbox (`Dialog`
já usado no projeto, reaproveitado) com a imagem em tamanho grande
(`max-h-[80vh]`) ao clicar — resolve tanto "pequeno demais" quanto "não dá
pra ver direito".

**Testado**: página mockada confirmou (a) Editar/Excluir lado a lado com
o mesmo estilo de botão nas duas telas, (b) clicar Editar num tamanho abre
o form pré-preenchido com os valores exatos, salvar/cancelar funcionam,
(c) clicar numa miniatura da galeria abre o lightbox com a imagem grande
— sem erro de console em nenhum caso, incluindo a checagem explícita do
bug de Server/Client que só apareceu rodando de verdade, não no
`next build`.

### Rodada 22: peso/preço estimados a partir do arquivo 3D + captura de thumbnail no admin

Usuário pediu três coisas de uma vez: "é possivel prever mais ou menos o
peso, considerando um impressao fdm com configuracoes padrao? uma sugestão
de preco tambem seria legal.. outra coisa, sera que posso escolher a thumb
ao adicionar o stl? esta sempre ficando em uma posicao ruim".

**Peso estimado**: `measureMesh()` (`src/features/catalog/mesh-measure.ts`,
antes só devolvia largura/altura/profundidade) passou a calcular também
**volume e área de superfície reais da malha** — não da bounding box —
percorrendo cada triângulo (STL: geometria pura; OBJ/3MF: todas as
sub-malhas de todo o grupo, com `matrixWorld` aplicado por vértice, senão a
escala/posição de cada objeto dentro do arquivo seria ignorada). Volume via
soma de tetraedros a partir da origem (`Σ pA·(pB×pC) / 6` por triângulo,
técnica padrão pra sólidos fechados — resultado abrupto se a malha tiver
furos, mas isso já seria um arquivo problemático pra imprimir de qualquer
jeito); área via soma de `0.5 * |aresta1 × aresta2|`. **Validado com números
exatos antes de qualquer UI**: um cubo STL de 20mm deu `volumeMm3: 8000` e
`surfaceAreaMm2: 2400` (valores analíticos exatos); um box OBJ de
10×30×20mm deu `6000`/`2200` — só depois de achar e corrigir um bug de
winding order no meu próprio arquivo OBJ de teste (a área bateu de cara,
winding-independent; o volume só bateu depois de eu regerar a ordem dos
vértices copiando a mesma ordem já validada no gerador de STL).

`src/features/catalog/print-estimate.ts` (novo) pega esse volume/área e
estima o peso assumindo **configurações padrão de fatiador FDM**: parede de
1,2mm (~3 perímetros), preenchimento 20%, densidade do PLA 1,24g/cm³. A
conta decompõe o volume em casca (área × espessura da parede) + o restante
do interior só parcialmente (20%) — não trata o modelo como sólido maciço,
que superestimaria muito o peso. Tudo documentado como constantes com
comentário explicando a escolha, e o resultado sempre rotulado como
aproximado ("FDM, PLA, preenchimento 20%") — não é uma medição, é a mesma
lógica que qualquer calculadora de peso de STL de terceiros usa.

**Sugestão de preço**: `store_settings` ganhou duas colunas opcionais,
`price_per_gram_cents` e `fixed_fee_cents` (migração
`drizzle/0008_rapid_chamber.sql`, só aditiva), editáveis numa nova seção
"Sugestão de preço" em `/admin/configuracoes`. Quando as duas (ou só o
preço por grama) estão configuradas, o preço sugerido é
`peso_estimado_g × preço_por_grama + taxa_fixa`.

**Padrão "sugere, nunca aplica sozinho"** (igual peso e preço): cada valor
aparece como texto informativo com um botão próprio
("Usar esse peso"/"Usar esse preço"), cada um com seu próprio
`useTransition` **separado do fluxo de upload** — o admin sempre confirma
antes de qualquer coisa que mexe em preço real cobrado do cliente. Ações
novas: `applySuggestedWeight`/`applySuggestedPrice`
(`src/features/catalog/actions.ts`), ambas gravam um valor arredondado e
revalidam as páginas do produto. Isso é deliberadamente mais cauteloso que
a auto-geração de tamanhos P/M/G da rodada 19 (essa sim aplica sozinha,
mas só quando o produto ainda não tem nenhum tamanho — um default de risco
bem menor).

**Escolher o ângulo da thumbnail**: o preview 3D pequeno e não-interativo
dentro do card de cada parte no admin (`ProductPartsManager`,
`PartRegionsPanel`) sempre nascia numa posição de câmera fixa — às vezes
mostrando um ângulo ruim da peça, sem jeito de ajustar. Trocado por
`PartThumbnailCapture` (novo,
`src/features/catalog/components/part-thumbnail-capture.tsx`): o mesmo
`ProductViewer3D`, mas **interativo** (o admin arrasta/gira/dá zoom com o
`OrbitControls` que já existia) e com um botão "Usar este ângulo como
foto" que fotografa o `<canvas>` de verdade (`canvas.toBlob("image/png")`)
e sobe pra galeria do produto reaproveitando 100% o pipeline de upload
direto já usado por `ProductImagesManager`
(`createProductImageUploadUrl`/`confirmProductImage`, sem passar pelo
servidor). `ProductViewer3D` ganhou um `onCanvasReady?: (canvas) => void`
opcional — só quando presente é que `gl={{ preserveDrawingBuffer: true }}`
é ligado no `<Canvas>` (o WebGL limpa o buffer a cada frame por padrão, e
isso custa memória, então só liga quando alguém realmente vai capturar).
Um componente interno novo, `CanvasCaptureBridge`, usa `useThree()` (só
funciona dentro do `<Canvas>`) pra pegar `gl.domElement` e repassar pro
componente pai via callback num `useEffect`. Aproveitei a troca pra também
usar a cor do **material padrão de verdade da parte**
(`part.defaultFilamentOptionId` → busca em `allMaterials`) em vez do cinza
`#a1a1aa` fixo de antes — a foto capturada já sai com uma cor real, não
placeholder.

**Testado de ponta a ponta o que dava pra testar sem banco** (mesma
limitação de sempre): página temporária renderizando `PartThumbnailCapture`
com um cubo STL de 20mm gerado na hora, servido estaticamente. Via
Playwright: comparei um screenshot do `<canvas>` antes/depois de simular um
arrasto do mouse — a imagem mudou, confirmando que a rotação funciona de
verdade (não só que os controles existem). Cliquei no botão de captura de
verdade: a ação chega até `createStorageClient()` no servidor e falha com
uma mensagem clara ("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
não configuradas") mostrada num toast — confirma que a falta de credenciais
nesta máquina é tratada com uma falha limpa (`try/catch` já existente em
`createProductImageUploadUrl`), não um crash, mas **não confirma o upload
de verdade contra o Supabase real**, que só o usuário pode testar. Sem
erros de console em nenhum passo. `npm run lint`, `npx tsc --noEmit` e
`npm run build` (com `.next` limpo, pra não pegar um erro de tipo obsoleto
apontando pra uma rota temporária já apagada) passaram limpos; `npm run
test` também (10/10, suíte de `pricing.test.ts`, não afetada por esta
rodada).

### Rodada 23: preço deixa de ser obrigatório na criação — fluxo vira "sobe o STL primeiro"

Usuário apontou uma inconsistência criada pela própria rodada 22: "quando
crio um novo produto, tenho que preencher tudo antes de inserir o stl...
ai nao faz sentido. o correto é enviar o stl para ja preencher as medidas
automaticamente". Investigando o fluxo de criação de verdade, o problema
não era "preencher tudo" (a maioria dos campos já era opcional desde antes
— peso/dimensões, SEO, categoria, descrição) — eram duas travas concretas:
(1) `basePriceReais` exigia `> 0` no schema (`z.coerce.number().positive()`),
então não dava pra criar o produto sem já saber um preço, mesmo a intenção
sendo justamente descobrir o preço a partir do arquivo (rodada 22); (2)
mesmo criando o produto, a aba Partes começava sem nenhuma parte — só
depois de um passo manual extra ("Adicionar parte") é que o formulário de
upload de STL aparecia. As duas travas juntas obrigavam preencher preço
(um valor ainda desconhecido) e clicar em mais uma tela antes de sequer
poder enviar o arquivo que geraria esse preço.

**Fix**: `basePriceReais` agora aceita 0 na criação
(`z.coerce.number().min(0, ...)`), mas o schema virou
`z.object({...}).refine(...)` que **só exige preço > 0 se `status ===
"published"`** — dá pra salvar um rascunho com preço zerado, mas não pra
publicar um produto de graça sem querer. `createProduct`
(`src/features/catalog/actions.ts`) passou a criar a primeira parte
("corpo") automaticamente junto com o produto, e a redirecionar pra
`/admin/produtos/[id]?tab=partes` em vez de cair na aba Info — a página de
edição (`src/app/admin/(dashboard)/produtos/[id]/page.tsx`) lê
`?tab=` de `searchParams` e usa como `defaultValue` das `Tabs` (validado
contra uma lista fixa de valores aceitos, não confia cegamente no query
param). Resultado: o fluxo de criação vira nome → Criar produto → cai
direto na aba Partes com uma parte já pronta pra receber o arquivo →
enviar o STL já preenche medidas/peso/preço sugeridos (rodadas 19 e 22)
sem nenhum passo manual extra. Produtos multi-peça continuam podendo
adicionar mais partes do jeito de sempre. `ProductForm` ganhou uma frase
de ajuda abaixo do campo de preço explicando que pode ficar em 0 por
enquanto e só precisa ser preenchido de verdade pra publicar.

**Testado**: a validação em si (schema `productFormSchema`) foi conferida
isoladamente rodando `safeParse` via `tsx` — rascunho com preço 0 passa,
publicado com preço 0 falha com a mensagem certa no campo certo
(`path: ["basePriceReais"]`). Via Playwright contra o formulário real
(mockado, sem produto — modo criação): confirmei que o campo de preço já
nasce com valor "0" e que submeter como rascunho com preço 0 **não**
mostra nenhum erro de validação client-side (a chamada ao servidor em si
não pôde ser exercida de ponta a ponta — sem `DATABASE_URL` local, a
Server Action real fica pendurada tentando abrir conexão em vez de falhar
rápido, então o clique em "Criar produto" contra o dev server real trava
a aba em vez de retornar erro; matei o processo do dev server depois
disso). `npm run lint`, `npx tsc --noEmit` e `npm run build` (com `.next`
limpo) passaram limpos; `npm run test` também (10/10, suíte não afetada
por esta rodada).

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
