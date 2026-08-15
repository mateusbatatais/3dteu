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
  `drizzle/0006_nappy_banshee.sql`, `drizzle/0007_tan_xavin.sql`,
  `drizzle/0008_rapid_chamber.sql`, `drizzle/0009_tiny_zeigeist.sql` e
  `drizzle/0010_known_tarantula.sql` contra o
  Supabase real (`npm run db:migrate` ou colar o SQL no SQL Editor) — sem
  isso, nada da rodada 10 (Superfrete completo, imagens de produto), da
  rodada 12 (regiões pintadas), da rodada 13 (material padrão por parte),
  da rodada 15 (esconder/definir padrão por região), da rodada 16 (conta de
  cliente — `orders.customer_id` — e avaliações de produto —
  `product_reviews`), da rodada 18 (imagem de categoria —
  `categories.image_url`), da rodada 22 (`store_settings.price_per_gram_cents`/
  `fixed_fee_cents`, usados pra sugerir preço a partir do peso estimado), da
  rodada 28 (hierarquia de materiais Material→Tipo→Cor + calculadora de
  preço — a 0009 é a que mais precisa de atenção: reaponta cores já
  atribuídas em produtos existentes, ver o próprio comentário dentro do
  arquivo SQL antes de rodar) nem da rodada 29 (materiais recomendados por
  categoria) funciona contra produção. Todas são só
  aditivas (CREATE TABLE / ALTER TABLE ADD COLUMN), seguras. **Atenção
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

### Rodada 24: bug do `min="1"` bloqueando o fluxo novo + dimensões de embalagem também viram sugestão

A rodada 23 resolveu o preço, mas o usuário voltou com uma screenshot: o
campo "Altura (cm)" mostrava o popup nativo do navegador "O valor deve ser
maior ou igual a 1" travando o "Criar produto" mesmo com o valor em 0
(padrão). Junto, apontou que a intenção original ("eu disse preco, mas as
medidas tambem") não tinha sido totalmente atendida — peso/altura/
largura/comprimento continuavam de fato obrigatórios, só que por um motivo
diferente do preço.

**Causa raiz**: `weightGrams`/`heightCm`/`widthCm`/`lengthCm` no
`ProductForm` tinham `min="1"` no HTML (`<Input type="number" min="1"
.../>`), mesmo o schema Zod (`optionalPositiveInt = z.coerce.number().int
().min(0)`) já tratando 0 como "não informado" há muito tempo (rodada 10).
Validação nativa do browser roda **antes** do JS (react-hook-form/zod)
nem ser chamado — então mesmo um campo "opcional" no schema travava o
submit inteiro se o input HTML declarasse um mínimo mais restritivo. Fix
direto: os 4 `min="1"` viraram `min="0"`, batendo com o que o schema
sempre aceitou.

**O pedido maior**: "mesmo que tenha que mudar todo o fluxo, o correto é
adicionar o arquivo logo depois de preencher o nome para que ele ja
preencha os proximos dados" — na prática, isso já é o que a rodada 23
entrega (nome → Criar produto → cai direto na aba Partes com uma parte
pronta) uma vez consertado o bug acima; o que faltava era o **peso e as
dimensões de embalagem também virarem sugestão a partir do arquivo**,
não só o peso (rodada 22) e os tamanhos P/M/G (rodada 19). Adicionado:
`applySuggestedDimensions` (`src/features/catalog/actions.ts`) +  bloco
"Dimensões de embalagem estimadas: H × L × C cm" no `MeshUploadForm`,
mesmo padrão de peso/preço (texto informativo + botão "Usar essas
dimensões", nunca aplica sozinho). Os valores vêm do mesmo
`measureMesh()` já usado pra medidas/peso — arredondados **pra cima**
(`Math.ceil`), já que uma embalagem menor que o item não serve; sem
margem extra além disso (rotulado como aproximado, o admin ajusta se a
embalagem real precisar ser maior).

**Esclarecimento sobre "a caixa é por pedido, não por produto"**: o
usuário levantou uma dúvida de design ("nao da pra saber o tamanho da
caixa, pois o carrinho pode ter varios itens... eu preciso saber o
tamanho do item, no carrinho tenho que somar"). Conferindo o código
(`src/features/checkout/shipping-quotes.ts`,
`src/features/shipping/superfrete.ts`): a arquitetura já fazia exatamente
isso — cada item do carrinho manda seu próprio peso/dimensão +
quantidade pro endpoint de cotação da Superfrete (`products: items.map
(...)`), e é a própria Superfrete quem consolida os itens numa cotação de
frete (prática padrão de calculadora de frete multi-item, mesma coisa que
Correios/outras transportadoras fazem). Ou seja, o campo
`products.heightCm/widthCm/lengthCm` sempre representou o **item
individual**, nunca "a caixa do pedido inteiro" — não precisou mudar nada
na cotação, só faltava mesmo a origem do valor (manual → sugerido do
arquivo).

**Bug real pego durante o teste, não hipotético**: `applySuggestedWeight`
e `applySuggestedPrice` (rodada 22) e o `applySuggestedDimensions` novo
desta rodada faziam o `db.update(...)` **sem try/catch** — testando de
verdade (clique no botão "Usar essas dimensões" contra o dev server real,
sem `DATABASE_URL` local), o erro da conexão de banco vazava como uma
exception não tratada da Server Action (`pageerror: DATABASE_URL... não
definida`) em vez de virar um `{ error }` tratado — o botão simplesmente
não fazia nada visível pro admin, sem toast nenhum. Corrigido envolvendo
as três funções em try/catch (mesmo padrão já usado em
`createProduct`/`updateProduct`/`deleteProduct` no mesmo arquivo) — só foi
possível achar isso testando o clique de verdade contra o dev server, não
só lendo o código ou rodando `next build`.

**Testado**: via Playwright contra o formulário real (mockado, sem
produto — modo criação): `checkValidity()` dos 4 campos com valor "0"
agora retorna `true` (antes o de altura pelo menos retornaria `false`).
Subi um STL de teste (cubo de 20mm) no `MeshUploadForm` real e confirmei
o texto "Dimensões de embalagem estimadas: 2 × 2 × 2 cm" (20mm ÷ 10,
arredondado pra cima); cliquei em "Usar essas dimensões" de verdade e,
depois do fix do try/catch, o toast mostrou a mensagem de erro esperada
("Não foi possível salvar as dimensões. Tente novamente.") em vez de
travar silenciosamente — confirma tanto a UI da sugestão quanto o
tratamento de erro, ainda que sem confirmar a gravação real no Supabase
(sem `DATABASE_URL` nesta sessão, mesma limitação de sempre). `npm run
lint`, `npx tsc --noEmit`, `npm run test` (10/10) e `npm run build`
passaram limpos.

### Rodada 25: erro ao cadastrar produto em produção — `getStoreSettings()` sem proteção derrubava a página

Usuário reportou erro ao cadastrar um produto, sem mais detalhes ("veja se
falta algo ou alguma sql"). Investigando o código antes de pedir print:
`createProduct` (rodada 23) agora redireciona pra
`/admin/produtos/[id]?tab=partes` assim que o produto é criado, e essa
página (desde a rodada 22) busca `getStoreSettings()` — que faz
`db.query.storeSettings.findFirst(...)`, e o Drizzle gera um `SELECT`
listando **todas** as colunas declaradas no schema TS da tabela, incluindo
`price_per_gram_cents`/`fixed_fee_cents` (adicionadas na rodada 22,
migração `0008_rapid_chamber.sql`). Combinando os dois: se a 0008 (ou
qualquer uma das migrações 0001–0008 documentadas como pendentes) ainda
não tiver sido rodada em produção, criar QUALQUER produto agora cai direto
numa página que quebra com "column ... does not exist" — antes da rodada
23 esse caminho nem existia (a criação ficava na aba Info, sem tocar
`store_settings`).

**Fix de código**: `getStoreSettings()` na página
`/admin/produtos/[id]/page.tsx` passou a rodar fora do `Promise.all`
crítico, com `.catch()` devolvendo `null` e logando o erro — mesmo
princípio já usado no dashboard do admin (`getAdminDashboardStats`,
rodada 10) e nas avaliações de produto (rodada 16): a sugestão de preço é
um extra, nunca deveria derrubar a página inteira se a query falhar. Sem
`storeSettings`, a página carrega normal e só a sugestão de preço fica
indisponível (peso/dimensões continuam funcionando, já que não dependem
dessa tabela).

**Fix de dados**: passei pro usuário o SQL idempotente combinado das 8
migrações pendentes (`0001` a `0008`, todo `CREATE TABLE IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS` / `CREATE TYPE`+`ADD CONSTRAINT` envolvidos em
`DO $$ ... EXCEPTION WHEN duplicate_object` — mesmo padrão da rodada 11)
pra rodar de uma vez no SQL Editor do Supabase, em vez de continuar
adivinhando migração por migração a cada novo sintoma — isso já rendeu
pelo menos 3 rodadas de "descobri depois" (11, 15, "Pós-rodada 18").

**Lição gravada**: qualquer nova página/Server Component que passa a
depender de uma tabela recém-migrada precisa considerar que a migração
pode não ter sido aplicada ainda em produção — se a query for um "extra"
(não o conteúdo principal da página), proteger com try/catch e fallback,
não deixar propagar.

### Rodada 26: redesenho completo do cadastro de produto

Usuário rejeitou toda a abordagem incremental das rodadas 22-25 pro
cadastro de produto: "to achando horrivel... quero mudar completamente.
Redesenhar." Pedido com 7 partes:
1. Tudo numa tela só, sem abas.
2. Remover peso/dimensões de embalagem digitados à mão — o que importa é
   peso/tamanho do OBJETO, preenchido automaticamente ao subir o arquivo.
3. Todas as cores disponíveis vêm marcadas por padrão.
4. Corrigir qualidade de imagem "salva muito ruim".
5. Botões de upload mais visíveis (não dava pra ver onde clicar).
6. Fluxo de upload/loading/salvar mais claro ("pesquise sobre
   usabilidade").
7. Obrigatório ter pelo menos uma peça e uma cor.

**Investigação da causa da "qualidade ruim" antes de mexer em código**:
`grep` em todo `<Image>` do projeto mostrou que quase tudo já usa
`unoptimized` (herdado de antes da rodada 18 configurar `remotePatterns`,
nunca removido depois) — ou seja, a maioria das fotos já é servida em
qualidade original, não é o culpado. A causa real, encontrada checando o
único lugar do código que gera pixels novos (não só transporta um
arquivo): a captura de thumbnail 3D (rodada 22, `PartThumbnailCapture`)
fotografava um `<canvas>` de **160px** (`max-w-40`) sem `dpr` explícito no
`<Canvas>` do react-three-fiber — uma imagem genuinamente de baixa
resolução, esticada depois pra até 900px na galeria/lightbox do produto.
Também achei uma causa secundária real, específica do Next 16 (que muda
convenções — ver AGENTS.md): a partir da v16, `next/image` **exige um
allowlist explícito de qualidades**, e o default é `qualities: [75]` — as
duas únicas fotos que passam pelo otimizador sem `unoptimized` (grid do
catálogo e tiles de categoria) caíam nesse teto sem eu ter pedido.

**Fix de qualidade**: `next.config.ts` ganhou `images.qualities: [75, 90]`
e as duas fotos afetadas (`product-grid.tsx`, `category-tiles.tsx`)
ganharam `quality={90}`. `ProductViewer3D` ganhou `dpr={onCanvasReady ?
[1, 3] : [1, 2]}` (mais alto só durante captura, já que WebGL em dpr maior
custa mais performance) e `PartThumbnailCapture` cresceu de `max-w-40`
(160px) pra `max-w-64` (256px) — combinado, uma captura de até ~768px em
vez de 160px.

**Peso/dimensões viram 100% automáticos**: `weightGrams`/`heightCm`/
`widthCm`/`lengthCm` saíram de `productFormSchema` e do `ProductForm` —
não existe mais input manual pra isso em lugar nenhum. `MeshUploadForm`
(usado na edição) chama `applySuggestedWeight`+`applySuggestedDimensions`
**automaticamente** assim que o upload é confirmado (removidos os botões
"Usar esse peso"/"Usar essas dimensões" da rodada 22/24 — peso/dimensão
de um objeto físico não é uma decisão de negócio como preço, não faz
sentido pedir confirmação separada). Preço continua exigindo clique
explícito (`applySuggestedPrice`) — é a única sugestão que ainda mexe em
quanto o cliente paga.

**Todas as cores marcadas por padrão**: em `ProductPartsManager`, o
checkbox de cada material usa `selectedIds.size === 0 ? true :
selectedIds.has(material.id)` — só cai pro "nada marcado" se já existir
uma seleção salva de verdade (edição posterior continua respeitando o que
o admin escolheu). O rádio "Padrão" segue a mesma lógica, caindo pro
primeiro material da lista quando não há default salvo ainda.

**Upload mais visível**: trocado o `<input type="file">` cru (fácil de
não ver, ainda mais no tema escuro) por uma dropzone grande com ícone,
texto "Arraste o arquivo aqui ou clique pra escolher" e suporte a
drag-and-drop de verdade (`onDrop`/`onDragOver`), tanto no
`MeshUploadForm` quanto no cadastro novo.

**Redesenho do cadastro (`/admin/produtos/novo`)**: `ProductForm` virou
edição-only (o branch de criação foi removido, `product` deixou de ser
opcional); um componente novo, `NewProductForm`
(`src/features/catalog/components/new-product-form.tsx`), substitui o
cadastro inteiro — uma tela só, sem `Tabs`, com seções empilhadas (Info
básica → Peças e cores → Preço → SEO num `<details>` recolhido → Status)
e um único botão "Criar produto" no final. Cada peça é um card com nome,
dropzone de arquivo (mede localmente com `measureMesh()` antes de
qualquer envio — só sobe pro Supabase no clique final) e checklist de
cores (todas marcadas por padrão). Validação client-side bloqueia o envio
se não houver pelo menos uma peça ou se qualquer peça ficar sem nenhuma
cor marcada.

**Orquestração do "criar produto" num clique só**: como o arquivo precisa
ir direto do navegador pro Supabase Storage (arquitetura já estabelecida
desde a saga do upload de STL) e não existe transação que atravesse
chamadas de rede, `handleSubmit` faz uma sequência client-side: (1)
`createProductDraft` — nova action, só insere a linha do produto, sem
redirect nem parte automática (diferente do antigo `createProduct`,
deletado); (2) pra cada peça, `createProductPart` (nova action, igual
`addProductPart` mas devolve o id em vez de ser fire-and-forget) +
upload+confirmação do arquivo (se houver) + `setPartMaterials` (montando
um `FormData` na mão, reaproveitando a action existente sem duplicar
lógica); (3) ao final, soma o peso estimado de todas as peças com arquivo
e usa a MAIOR medida de cada eixo entre elas como aproximação da caixa —
simplificação assumida (não empacota de verdade), mas consistente com o
resto da UI já rotular tudo como estimativa — aplicada via
`applySuggestedWeight`+`applySuggestedDimensions`, e tamanhos P/M/G a
partir da primeira peça medida. Se uma etapa falhar depois do produto já
criado, a UI nunca finge que nada aconteceu: mostra um toast explicando
exatamente o que falhou e redireciona pra tela de edição (com abas) pra
continuar dali — a criação nunca é atômica de verdade (não dá pra ser,
dado o upload direto), então é mais honesto admitir isso do que simular.

**Bug real pego rodando de verdade, não no build**: a primeira versão de
`makePartDraft` gerava a `key` da peça inicial com `crypto.randomUUID()`
dentro do inicializador de `useState` — como esse inicializador roda uma
vez no render do servidor e de novo na hidratação do cliente, o id
aleatório saía diferente nas duas vezes, e o React acusava "hydration
mismatch" no atributo `name` do rádio de material padrão (só apareceu
testando a página de verdade via Playwright, `next build`/`tsc` não pegam
isso). Corrigido com uma key literal determinística (`"part-0"`) pra peça
inicial; um contador (`useRef`) só é lido/incrementado dentro de
`addPart` (um handler de clique, nunca durante o render) pra peças
adicionadas depois — o eslint-plugin-react-hooks também pegou uma segunda
versão errada disso ("Cannot access refs during render") antes de eu
fixar a versão final.

**`createProduct` (antigo) foi deletado**, não deprecado — só tinha um
call site (`ProductForm`, que virou edição-only), então virou código morto
de verdade assim que `NewProductForm` passou a usar `createProductDraft`.

**Testado**: Playwright contra o formulário novo (mockado, sem produto):
confirmei zero abas na tela, autofill de slug a partir do nome, os 3
checkboxes de material nascendo todos marcados, "+ Adicionar peça"
criando um segundo card, upload de um STL de teste mostrando as medidas
detectadas corretamente, a validação bloqueando o submit quando a peça
fica sem nenhuma cor marcada (mensagem certa), e o submit de verdade
contra o dev server (sem `DATABASE_URL` local) falhando de forma limpa
("Não foi possível salvar o produto.") em vez de travar — sem nenhum erro
de console depois do fix de hidratação. Também testei os componentes de
edição mockados: `ProductForm` não tem mais os campos de peso/altura,
`ProductPartsManager` nasce com os checkboxes marcados e o primeiro rádio
"Padrão" selecionado, `MeshUploadForm` mostra a dropzone nova e, ao
confirmar um upload de verdade contra o dev server, falha graciosamente
por falta de credenciais do Supabase (esperado, mesma limitação de
sempre) sem nenhum erro de console. `npm run lint`, `npm run test`
(10/10) e `npm run build` (com `.next` limpo) passaram limpos.

**Não testado**: o fluxo de criação de ponta a ponta contra o Supabase
real (produto + peça + upload + materiais + peso/dimensões/tamanhos
aplicados de verdade) — só a parte client-side e a falha graciosa contra
a ausência de banco/credenciais nesta sessão. Primeira vez que o usuário
cadastrar um produto pelo fluxo novo em produção é o teste real disso.

### Rodada 27: início do ROADMAP.md — tooltip de tamanho implementado, resto planejado

Usuário trouxe 6 pedidos grandes de uma vez (hierarquia de material/tipo/cor
+ calculadora de preço, pedido de modelo customizado via IA, diferenciação
visual de material no 3D, tooltip de tamanho, textos explicativos de
material, modelo 3D animado na home) e pediu explicitamente um documento de
roadmap pra ir trabalhando por partes, implementando de cara o que desse e
planejando o resto.

**`ROADMAP.md` criado** (novo arquivo na raiz, fora do `CLAUDE.md` de
propósito — este último é o diário de bordo do que já foi feito; o roadmap
é o inverso, o que falta, com perguntas em aberto pro usuário responder
antes de cada fase maior começar). Cobre as 5 fases pendentes com desenho
técnico já pensado (schema proposto pra material→tipo→cor, fórmula de preço
com material+energia+pós-processamento, pesquisa real de APIs de
imagem-pra-3D — Meshy/Neural4D/Tripo3D/Hyper3D/3D AI Studio — e confirmação
de que GLB é o formato certo pro modelo animado da home, não FBX).

**Implementado nesta rodada** (o único item pequeno o suficiente pra não
precisar de planejamento): tooltip explicando que o tamanho selecionado é a
maior dimensão da peça, as outras acompanham proporcionalmente. Não existia
nenhum componente de tooltip no design system ainda — criado
`src/components/ui/tooltip.tsx` a partir de `@base-ui/react/tooltip`,
seguindo o mesmo padrão dos outros componentes (`select.tsx`, `tabs.tsx`).
Usado em `product-configurator.tsx`, ao lado do label "Tamanho".

**Testado**: Playwright contra o configurador real com produto mockado —
confirmei que o gatilho (ícone de info) existe e que passar o mouse mostra
o texto certo do tooltip, sem erro de console. `npm run lint`, `npm run
test` (10/10) e `npm run build` passaram limpos.

**Todas as outras 5 fases ficaram no ROADMAP.md, aguardando decisão do
usuário** (schema/fórmula de preço da Fase 1 em especial — errar isso é
caro de desfazer com dado real de cliente em cima) — ver o arquivo pra
detalhes completos de cada uma.

### Rodada 28: Fase 1 do roadmap — hierarquia Material→Tipo→Cor + calculadora de preço

Usuário confirmou os 4 pontos em aberto da Fase 1 (config de energia/
potência/margem única pra loja inteira, velocidade de impressão parte de
estimativa de mercado por enquanto, sugestão de preço antiga substituída
pela nova, e "pouco ou nada" de dado real cadastrado hoje — sem precisar de
script de migração de dados). No meio da rodada, mandou mais dois pedidos
pontuais: acrescentar ao roadmap a pesquisa real sobre preço das APIs de
IA (Meshy/Tripo, que ele já testou e aprovou a qualidade — a dúvida real
era o modelo de cobrança) e uma "Fase 1b" nova (recomendar material por
categoria) — ambos só documentados no `ROADMAP.md`, não implementados
ainda.

**Schema**: `filament_options` (lista achatada, um `type` que só distinguia
cor-única/dual-color/especial) virou 3 tabelas —
`materials` (Resina/Plástico, `print_process` fdm/resin,
`allows_dual_color`, `post_processing_fee_cents`) → `material_types` (PLA,
Cristal..., `price_per_kg_cents`, `print_speed_value`, `description`) →
`material_colors` (nome + hex, `hex_color_secondary` só quando o Material
permite — reforçado em `material-actions.ts`, nunca só escondendo o campo
no form, mesma lição da rodada 14).

**`drizzle-kit generate` sem TTY disponível nesta sessão**: renomear a
coluna/enum na mesma leva que adiciona os novos (ex.: `filament_type` →
`material_print_process`, `default_filament_option_id` → um nome novo)
faz o drizzle-kit tentar perguntar interativamente "isso é um rename ou
uma tabela/coluna nova?" — sem terminal interativo, ele só lança uma
exception (`Interactive prompts require a TTY`) em vez de gerar a
migração. Resolvido com dois truques, sem esperar resposta humana: (1)
`filamentTypeEnum` e a tabela `filamentOptions` continuam **declaradas no
schema.ts, sem nenhum código as referenciando** — como nada "some" do
ponto de vista do differ, ele nunca cogita que viraram outra coisa; (2) as
3 colunas de FK que hoje apontam pra cores (`product_parts
.defaultMaterialColorId`, `product_part_regions.defaultMaterialColorId`,
`product_part_material_options.materialColorId`) mantiveram o **nome físico
antigo da coluna no banco** (`default_filament_option_id`/
`filament_option_id`) — só o nome do lado TypeScript mudou, e só o alvo da
FK foi trocado (de `filament_options.id` pra `material_colors.id`), que é
uma mudança de constraint, não um rename de coluna. As duas tabelas/enum
antigos ficam órfãos no banco (documentado como seguro remover numa limpeza
futura, depois de confirmar que a migração rodou bem).

**Migração `0009_tiny_zeigeist.sql` editada à mão** depois de gerada: o
`ADD CONSTRAINT` que reaponta as 3 colunas pra `material_colors` quebraria
com violação de FK se qualquer produto já tivesse uma cor atribuída (o
catálogo novo nasce vazio) — adicionei `DELETE FROM
product_part_material_options` + dois `UPDATE ... SET
default_filament_option_id = NULL` **antes** dos `ADD CONSTRAINT`, pra
limpar referências ao catálogo antigo antes de apertar a constraint nova.
Isso "desatribui" cores de peças já cadastradas — inevitável (o mapeamento
antigo não carrega informação de qual Material/Tipo cada cor pertencia),
já avisado no ROADMAP.md antes de implementar.

**Calculadora de preço** (`src/features/catalog/print-estimate.ts`,
`estimateMaterialCost`): `custo = peso×preço/kg (material) +
tempo_impressão×potência×preço_kWh (energia) + taxa do Material
(pós-processamento)`, `preço_sugerido = custo × (1+margem%) +
taxa_fixa_da_loja`. Tempo de impressão usa fórmula diferente por processo
— `peso/velocidade` pra FDM (deposita continuamente, tempo escala com
peso), `altura/velocidade` pra resina (cura uma camada inteira de cada
vez, tempo escala com altura, não com peso/volume). `storeSettings` ganhou
`energyPriceCentsPerKwh`/`printerPowerWatts`/`profitMarginPercent`
(config única da loja, não por material — decisão confirmada pelo
usuário); a antiga `pricePerGramCents` (rodada 22) parou de ser lida/
escrita por qualquer código (mantida só como coluna órfã no banco, mesmo
motivo do truque de migração acima).

**Decisão que documentei explicitamente no ROADMAP.md pro usuário
revisar**: o preço do produto continua um valor único (`basePriceCents`)
que o admin define com a ajuda da calculadora — a cor escolhida pelo
cliente na loja **não recalcula o preço ao vivo**. Cheguei a desenhar uma
versão que faria isso (custo de material ao vivo por peça, com margem
aplicada em cima), mas exigiria rastrear o peso de CADA peça
individualmente (hoje só existe o peso agregado do produto inteiro) —
escopo bem maior que o pedido original ("um bom processo de cálculo de
valor" pra ajudar a precificar, não um motor de repreçamento dinâmico por
cliente). Prefiro entregar a versão mais simples e avisar do que
inventar escopo não pedido.

**Bugs reais pegos testando de verdade, não hipotéticos**:
- `NewMaterialForm` (criar Material) tinha um bug de estado duplicado: o
  wrapper mantinha seu próprio `values`/`isPending` e passava
  `onSubmit={handleSubmit as never}` pro `MaterialForm` interno — como
  `MaterialForm` já gerencia seu próprio estado e só lê `initialValues` no
  mount, digitar no formulário atualizava o estado INTERNO dele, mas o
  clique em Salvar chamava a função do wrapper, que lia o estado
  EXTERNO (sempre vazio). Corrigido copiando o padrão já usado (e correto)
  em `NewMaterialTypeForm`/`NewMaterialColorForm`: `onSubmit` recebe o
  `input` de verdade e chama a Server Action direto; reset entre
  cadastros vira um truque de `key` (força remount) em vez de estado
  duplicado. Só apareceu rodando de verdade (digitei "Metal", cliquei
  Salvar, confirmei via Playwright que o valor enviado batia com o
  digitado) — o bug não aparece read-only, só ao tentar submeter.
- Todas as novas Server Actions em `material-actions.ts`
  (createMaterial/Type/Color, update\*, delete\*) faziam `db.insert`/
  `db.update`/`db.delete` **sem try/catch** — mesmo bug já corrigido nas
  rodadas 24/25 pras actions de sugestão, reintroduzido aqui por serem
  actions novas. Achado do mesmo jeito: cliquei "Salvar" de verdade contra
  o dev server sem `DATABASE_URL`, e o erro subia como exception não
  tratada em vez de um toast — agora todas devolvem `{ error }` limpo.

**Testado**: Playwright contra `MaterialManager` mockado — Resina e
Plástico renderizam, formulário de nova cor da Resina mostra só 1 campo de
cor (sem dual-color), o de Plástico mostra 2; digitar "Metal" no form de
novo material e salvar confirma que o valor certo chega até a Server
Action (e agora falha com toast limpo, não crash). Contra
`ProductConfigurator` + `PriceSuggestionCalculator` mockados: troquei
tamanho/cor e conferi que o preço bate exatamente com `basePriceCents +
size.priceModifierCents` (sem modificador de cor); calculei a sugestão de
preço à mão pra PLA (R$8,10) e pra Resina Cristal (R$41,17) e bati com o
que a UI mostrou nos dois casos, confirmando a fórmula ponta a ponta.
`npm run lint`, `npm run test` (10/10, suíte reescrita pra cores em vez de
materiais) e `npm run build` passaram limpos.

**Não testado**: a migração `0009` contra o Supabase real (mesma limitação
de sempre — sem `DATABASE_URL` nesta sessão), incluindo se o `DELETE`/
`UPDATE` de limpeza realmente evita a violação de FK num banco com dados
de verdade. Primeira vez que o usuário rodar essa migração em produção é o
teste real disso.

### Rodada 29: Fase 1b — recomendar material por categoria

Usuário confirmou as duas decisões em aberto da Fase 1 (preço único por
produto está ok, sem repreçamento ao vivo por cor; desatribuir cores de
produtos existentes na migração é aceitável) e pediu pra seguir direto pra
próxima fase depois do commit/push.

**Implementado**: tabela nova `category_recommended_material_types`
(`category_id` + `material_type_id`, par único) — migração
`0010_known_tarantula.sql`, pura adição, sem a dor de cabeça de rename
ambíguo da rodada 28 (nada mudou de nome, só uma tabela nova). Em
`/admin/categorias`, cada categoria ganhou uma seção "Materiais
recomendados" (`CategoryMaterialRecommendations`, novo) com um checklist
de todos os Tipos do catálogo — marcar um não restringe nada, só define o
que vem pré-selecionado depois. Em `NewProductForm`, escolher uma
categoria com recomendação configurada troca a seleção de cor de TODAS as
peças pra só as cores dos tipos recomendados (com toast explicando),
sobrescrevendo qualquer seleção manual anterior — decisão consciente: a
categoria normalmente é a primeira coisa que o admin escolhe, antes de
mexer em cores, então sobrescrever nesse momento é mais previsível do que
tentar "mesclar" com o que já estava marcado. Categoria sem recomendação
continua caindo no "marca tudo" de sempre (rodada 26), sem regressão.

`getAllMaterialColorsForAdmin()` ganhou um campo `typeId` (antes só tinha
`typeName`, um texto) — precisei do id de verdade pra comparar contra a
lista de tipos recomendados; sem isso o front teria que casar por nome,
frágil se dois materiais tiverem um tipo com o mesmo nome.

**Testado**: Playwright contra `CategoryRow` e `NewProductForm` mockados —
o checklist de recomendação mostra exatamente os tipos marcados
(`Cristal` marcado, `PLA` não, batendo com o mock); selecionar a categoria
"Decoração" (com Cristal recomendado) no cadastro de produto de fato
desmarca `Azul` (PLA) e marca `Transparente` (Cristal) na peça, com o
toast aparecendo. `npm run lint`, `npm run test` (10/10) e `npm run build`
passaram limpos. Um aviso de console do Base UI sobre o `Select` de
categoria mudando de uncontrolled pra controlled apareceu no teste, mas é
pré-existente (o padrão `value={categoryId || undefined}` já vinha da
rodada 26, não mexi nele) — não é uma regressão desta rodada, só não
peguei antes por falta de teste real desse fluxo específico.

### Rodada 30: Fase 2 — diferenciação visual Resina vs Plástico no preview 3D

Continuação direta da rodada anterior (usuário pediu pra emendar as fases
sem pausar pra confirmar cada uma). `buildPartMaterial()` em
`product-viewer-3d.tsx` passou a receber o `printProcess` da cor escolhida
(campo que já existe desde a Fase 1) e escolher entre
`THREE.MeshPhysicalMaterial` (Resina: `clearcoat: 0.9`, `roughness: 0.2` —
acabamento liso e brilhante) ou `THREE.MeshStandardMaterial` (Plástico ou
sem `printProcess`: `roughness: 0.7` — fosco, o comportamento de sempre).
`MeshPhysicalMaterial` estende o mesmo shader do `MeshStandardMaterial`,
então o patch de dual-color (gradiente via `onBeforeCompile`) não precisou
de nenhuma duplicação. `ViewerPart` ganhou o campo opcional `printProcess`,
propagado em `ProductConfigurator` (loja) e `ProductPartsManager` (preview
do admin) a partir da cor escolhida/padrão. Regiões pintadas (.3mf MMU)
ficaram de fora de propósito — pintura MMU é um recurso de fatiador FDM,
não faz sentido prático numa peça de resina.

**Escopo conscientemente reduzido**: a proposta original do roadmap incluía
translucidez específica pro tipo "Cristal" (`transmission`/`opacity`) —
não implementada agora, é um refinamento a mais em cima da diferenciação
principal (Resina vs Plástico), que já é o que resolve o pedido.

**Testado de um jeito que realmente prova a diferença, não só "não deu
erro"**: montei um cubo de teste com a MESMA cor base (`#9ca3af`) nos dois
materiais — se a única diferença fosse a cor, os screenshots seriam
idênticos exceto pelo hex. Comparei os bytes dos dois PNGs via Playwright
(claramente diferentes, um bem maior que o outro) e depois **olhei as
imagens de verdade**: a versão Resina mostra reflexos/brilho nítidos do
ambiente nas faces do cubo; a versão Plástico fica completamente fosca e
uniforme, sem nenhum reflexo. Sem comparar contra a mesma cor base, um
teste automatizado poderia "passar" só por causa da cor ser diferente,
mascarando se o material em si estava sendo aplicado certo. `npm run
lint`, `npm run test` (10/10) e `npm run build` passaram limpos.

### Rodada 31: Fase 3 — textos explicativos de material/tipo/cor na loja

Última etapa "rápida" do roadmap original desta leva (item pedido junto com
o resto na rodada 27: "Explicar cada material escolhido: se escolhe resina,
mostra as opcoes e o para o que é mais indicado... Ai se seleciona a
'cristal' explica que é translucida e otima para decorar"). O campo
`description` por Tipo já existia no banco e no admin desde a Fase 1 — só
não era lido em lugar nenhum da loja.

**Implementado**: `MaterialTypeDescription`, componente novo dentro de
`product-configurator.tsx`, mostra `"{material} · {tipo}: {description}"`
logo abaixo dos swatches de cor sempre que a cor selecionada (parte sem
regiões, ou a região pintada ativa) tiver um Tipo com `description`
preenchida — sem descrição cadastrada, não mostra nada, não inventa texto
genérico. Reaproveita 100% dado que já existia (`MaterialColor.type
.description`, presente em `types.ts` desde a Fase 1); nenhuma migração,
nenhuma mudança de action, nenhum campo novo no admin.

**Testado de ponta a ponta com Playwright** contra o dev server real (`npm
run dev` local, página mockada em `src/app/dev-preview-temp/`, removida
depois): produto de teste com duas cores — PLA sem `description` e Resina
Cristal com `description: "Translúcida, ótima pra decoração — mais frágil
que a Resistente."`. Confirmado que a cor padrão (PLA) não mostra nenhum
texto (`hasCristalTextDefault: false`), e que clicar na cor Resina Cristal
faz aparecer exatamente o texto cadastrado (`hasCristalTextAfter: true`,
conferido também via screenshot) — zero erros de console. `npx tsc
--noEmit`, `npm run lint` e `npm run build` (com `.next` limpo) passaram
limpos antes do teste visual.

Com isso, as 3 primeiras fases do `ROADMAP.md` (hierarquia Material→Tipo→
Cor + calculadora de preço, recomendação por categoria, diferenciação
visual Resina/Plástico, textos explicativos) estão todas ✅ feitas. Restam
Fase 4 (pedido de modelo customizado via IA — `⏸ aguardando decisão de
custo/cobrança`, não avança sozinha) e Fase 5 (modelo 3D animado na home —
`💤 bloqueada`, esperando o usuário fornecer o arquivo).

### Rodada 32: Fase 4 — pedido de modelo customizado via IA (Meshy)

Usuário confirmou as 3 decisões que travavam a Fase 4 desde a rodada 27
(recomendado em todas): **Meshy** como provedor, **1 geração grátis por
cliente por dia** como guardrail contra abuso, **taxa de modelagem
customizada com valor fixo** (não calculada a partir do crédito real
gasto). Dado o tamanho da feature (tabela nova, API paga externa, novo
caminho de pedido, config nova no admin), entrei em plan mode antes de
escrever qualquer código — o plano final foi salvo e aprovado antes da
implementação (arquitetura resumida abaixo).

**Decisão central de arquitetura**: em vez de mexer em `orders`/
`orderItems`/`submitOrder` (o caminho mais crítico e testado do site), a
confirmação de um modelo customizado **cria um produto oculto de
verdade** (`products.status = "draft"`, já 100% invisível em `/`,
`/produtos`, sitemap — `getPublishedProductsForCatalog`/`getProductBySlug`
já filtram por `published`) usando as MESMAS server actions que o admin já
usa pra cadastrar produto (`createProductDraft`, `createProductPart`,
`setPartMaterials`, `createSizeOption`). O pedido em si (`orders`+
`orderItems`) é criado direto dentro da action de confirmação — não
reaproveita `submitOrder`, já que a fórmula de preço é outra (material +
energia + pós-processamento + margem + taxa de IA, não base + modificador
de tamanho). O best-effort de Woovi + e-mails é replicado (copiado dos
mesmos 3 blocos try/catch de `submitOrder`, curtos demais pra valer a pena
abstrair em cima de dois formatos de pedido diferentes). Resultado: o
pedido final aparece em `/admin/pedidos`, `/pedido/[token]`, recebe Pix e
e-mail — **zero mudança no código de pedidos existente**. O produto oculto
por trás é editável/visualizável em `/admin/produtos/[id]` como qualquer
produto (preview 3D, arquivo pra baixar) — interface que já existia, zero
código novo de admin só pra "ver o modelo customizado".

**Schema** (migração `0011_damp_ser_duncan.sql`, só aditiva, gerou limpo
sem TTY — nada mudou de nome desta vez, ao contrário da Fase 1): tabela
`custom_model_requests` (customerId sem FK, mesmo padrão de
`orders.customerId`; `photoUrls` jsonb; enum de status
pending/generating/ready/failed/confirmed; `meshFileUrl`/`thumbnailUrl` já
re-hospedados; `weightGrams`/`width|height|depthMm` medidos no servidor;
`productId`/`orderId` preenchidos só quando confirmado) +
`storeSettings.customModelFeeCents` (nova seção "Modelo customizado via
IA" em `/admin/configuracoes`, mesmo padrão dos outros campos da
calculadora de preço).

**`measureMesh` virou reaproveitável no servidor** (refactor pequeno,
`src/features/catalog/mesh-measure.ts`): extraí `measureMeshFromBuffer(
buffer, extension)` — toda a lógica de volume/área já era pura (só
`THREE`/`three-stdlib` sobre um `ArrayBuffer`, nenhuma API de DOM), só a
linha `file.arrayBuffer()` era browser-only. `measureMesh(file, extension)`
virou um wrapper de uma linha; os 2 call sites existentes
(`mesh-upload-form.tsx`, `new-product-form.tsx`) não mudaram. Isso é o que
garante que o **peso/preço do modelo customizado nunca confia num valor
vindo do cliente** — é sempre medido a partir do STL baixado da Meshy, no
servidor, mesmo princípio já usado em todo o resto do checkout. Reconferido
com o mesmo cubo de teste de 20mm das rodadas 19/22 via script `tsx`
temporário: `volumeMm3` ≈ 8000, `surfaceAreaMm2` = 2400 — bate exatamente
com o resultado documentado antes do refactor.

**Cliente Meshy** (`src/features/custom-models/meshy.ts`) — mesmo padrão
de `payments/woovi.ts`: lança erro se `MESHY_API_KEY` não estiver
configurada, sem abstração de "Provider" genérica (só faz sentido pra
Woovi/Superfrete, que têm mais de uma implementação cogitada). Sempre usa
`POST /multi-image-to-3d` (aceita 1-4 fotos, funciona igual com 1 só —
evita manter dois endpoints), pedindo `target_formats: ["stl"]` e
`should_texture: false` (a peça é pintada depois com o material físico
escolhido, textura da IA não serve pra nada aqui). **Nunca testado contra
a API real** nesta sessão (sem `MESHY_API_KEY` disponível) — implementado
contra a documentação oficial (docs.meshy.ai), mesma ressalva já registrada
pra Woovi/Superfrete: o formato exato de request/response só se confirma
no primeiro uso real.

**Server actions** (`src/features/custom-models/actions.ts`): `submitCustomModelRequest`
(guardrail de 1/dia — primeiro rate-limit do projeto, uma query `COUNT`
simples, não vale generalizar ainda), `getCustomModelRequestStatus`
(chamada em loop client-side a cada 4s enquanto `generating` — poll simples
em vez de webhook, a Meshy suporta os dois mas webhook exigiria
infraestrutura nova pra um volume que não justifica; ao suceder, baixa
STL+thumbnail, mede, re-hospeda, tudo num único try/catch que vira
`status: "failed"` em qualquer etapa que falhar), `getCustomModelPriceEstimate`
+ `getCustomModelShippingQuotes` (preço/frete ao vivo antes de confirmar),
`confirmCustomModelRequest` (recalcula tudo do zero no servidor — preço e
frete — antes de criar produto+pedido). `getCustomModelShippingQuotes`
NÃO reaproveita `resolveShippingQuotes` (que resolve por `productSlug` via
`getProductBySlug`, só produtos `published`) — o produto oculto ainda nem
existe nesse ponto do fluxo; monta o item de frete direto a partir do
peso/dimensão já medidos na request.

**Reuso identificado e aplicado durante a implementação** (além do já
citado): `ColorSwatches`/`MaterialTypeDescription` (antes privados de
`product-configurator.tsx`) viraram exportados pra a tela de confirmação
do modelo customizado usar o mesmo seletor de cor + texto explicativo da
loja normal, sem duplicar JSX. `getAllMaterialColorsForConfigurator` (novo
em `catalog/queries.ts`) devolve o catálogo de cores no formato aninhado
`MaterialColor[]` (com `type.description`) que o configurador espera —
diferente de `getAllMaterialColorsForAdmin` (achatado, pensado pra
listar/marcar cores no admin). `getOrderPublicToken` (novo, mínimo, em
`orders/queries.ts`) resolve só o token público de um pedido — usado pra
linkar de volta ao reabrir uma request já confirmada.

**Bug pego rodando de verdade, não hipotético**: a rota
`/conta/modelo-3d/[id]/page.tsx` usa `PageProps<"/conta/modelo-3d/[id]">`
(convenção de rotas tipadas do Next 16) — `npx tsc --noEmit` acusou erro
porque os tipos de rota gerados (`.next/types/`) ainda não conheciam a
rota nova. Resolvido com `npx next typegen` (comando dedicado, não precisa
de build completo) antes de type-checar — vale lembrar disso em qualquer
sessão futura que adicione uma rota `[param]` nova e rode `tsc` antes de
qualquer `next dev`/`next build`.

**Testado**: Playwright contra o dev server real com uma página mockada
(`dev-preview-temp`, removida depois) cobrindo os 5 estados/telas —
formulário de novo pedido (validação client-side bloqueando submit sem
descrição/sem foto, adicionar/remover foto, dropzone), e as 4 telas de
status (`generating` com spinner, `failed` com mensagem+link "tentar de
novo", `ready` com preview 3D real de um STL de teste + seletor de cor
mudando a descrição do material ao clicar + toggle de entrega revelando os
campos de endereço, `confirmed` com link pro pedido) — zero erros de
console em todos os casos. A mensagem "Sessão expirada" aparecendo no
preço/frete da tela `ready` é esperada (sem Supabase Auth configurado
localmente, mesma limitação de sempre) — confirma que a checagem de sessão
funciona (bloqueia sem sessão) em vez de vazar dado de outro cliente.
`npm run lint`, `npx tsc --noEmit`, `npm run test` (10/10) e `npm run
build` (com `.next` limpo) passaram limpos.

**Não testado** (mesma limitação de sempre — sem `MESHY_API_KEY` nem
`DATABASE_URL`/Supabase real nesta sessão): o fluxo de ponta a ponta contra
a API real da Meshy (formato exato de request/response, tempo real de
geração, comportamento de erro por falta de crédito) e a gravação real no
Supabase (upload de foto, criação do produto oculto, do pedido, cobrança
Woovi). Primeira vez que o usuário testar isso em produção é o teste real
— vai precisar: (1) criar conta na Meshy e configurar `MESHY_API_KEY` na
Vercel (nunca colar a chave no chat — configurar direto no painel), (2)
rodar `scripts/storage-custom-models-setup.sql` no Supabase (cria o bucket
`custom-model-photos`), (3) rodar a migração `0011` contra o banco real,
(4) preencher a "Taxa de modelagem customizada" em `/admin/configuracoes`
(sem isso, a confirmação de pedido customizado fica bloqueada com uma
mensagem clara, não quebra).

**Ainda não iniciado**: Fase 5 (modelo 3D animado na home) — `💤
bloqueada`, esperando o usuário fornecer o arquivo do modelo.

### Rodada 33: Fase 5 — espaço reservado na home pra 2 impressoras animadas

Usuário mandou um embed do Sketchfab pedindo pra baixar o FBX — expliquei
que não dá: baixar exige login na conta do Sketchfab e aceite de licença
na hora (sem conector configurado pra isso), e o embed só serve pra tocar
o viewer, não expõe o arquivo original. Perguntou então onde gerar um
modelo animado via IA (queria uma impressora FDM e uma de resina/SLA
imprimindo algo). Pesquisei e a resposta é direta: **nenhuma ferramenta de
IA hoje faz esse tipo de animação bem** — Meshy, Mootion, 3D AI Studio
fazem animação por rig + biblioteca de movimentos prontos, e isso é só pra
personagens orgânicos (biped/quadrúpede/criatura); o FAQ da própria Meshy
confirma que corpos "não-padrão" (o exemplo deles é literalmente uma
centopeia) precisam de trabalho manual no Blender — uma impressora com
bico se movendo e uma peça crescendo por baixo é exatamente esse caso.
Sugeri como alternativas: achar um modelo já animado por um humano (tipo
o do Sketchfab, conferindo licença/download), gerar o modelo estático via
IA e animar manualmente no Blender (tutorial de nível iniciante pra um
efeito desses), ou simplificar pra um modelo estático girando.

Usuário decidiu seguir com 2 arquivos (FDM + resina) que ele mesmo vai
conseguir por fora, e pediu pra eu **reservar o espaço no site** enquanto
isso — pastas `animatedfile1`/`animatedfile2` pra ele colocar os arquivos
depois — e perguntou qual formato usar (glTF, GLB ou FBX).

**Resposta técnica**: GLB (glTF binário) é o formato certo pra 3D na web —
arquivo único (geometria+textura+animação embutidos), suporte nativo no
three.js via `useGLTF`/`useAnimations` do `@react-three/drei` (já
instalado, zero dependência nova), carrega muito mais rápido que FBX. FBX
é formato de DCC (Blender/Maya/Unity/Unreal), não pra runtime web — dá pra
converter FBX→GLB no Blender (importar + exportar como glTF Binary,
marcando "Include Animations") sem perder a animação.

**Implementado**: `AnimatedModelViewer`
(`src/components/animated-model-viewer.tsx`, novo) — carrega um GLB via
`useGLTF`, toca o primeiro clipe de animação embutido em loop via
`useAnimations` (mesmo par de hooks documentado oficialmente pelo drei pra
isso), com `Bounds fit clip` pra funcionar em qualquer escala de arquivo
(sem depender de adivinhar a escala real do modelo) e um Error Boundary
dedicado (mesmo princípio do `MeshErrorBoundary` já usado em
`ProductViewer3D`) que mostra um placeholder "Em breve" (ícone de
impressora + texto) em vez de quebrar enquanto o arquivo ainda não existe.
Pastas `public/animatedfile1/` e `public/animatedfile2/` criadas, cada uma
com um `LEIA-ME.txt` explicando pra colocar um arquivo `model.glb` ali —
nome fixo de propósito, pra não precisar de nenhuma mudança de código
depois que o usuário soltar os arquivos de verdade. Nova seção "Como
imprimimos" na home (`src/app/(loja)/page.tsx`), entre os cards de
destaque e a lista de categorias, com os 2 slots lado a lado.

**Bug real pego rodando de verdade, não hipotético** (achado só depois de
gerar um GLB sintético — um cubo com uma animação de posição real, via
`GLTFExporter` do three-stdlib — só pra ter algo de verdade pra testar o
caminho feliz, não só o caminho de erro): a primeira versão do componente
colocava `<Suspense>` **por fora do `<Canvas>` inteiro**, envolvendo o
Canvas junto com o Error Boundary, pra poder mostrar o placeholder em
HTML puro no lugar do canvas inteiro enquanto carrega. Isso parecia certo
na teoria, mas rodando de verdade contra um arquivo real (não só o 404),
o carregamento assíncrono (`useGLTF` + `Environment`) deixava o contexto
WebGL instável o bastante pra cair sozinho de vez em quando —
`THREE.WebGLRenderer: Context Lost` no console, canvas em branco,
reproduzido de forma consistente em testes locais repetidos. Comparei com
o `ProductViewer3D` (que já funciona hoje) e a diferença real era essa:
lá, o `<Suspense>` fica **dentro** do `<Canvas>` (em volta só de
`Bounds`+`Environment`, com fallback `null`), e o Error Boundary é que
fica por fora — nunca o Suspense por fora do Canvas inteiro. Corrigido
movendo o `Suspense` pra dentro do Canvas (fallback `null`, mesmo padrão),
mantendo só o Error Boundary por fora pro placeholder em HTML — a captura
de erro continua funcionando igual (confirmado: falha catch continua
funcionando não importa onde o Suspense esteja, é o rejeitar da promise
de carregamento que sobe pro Error Boundary, não o estado de pending).
Reconfirmado limpo em 3 execuções seguidas depois do fix, contra o mesmo
arquivo real.

Outro detalhe já corrigido antes de virar problema: `Bounds` com a prop
`observe` (que reobserva/reenquadra a câmera toda vez que o conteúdo
muda) NÃO pode ser usado aqui, porque o conteúdo está **animando o tempo
todo** (a peça se move a cada frame) — isso faria o `observe` disparar um
reenquadramento contínuo, caríssimo e instável. Usei só `fit clip` (sem
`observe`): enquadra uma vez no carregamento e não mexe mais depois,
mesmo com a peça se movendo.

**Testado**: Playwright contra o dev server real com um GLB sintético de
verdade (não só teoria) — confirmei visualmente que o cubo de teste
aparece enquadrado corretamente, iluminado (reflexo do `Environment`
visível), e a animação tocando (screenshots do canvas em momentos
diferentes têm bytes diferentes, confirmando movimento real, não só um
frame estático). Testado lado a lado com o outro slot ainda sem arquivo
(404 de propósito): o slot com arquivo carrega normal, o slot sem arquivo
mostra "Em breve" — sem nenhum erro não-tratado no console em nenhum dos
dois casos, e sem afetar um ao outro. `npm run lint`, `npx tsc --noEmit`,
`npm run test` (10/10) e `npm run build` (com `.next` limpo) passaram
limpos.

**Pendente**: usuário ainda precisa conseguir os 2 arquivos de verdade
(impressora FDM e impressora de resina/SLA, animadas) e colocar como
`model.glb` dentro de `public/animatedfile1/` e `public/animatedfile2/`
respectivamente — nenhuma mudança de código necessária depois disso.

### Rodada 34: modelos animados viram só flourish visual + "Imprima algo customizado" na home

Usuário rejeitou o enquadramento didático da rodada 33 ("Como imprimimos" +
legenda "Impressora FDM"/"Impressora de resina") — queria só um toque
visual, sem explicar nada: "só deixa o modelo lá rodando". Pediu pra
colocar um modelo ao lado do texto do banner e o outro "numa área legal".
No meio da implementação, acrescentou mais um pedido: faltava uma seção
"imprima algo customizado" com texto explicativo (dando destaque de
verdade na home pro recurso da Fase 4, que só existia dentro de `/conta`)
— e sugeriu trocar as posições (cubo no banner, carro nessa seção nova),
"veja o que funciona legal".

**Implementado**: `AnimatedModelViewer` perdeu a prop `label` visível e o
card com fundo/anel ao redor (`bg-muted/30 ring-1`) — agora é só o
`<Canvas>` transparente (`gl={{ alpha: true }}`), flutuando direto no
fundo gradiente da seção, sem parecer uma "foto de produto". O placeholder
de erro/carregamento virou uma div vazia (nada de ícone/texto) — qualquer
coisa visível ali contrariaria o pedido de "não falar nada". Removida a
seção "Como imprimimos". Hero (banner) virou 2 colunas em telas largas
(texto à esquerda, cubo girando à direita, empilha no mobile). Nova seção
"Imprima algo customizado" (badge "Novidade", texto curto, botão "Pedir
modelo customizado" linkando pra `/conta/modelo-3d`) com o jipe ao lado —
fica entre os cards de destaque e a lista de categorias.

**Testado**: Playwright confirmou, desktop e mobile, que nenhum texto tipo
"Impressora"/"Em breve" aparece em lugar nenhum da página, que a nova
seção e o CTA existem, e que os dois modelos renderizam nas posições
certas — zero erros de console. `npm run lint`, `npx tsc --noEmit`, `npm
run test` (10/10) e `npm run build` (`.next` limpo) passaram limpos.

**Lembrete já registrado, vale repetir**: os arquivos em
`animatedfile1/2` continuam sendo um jipe e um cubo mágico de teste, não
impressoras — trocar pelos modelos reais quando o usuário conseguir, sem
precisar mexer em código.

### Rodada 35: cubo cortando na tela — causa raiz real do `Bounds` (não é esfera, é caixa alinhada aos eixos)

Usuário reportou dois problemas em sequência, cada um confirmado com
print de produção de verdade: (1) o carro parecia menor que a área do
canvas dele; (2) depois de eu reduzir o `margin` do `Bounds` pra corrigir
isso, o **cubo** (o outro slot) passou a **cortar** nas bordas.

**Investiguei o código-fonte real do `Bounds`** (`node_modules/@react-three/
drei/core/Bounds.js`) em vez de continuar assumindo como ele calcula o
enquadramento — a rodada anterior descrevia (incorretamente) que ele usa a
esfera que envolve a caixa do objeto. Não é isso: `getSize()` usa
`maxSize = Math.max(boxSize.x, boxSize.y, boxSize.z)` — só a MAIOR
dimensão alinhada aos eixos, e calcula a distância da câmera a partir só
dela, a partir do ângulo de câmera ATUAL (fixo, não recalculado por
rotação). Isso explica os dois sintomas:
- **Carro** (formato alongado, ~2:1): a maior dimensão sozinha (o
  comprimento) já é bem maior que a silhueta em qualquer ângulo — sobra
  folga de verdade, por isso parecia pequeno com margin alto.
- **Cubo** (as 3 dimensões praticamente iguais): visto do ângulo de canto
  fixo da câmera ([2.5, 2, 2.5], não um ângulo alinhado a nenhum eixo), a
  silhueta real é até ~1,7x (raiz de 3) maior que a maior dimensão
  isolada — é o pior caso geométrico de um cubo visto na diagonal. Um
  `margin` baixo não tem folga suficiente pra cobrir essa diferença, e a
  peça literalmente sai do quadro em alguns ângulos de rotação.

**Fix**: `AnimatedModelViewer` ganhou uma prop `margin` (default `1.4` —
valor seguro, não corta objetos compactos/cúbicos). Cada instância ajusta
por si: o cubo (hero) fica no default seguro; o carro/jipe ("Imprima algo
customizado") usa `margin={1.15}`, com um comentário no código avisando
pra reconsiderar esse número quando o arquivo for trocado pelo modelo
real da impressora (proporção desconhecida ainda).

**Testado com rigor bem maior que a rodada anterior** (que só amostrou 6
quadros ao longo de 6s e não pegou o corte do cubo): calculei o período
real de uma volta completa do `autoRotate` (velocidade 1.2 ⇒ ~50s/volta,
a partir da referência do `OrbitControls` do three.js) e capturei 22
quadros ao longo de 55s (~16° de diferença entre eles, cobertura da volta
inteira) pros dois modelos ao mesmo tempo, contra um fundo contrastante
(pra qualquer corte ficar óbvio). Nenhum dos 22 quadros mostra o cubo ou
o carro cortados nas bordas — confirmei visualmente quadro a quadro, não
só por amostragem esparsa. `npm run lint`, `npx tsc --noEmit`, `npm run
test` (10/10) e `npm run build` (`.next` limpo) passaram limpos.

**Lição pra próximas rodadas envolvendo bibliotecas de terceiro**: quando
o comportamento observado não bate com a explicação inicial (rodada 34
disse "esfera", o bug do cubo provou que não), ler o código-fonte real da
lib antes de tentar mais um ajuste de valor no escuro — resolveu de
primeira depois disso, em vez de mais uma rodada de tentativa e erro.

### Rodada 36: mais formatos de imagem (AVIF), exclusão segura de material, bug do dual-color, transparência de cor + polimento do configurador

Leva de pedidos menores encadeados na mesma sessão.

**Mais formatos de imagem no admin**: usuário pediu suporte a AVIF (além do
WebP que já existia) pra upload de produto/categoria/material. `AVIF`
adicionado a `ALLOWED_MEDIA_EXTENSIONS`
(`src/lib/supabase/storage-constants.ts`); consolidei dois mapas
`CONTENT_TYPE_BY_EXTENSION` duplicados (um em
`product-images-manager.tsx`, outro em `category-image-upload.tsx`) num
único `MEDIA_CONTENT_TYPE_BY_EXTENSION` compartilhado, e troquei várias
mensagens de erro hardcoded ("Use jpg, png, webp ou gif") por texto
derivado da própria lista de extensões permitidas — evita esse tipo de
mensagem ficar desatualizada de novo na próxima extensão nova.
Confirmado que materiais não têm upload de imagem (cores são só hex),
nada a mudar lá.

**Exclusão de material sem checagem de uso (bug real, não hipotético)**:
usuário perguntou "se eu deletar um material que tá em uso, o que
acontece? e se for o padrão de uma parte?" — investigando,
`deleteMaterialColor`/`Type`/`Material` não tinham NENHUMA checagem: o
`ON DELETE CASCADE`/`SET NULL` do banco simplesmente apagava a atribuição
silenciosamente, sem avisar o admin do impacto. Perguntei ao usuário o
comportamento desejado; resposta (não uma das opções sugeridas, texto
livre): "deixa excluir e remove do produto. se for a cor padrão, pergunta
por qual cor deve substituir". Implementado exatamente isso:
- `getMaterialColorDeletionImpact(colorIds)` (`queries.ts`) — lista toda
  parte/região que tem uma dessas cores como padrão, com as cores
  restantes disponíveis pra reatribuir.
- `checkMaterialColorDeletionImpact`/`checkMaterialTypeDeletionImpact`/
  `checkMaterialDeletionImpact` (`material-actions.ts`) — versões pra cada
  nível da hierarquia (excluir um Tipo ou um Material inteiro afeta todas
  as cores dele de uma vez).
- `deleteMaterial`/`deleteMaterialType`/`deleteMaterialColor` passaram a
  aceitar uma lista de `{ kind, id, newDefaultColorId }` e rodam a
  reatribuição + o delete na MESMA transação (`db.transaction`) — nunca os
  dois separados, pra não ter um estado intermediário inconsistente se o
  segundo passo falhar.
- `ConfirmDeleteMaterialButton` (novo componente) — ao abrir o diálogo,
  chama o `checkImpact()` correspondente; sem impacto, é uma confirmação
  normal; com impacto, mostra cada parte/região afetada com um `Select`
  pra escolher a cor substituta (ou "nenhuma", via sentinel
  `NO_DEFAULT_VALUE`) antes de liberar o "Confirmar exclusão".

**Bug real do dual-color (achado no meio da mesma leva)**: usuário
reportou "todo plástico que cadastro só permite duas cores" — causa raiz:
o campo "2ª cor" (`<input type="color">`) NUNCA fica vazio no navegador,
então mesmo escolhendo criar uma cor sólida sob um Material com
`allowsDualColor=true`, o formulário sempre mandava um `hexColorSecondary`
de verdade, e a action salvava sem questionar — todo material sob um
Material dual-color virava dual-color na prática, sem o admin escolher
isso. Fix: checkbox "Cor dupla (dual-color)" NOVO por cor (não mais só a
flag do Material), inicializado a partir de `Boolean(hexColorSecondary)` —
o campo "2ª cor" só aparece quando o checkbox está marcado. Achei e
corrigi de brinde um bug secundário no mesmo código: dois lugares usavam
`?? "#f97316"` como fallback de `hexColorSecondary`, o que fazia esse
fallback SEMPRE truthy e o checkbox nascer marcado por engano mesmo pra
cores que eram `null` de verdade — trocado pra preservar o `null` real.

**Transparência de cor (pra resina tipo "Cristal")**: nova coluna
`material_colors.opacity` (migração `0012_soft_mole_man.sql`, numeric(3,2)
default 1, aditiva) — 1 = opaco de sempre, menor que 1 deixa a peça
translúcida no preview 3D. Slider "Transparência" no formulário de cor do
admin (exibido como `100% - opacity` pra ficar intuitivo: "80% de
transparência" em vez de "0.2 de opacidade"). Threading completo até o
viewer: `MaterialColor`/`ViewerPart`/`PartColorProps` ganharam `opacity`,
`buildPartMaterial()` liga `material.transparent=true` +
`material.opacity` quando `< 1`.

**Bug real e nada óbvio pego durante o teste** (não teria achado sem
comparar duas capturas de tela pixel a pixel): a primeira versão de
`PlaceholderPart` (usado enquanto a parte não tem arquivo 3D — o caso do
produto mockado testado) aplicava opacidade via
`<meshStandardMaterial transparent={...} opacity={...} />`
**declarativo**, igual a qualquer outra prop React-Three-Fiber. Isso NÃO
funciona nesta versão de r3f: `applyProps` mutava corretamente
`material.transparent`/`.opacity` na instância real (confirmado
inspecionando o objeto Three.js de verdade via um hook de debug
temporário), mas sem `material.needsUpdate = true`, o `WebGLRenderer`
nunca reclassifica o objeto pra fila de renderização "transparente" —
resultado: visualmente idêntico ao opaco, não importa o valor de opacity
(testei até com 0.05, praticamente invisível — zero diferença). Confirmei
isolando num R3F mínimo (só um `<mesh><boxGeometry/><meshStandardMaterial
transparent opacity/></mesh>`, sem nenhum código deste projeto) que o
mesmo bug se reproduz — não é peculiaridade de `PlaceholderPart`, é do
padrão declarativo em si nesta versão de r3f/three. Mutar o mesmo material
via `page.evaluate()` direto (bypassando React) reproduziu a transparência
corretamente, confirmando que o problema é a ausência do
`needsUpdate`/recriação, não o WebGL em si. **Fix**: `PlaceholderPart`
passou a construir o material via `useMemo` (nova instância a cada troca
de cor/opacidade) e anexar via prop `material={...}` do `<RoundedBox>`, em
vez de JSX declarativo mutável — o mesmo padrão que `buildPartMaterial()`
já usava pra STL/OBJ/3MF reais (por isso esses nunca tiveram esse bug: já
recriavam o material do zero a cada mudança via `useMemo`). Confirmado via
Playwright que as duas capturas (opaco vs. opacity 0.35) agora produzem
arquivos PNG genuinamente diferentes — antes do fix eram **byte-a-byte
idênticos**, uma prova bem mais forte que "parece igual" de que o bug era
real e o fix funcionou. `MmuPart` (regiões pintadas) não foi tocado —
continua sem suporte a opacidade, decisão já registrada na rodada 12/30
(recurso específico de resina, MMU é FDM).

**4 melhorias pedidas na tela de produto**, todas na mesma leva:
1. **Separador por Tipo de material**: `ColorSwatches` agora agrupa as
   cores por `color.type.id` (não só por Material — Plástico→PLA e
   Plástico→ABS viram grupos separados, já que têm preço/descrição
   diferentes), com um rótulo "Material · Tipo" acima de cada grupo — só
   aparece quando há mais de um grupo, pra não repetir informação óbvia
   no caso comum de uma parte com um material só.
2. **Nome da cor sempre visível**: `MaterialTypeDescription` mostra
   "Material · Tipo · Cor" sempre que alguma cor está selecionada (não só
   quando o Tipo tem descrição cadastrada, como na rodada 31) — a
   descrição (quando existe) some no final, mas o nome nunca falta.
3. **Swatch com preview de transparência real**: `ColorSwatchButton`
   ganhou um fundo quadriculado (`repeating-conic-gradient`) atrás de uma
   camada de cor com `opacity` aplicada via CSS — uma cor de resina
   translúcida mostra o quadriculado por trás em vez de só parecer uma
   cor mais pálida.
4. **Espaço vazio entre cores e preço**: a caixa de preço/botões usava
   `mt-auto` (grudava no fim da coluna, que esticava até a altura do
   preview 3D à esquerda) — trocado por `sticky top-6`, eliminando o vão
   e mantendo o preço visível ao rolar a página (padrão comum de loja).

**Testado com Playwright contra uma página mockada** (produto com 3 cores
de Plástico em 2 Tipos — PLA e ABS — e uma cor de Resina Cristal
translúcida): confirmei os 3 grupos com rótulo certo
("Plástico · PLA"/"Plástico · ABS"/"Resina · Cristal"), o texto completo
"Resina · Cristal · Transparente: Translúcida, ótima pra decoração..." ao
selecionar a cor translúcida, o nome "Plástico · PLA · Azul" ao selecionar
uma cor sem descrição, a opacidade 0.35 aplicada de verdade no `<span>` do
swatch, e a caixa de preço permanecendo visível (sticky) depois de rolar
300px — zero erros de console em todos os passos. `npm run lint`, `npx
tsc --noEmit`, `npm run test` (10/10) e `npm run build` (`.next` limpo)
passaram limpos depois do fix do bug de opacidade.

**Pendente**: rodar a migração `0012` contra o Supabase real — atualizei
`scripts/pending-migrations-0001-a-0012.sql` (renomeado de
`...-0011.sql`) pra incluir esse `ALTER TABLE` novo, então um usuário que
ainda não rodou nada das rodadas 10-32 só precisa desse arquivo único
atualizado; quem já rodou até a 0011 só precisa da linha nova
(`ALTER TABLE "material_colors" ADD COLUMN IF NOT EXISTS "opacity"
numeric(3, 2) DEFAULT '1' NOT NULL;`).

### Rodada 37 (Fase 1c): preço ao vivo por material/cor — reverte a Fase 1

Usuário confirmou explicitamente ("Sim, calcular ao vivo por
material/cor") reverter a decisão da Fase 1 (rodada 28) de preço fixo por
produto. Antes de implementar, usei `EnterPlanMode` (mudança de
arquitetura, mexe em pricing.ts/checkout/schema) e perguntei qual modelo
usar, dado que não existia peso por PEÇA (só agregado do produto) — 3
opções com trade-off explícito de precisão vs. esforço/migração. Usuário
escolheu a mais precisa: **cálculo real por peso, peça a peça**, mesmo
custando uma migração nova + precisar reconfirmar upload de peças já
cadastradas.

**Modelo implementado — delta sobre o material padrão, não custo
absoluto**: `basePriceCents` continua sendo o preço-âncora que o admin
define assumindo o material PADRÃO de cada peça; o preço ao vivo é
`basePriceCents + size.priceModifierCents + Σ por peça (custo do material
ESCOLHIDO − custo do material PADRÃO)`. Isso garante que a configuração
padrão sempre resulta EXATAMENTE no preço já cadastrado (zero risco de
mudar preço de produto existente) — só diverge quando o cliente escolhe
algo diferente do padrão. Sem margem reaplicada sobre o delta (mesma
alavanca da calculadora do admin: se quiser margem embutida, infla
`pricePerKgCents`).

**Schema** (migração `0013_quiet_timeslip.sql`, aditiva, gerada limpa —
sem risco de rename ambíguo como a 0009 da Fase 1): `product_parts
.weight_grams` (peso só daquela peça) e `materials.dual_color_fee_cents`
(taxa fixa quando a cor escolhida é dual-color).

**`print-estimate.ts`** ganhou `estimatePartRawCostCents` — irmã mais
simples de `estimateMaterialCost` (que continua intocada, só usada pela
calculadora do admin), pro cálculo AO VIVO por peça. Diferença
deliberada: sempre trata `printSpeedValue` como g/hora (mesmo pra resina,
que fisicamente escala com altura) — não existe altura por PEÇA no
schema, só por produto inteiro, e a calculadora do admin já cobre esse
caso com mais precisão. Aproximação documentada, mesmo espírito de
`estimatePrintWeight` já assumir sempre FDM/PLA/20% infill.

**`pricing.ts`**: `calculateProductPriceCents` ganhou um 3º parâmetro
opcional `pricingConfig` (energia/potência da loja, default `null` —
degrade gracioso: sem ele, ainda soma delta de material+pós-processamento
+dual-color, só sem o componente de energia). Peça com `weightGrams: null`
contribui 0, nunca quebra. Peça com regiões pintadas (.3mf MMU) divide o
peso igualmente entre elas (sem dado melhor disponível). Resolução de cor
padrão duplicada aqui (mesma lógica de `product-configurator.tsx`) porque
esta função precisa rodar em qualquer lado (servidor, testes) sem
depender de um Client Component.

**Threading do `pricingConfig`**: página do produto
(`produtos/[slug]/page.tsx`) busca `getStoreSettings().catch(() => null)`
(mesma cautela da rodada 25) e passa pro `ProductConfigurator`;
`checkout/actions.ts`'s `submitOrder` busca a mesma config uma vez (fora
do loop de itens) pra bater exatamente com o preço que o cliente viu.

**Popular peso por peça + fix lateral de bug real**: `confirmPartMesh`
ganhou um `weightGrams?` opcional — quando presente, grava na peça E
recalcula `products.weightGrams` (usado no frete) como a SOMA do peso de
todas as peças que já têm peso próprio. Isso corrigiu um bug lateral que
já existia desde a rodada 22: `applySuggestedWeight` sobrescrevia o peso
do PRODUTO com o peso de UMA peça só a cada upload — em produto
multi-peça, reconfirmar uma peça apagava a contribuição das outras.
`MeshUploadForm` e `NewProductForm` (fluxo de criação) passaram a medir o
peso de cada peça localmente (já tinham a lógica, só não persistiam por
peça) e não chamam mais `applySuggestedWeight` separadamente (redundante
agora que `confirmPartMesh` já recalcula o agregado).

**Admin — taxa dual-color**: campo novo "Taxa dual-color (R$/peça)" em
`MaterialForm` (`material-manager.tsx`), só visível quando "Permite
dual-color" está marcado — mesmo padrão do campo de pós-processamento.
Reforçado no servidor (`materialRow()` em `material-actions.ts`): nunca
confia só na UI escondendo o campo, grava `0` se `allowsDualColor` for
false, mesma cautela já registrada na rodada 14 pro `hexColorSecondary`.

**Testado com rigor**: `pricing.test.ts` reescrito com 13 testes,
incluindo contas feitas à mão pra cada cenário (delta de material sem/com
energia, taxa dual-color isolada, peça sem peso contribuindo zero, região
pintada) — todos passaram de primeira contra a implementação. Depois,
verificado via Playwright contra dois `ProductConfigurator` mockados
(espelhando os mesmos fixtures do teste unitário, pra cross-checar o
mesmo número já verificado): confirmei que o preço exibido bate
EXATAMENTE com a conta à mão em 5 cenários (padrão R$25,00; dual-color
R$30,00; madeira sem energia R$31,40; madeira com energia R$31,47; e
trocar de volta pro padrão retorna a R$25,00 exato, provando que o modelo
delta funciona nos dois sentidos sem deriva) — zero erros de console.
`npm run lint`, `npx tsc --noEmit`, `npm run test` (13/13) e `npm run
build` (`.next` limpo) passaram limpos.

**Pendente**: rodar a migração `0013` contra o Supabase real — SQL
combinado 0001-0013 atualizado em
`scripts/pending-migrations-0001-a-0013.sql` (renomeado de `...-0012.sql`
da rodada 36). Peças já cadastradas antes desta migração ficam com
`weight_grams: null` até o admin reenviar/reconfirmar o mesmo arquivo 3D
— não dá pra retroagir sem reprocessar o arquivo original; documentado no
ROADMAP.md (Fase 1c). Não testado contra o Supabase real (mesma limitação
de sempre — sem `DATABASE_URL` nesta sessão): a lógica de
`confirmPartMesh` recalculando o agregado do produto (transação com
`SELECT` + `UPDATE`) é direta e já passa lint/build/type-check, mas o
primeiro teste de verdade é o usuário reenviando um arquivo de uma peça de
produto multi-peça em produção.

### Rodada 38 (Fase 4b): enviar STL próprio pra orçamento (sem IA)

Usuário perguntou qual seria a melhor forma de deixar um cliente que já
tem seu próprio STL mandar pra loja pra receber um orçamento — perguntando
explicitamente se seria "a mesma forma da geração por IA". Investiguei a
fundo `src/features/custom-models/` antes de responder e confirmei que
sim: quase todo o fluxo pós-"ready" da Fase 4 (viewer 3D, seletor de
material, preço ao vivo, formulário de entrega, confirmação que cria
produto oculto + pedido) já é agnóstico de como o request chegou lá —
recomendei reaproveitar isso e só pular a etapa de geração/polling da
Meshy. Usuário aprovou e, numa segunda pergunta de esclarecimento (via
`AskUserQuestion`, dado que a decisão envolve dinheiro e schema), confirmou
duas coisas: (1) não cobrar a taxa de "modelagem customizada" de quem já
manda o arquivo (ela cobre o crédito de IA gasto, que não existe aqui) e
(2) manter tudo na mesma tela `/conta/modelo-3d`, com um toggle no topo,
em vez de duplicar página.

**Coluna nova**: `custom_model_requests.origin` (`"ai" | "upload"`,
default `"ai"` — migração `0014_omniscient_sister_grimm.sql`, gerada
limpa, sem risco de rename). Só precisou tocar em 2 pontos que realmente
dependiam do tipo de request:
- `computeCustomModelPrice` (`custom-models/pricing.ts`): quando
  `origin === "upload"`, pula inteiramente a checagem/soma de
  `customModelFeeCents` (nem bloqueia mais a confirmação se a loja não
  tiver configurado essa taxa — faz sentido, já que ela não se aplica).
  Quando `origin === "ai"`, comportamento idêntico ao de antes.
- Rate-limit de 1 geração/dia em `submitCustomModelRequest`: a query de
  contagem contava QUALQUER request do cliente no dia, sem filtrar por
  tipo — isso bloquearia incorretamente uma geração por IA só porque o
  cliente também tinha feito um upload direto no mesmo dia (ou vice-versa).
  Adicionei `eq(customModelRequests.origin, "ai")` na condição, restrita
  só às gerações de verdade.

**Ação nova, bem menor que `submitCustomModelRequest`**:
`submitDirectMeshModelRequest({ description, meshPath, extension })` —
baixa os bytes do arquivo recém-enviado via
`storage.storage.from(MODELS_BUCKET).download(path)` (método do SDK do
Supabase não usado ainda no projeto, mas mesmo objeto já usado pra
`.upload()`/`.getPublicUrl()` em outros lugares), mede com
`measureMeshFromBuffer` (a MESMA função já usada pelo resultado da Meshy
— zero código de medição novo) + `estimatePrintWeight`, e insere a linha
já com `status: "ready"`, `photoUrls: []`, `thumbnailUrl: null` — nunca
passa por `pending`/`generating`. `createDirectMeshUploadUrl(extension)`
é o gêmeo de `createCustomModelPhotoUploadUrl`, só mirando `MODELS_BUCKET`
em vez do bucket de fotos.

**UI**: `NewCustomModelRequestForm` virou mode-aware (`mode: "ai" |
"upload"`, dois botões toggle no topo, mesmo padrão visual já usado pro
toggle Retirada/Correio no componente de detalhe). No modo upload, a
descrição vira opcional-de-fato-mas-obrigatória-no-schema com um label
mais leve ("Alguma observação sobre a peça?") e o dropzone de fotos é
substituído por um dropzone de arquivo 3D único — visual copiado ícone-
por-ícone de `MeshUploadForm` (seta pra cima + textos), com a mesma
medição client-side (`measureMesh`) só pra feedback imediato ("Detectamos:
2.0 × 2.0 × 2.0 cm") — a medida que vale pro preço é sempre a do servidor.
`CustomModelRequestDetail` precisou de UMA mudança: a linha "Modelagem
customizada: X" no breakdown de preço só aparece quando
`customModelFeeCents > 0` (antes sempre aparecia). Todo o resto do
componente (spinner de geração, viewer, seletor de cor, formulário de
entrega, confirmação) funciona sem nenhuma mudança — o bloco
`pending`/`generating` simplesmente nunca chega a renderizar pra uma
request que nasce direto em "ready". Lista de pedidos
(`/conta/modelo-3d`) ganhou um rótulo extra por linha ("Gerado por IA" /
"Arquivo próprio") pra diferenciar os dois tipos numa lista compartilhada.

**Testado**: `npx tsc --noEmit` limpo de primeira (nenhum call site
esquecido — `origin` flui automaticamente por toda query que já buscava a
row inteira). Via Playwright contra `NewCustomModelRequestForm` e
`CustomModelRequestDetail` mockados: confirmei que o toggle troca
corretamente entre os dois formulários (dropzone de fotos some no modo
upload), que subir um STL de teste de 20mm real mostra a medida exata
"2.0 × 2.0 × 2.0 cm" (mesmo cubo de teste já usado em rodadas anteriores,
validando que `measureMesh` no client bate com a mesma função usada no
servidor), que a validação do modo IA ainda barra submit sem descrição, e
que `CustomModelRequestDetail` com `origin: "upload"` renderiza o estado
"ready" (viewer + seletor de cor) sem quebrar — zero erros de console em
todos os passos. A linha condicional do breakdown de preço não pôde ser
verificada visualmente contra um preço real (a chamada de preço depende
de sessão Supabase + banco, ambos ausentes nesta sessão — mesma limitação
de sempre; falhou de forma limpa com "Sessão expirada", confirmando que o
`origin` novo não quebra esse caminho, mas não prova o ternário em tela).
A condicional em si (`customModelFeeCents > 0 ? ... : null`) é simples o
bastante pra revisão de código bastar. `npm run lint`, `npm run test`
(13/13, suíte de catálogo não afetada por esta rodada) e `npm run build`
(`.next` limpo) passaram limpos.

**Pendente**: rodar a migração `0014` contra o Supabase real — SQL
combinado atualizado em `scripts/pending-migrations-0001-a-0014.sql`
(renomeado de `...-0013.sql`). Fluxo de ponta a ponta contra o Supabase
real (upload de verdade, medição, preço, confirmação de pedido) é o
primeiro teste de verdade, a cargo do usuário — mesma ressalva de sempre.

### Rodada 39: 4 ajustes no admin de produtos (tamanho padrão, peso, ângulo da câmera, upload de mídia)

Usuário reportou 4 problemas de uma vez no fluxo de cadastro/edição de
produto. Dado o tamanho (schema novo + vários componentes), entrei em
`EnterPlanMode` e investiguei os 4 a fundo (3 agentes Explore em paralelo)
antes de escrever qualquer plano.

**1. Bug real confirmado — tamanho padrão vinha o menor (P), não o
original (M)**: `autoGenerateSizeOptions` (rodada 19) insere P/M/G com
`sortOrder: 0/1/2` respectivamente, e `product-configurator.tsx` escolhia
o tamanho padrão como `product.sizeOptions[0]?.id` — por POSIÇÃO no
array, não por qual tamanho é "o real". Como P tem `sortOrder: 0`, ele
sempre vencia. Fix: o padrão agora é explicitamente a opção com
`scaleFactor === 1`, caindo pro `sizeOptions[0]` só se nenhuma tiver
escala exatamente 1. **Fix lateral da mesma família**: `createSizeOption`
(tamanho adicionado manualmente pelo admin) não definia `sortOrder`,
caindo no default da coluna (`0`) — colidia com o P e fazia o tamanho novo
aparecer no INÍCIO da lista do admin em vez do fim; agora calcula
`sortOrder` como o maior existente + 1.

**2. Peso nunca era visível persistente no admin, sem onde corrigir**:
desde a Fase 1c (rodada 37), `productParts.weightGrams` só é preenchido
automaticamente no upload — não existia NENHUMA exibição dele em lugar
nenhum do admin (só um toast que some no upload), nem ação pra corrigir
manualmente se a estimativa automática estivesse errada. Adicionado:
`PartWeightEditor` (novo componente client, mesmo padrão de
"clique Editar → vira formulário" já usado em `SizeRow`/
`MaterialColorRow`/`CategoryRow`) mostra "Peso: ~Xg" persistente em cada
card de parte, com edição manual via nova Server Action
`updatePartWeight`. Extraí `recalculateProductWeightGrams(tx, productId)`
de dentro de `confirmPartMesh` (que já fazia essa soma) pra reaproveitar
nos dois lugares em vez de duplicar. Uma linha extra perto da calculadora
de preço mostra o peso TOTAL do produto (soma das peças, usado no frete)
como referência.

**3. "Usar esse ângulo como foto" não era o que o usuário queria — ele
queria escolher o ângulo INICIAL do visualizador interativo, não travar
numa foto estática**: investigação do código-fonte do `Bounds` (drei)
confirmou o mecanismo exato: `reset()`/`fit()` calculam a direção da
câmera a partir de `camera.position` ATUAL menos o centro da bounding
box, normalizam, e só recalculam a DISTÂNCIA (nunca o ângulo) pra
enquadrar o conteúdo. Ou seja, bastava trocar a posição inicial hardcoded
(`[2.5, 2, 2.5]`) por uma customizada por produto — o `Bounds` continua
cuidando do zoom sozinho, sem precisar mexer em mais nada.

Nova coluna `products.viewerCameraPosition` (jsonb nullable, migração
`0015_eminent_fat_cobra.sql`, gerada limpa) guarda só um `{x,y,z}` — só a
DIREÇÃO desse ponto importa. `ProductViewer3D` ganhou 2 props novas:
`initialCameraPosition` (usada no `camera={{position: [...]}}` do
`<Canvas>` em vez do array fixo) e `onControlsReady` (mesmo padrão já
estabelecido de `CanvasCaptureBridge`/`onCanvasReady` — um componente
filho dentro do `<Canvas>` usando `useThree(state => state.controls)`,
que já existe registrado via `makeDefault` no `<OrbitControls>` de
sempre, sem precisar de nenhum ref novo). Novo componente admin
`ProductViewerAngleControl` renderiza a MONTAGEM INTEIRA do produto
(todas as peças com a cor padrão — diferente do `PartThumbnailCapture`,
que continua existindo do jeito que está, só pra gerar fotos de
catálogo) com um botão "Usar este ângulo como padrão" (lê
`controls.object.position` — a câmera de verdade — no clique) e, quando
já existe um ângulo customizado, um botão "Restaurar padrão". Nova
Server Action `updateProductViewerAngle` valida que os 3 números são
finitos e não formam um vetor nulo (quebraria o `.normalize()` do
Bounds). Threading completo: `Product` (`types.ts`) e `getProductBySlug`
ganham o campo; `ProductConfigurator` passa `product.viewerCameraPosition`
pro `ProductViewer3D` que o cliente vê.

**4. Upload de foto/gif do produto era um `<input type="file">` cru**:
`ProductImagesManager` tinha só isso dentro de um `<form>` com borda
tracejada, mas sem ícone nem área clicável de verdade — trocado pelo
MESMO dropzone já usado em `MeshUploadForm` (ícone SVG de upload, texto
"Arraste o arquivo aqui ou **clique pra escolher**", drag-and-drop de
verdade, `<input className="sr-only">` escondido). Reaproveita 100% a
validação/constantes já importadas — só a camada visual do trigger
mudou, a lógica de upload/confirmação continua idêntica.

**Testado**: Playwright contra uma página mockada cobrindo os 3
componentes de uma vez (produto com 3 tamanhos gerados automaticamente,
peça com um STL de teste real de 20mm, `ProductImagesManager` vazio):
confirmei que o tamanho M vem selecionado e destacado ao carregar (preço
exibido bate com o base, sem nenhum modificador — antes seria o de P),
que "Peso: ~85g" aparece persistente com um botão Editar que realmente
abre um `<input type="number">`, que a linha de peso total do produto
aparece perto da calculadora, que o `ProductViewerAngleControl` renderiza
o cubo de teste com o botão "Usar este ângulo como padrão" (clicar
mostra um toast de erro gracioso — "Não foi possível salvar o ângulo" —
já que não há banco nesta sessão, confirmando que o caminho de falha é
limpo, não trava), e que o dropzone de foto/gif troca completamente o
`<input>` cru por um ícone+texto+drag-and-drop, sem sobrar nenhum input
de arquivo visível fora do padrão `sr-only`. Zero erros de console em
todos os passos. `npm run lint`, `npx tsc --noEmit`, `npm run test`
(13/13, suíte de catálogo não afetada) e `npm run build` (`.next` limpo)
passaram limpos.

**Pendente**: rodar a migração `0015` contra o Supabase real — SQL
combinado atualizado em `scripts/pending-migrations-0001-a-0015.sql`
(renomeado de `...-0014.sql`). Não testado contra o Supabase real (mesma
limitação de sempre): a lógica de `updatePartWeight`/
`updateProductViewerAngle` é direta (um `UPDATE` + revalidação) e já
passa lint/build/type-check, mas o primeiro teste de verdade é o usuário
usando os 4 ajustes em produção.

### Rodada 40: página 404 customizada

Usuário pediu uma 404 "mais divertida", com liberdade criativa, pra um
site de impressão 3D. `src/app/not-found.tsx` novo (não existia nenhum —
confirmado por busca antes de criar) — piada em cima do clássico "print
falhou e virou espaguete" (peça descola da mesa, o bico continua
extrudendo no ar): squiggle SVG ondulado em laranja (balançando devagar
via `@keyframes` inline), "404" grande em azul, texto "Essa peça saiu
torta.", e um rodapé estilo log de impressora ("erro g-code:
peça_não_encontrada (404)"). Reaproveita a mesma técnica de fundo com
círculos desfocados azul/laranja já usada no hero da home (rodada 18) e
o `SiteLogo`/`Button` (`render`+`nativeButton={false}`, padrão base-ui já
estabelecido) — dois CTAs: "Voltar pro início" e "Imprimir algo de
verdade" (linka pra `/conta/modelo-3d`, um cross-sell leve dentro da
piada, em vez de repetir o link pra home).

Confirmado que um `src/app/not-found.tsx` simples (não o
`global-not-found.js` experimental) é suficiente aqui: só existe UM
layout raiz no projeto todo (`src/app/layout.tsx`, único lugar com
`<html>`/`<body>`) — `(loja)/layout.tsx` e `admin/layout.tsx` só
aninham `<div>`s, não redeclaram `<html>`. Por isso o not-found raiz já
cobre qualquer URL não encontrada no site inteiro.

**Testado**: `curl` contra uma rota inexistente confirmou status HTTP
**404** de verdade (não 200 com conteúdo de erro). Playwright contra o
dev server real, claro e escuro: página renderiza certo nos dois temas,
sem nenhum erro de console (o único "erro" logado é o esperado — o
browser reportando que o próprio documento retornou 404, não um erro de
JS). `npm run lint`, `npx tsc --noEmit`, `npm run test` (13/13) e `npm
run build` (`.next` limpo, `/_not-found` aparece na lista de rotas)
passaram limpos.

### Rodada 41: catálogo de materiais real (Cliever/3D Cure/Quanton) + lista de cores ficou grande demais

Encadeamento de 3 pedidos na mesma leva.

**Script de seed do catálogo completo** (`scripts/seed-full-material-catalog.sql`,
criado a pedido do usuário — "crie um sql pra gerar todos os materiais
que preciso, e todas as cores"): usei `WebFetch` pra consultar sites reais
de fornecedores em vez de inventar uma paleta genérica.
- **Plástico** (PLA/PLA Silk/ABS/PETG): consultei
  `https://cliever3d.commercesuite.com.br/filamento` produto a produto —
  usuário perguntou "por que não tem todas as cores no ABS e PETG?" e a
  resposta é que **não é bug**: PETG realmente só tem 2 cores no catálogo
  real do fornecedor (Preto/Branco), ABS tem 6. PLA ganhou a paleta
  completa da linha Premium (26 cores) + um Tipo novo "PLA Silk"
  (Gold/Bronze/Silver, categoria própria no site deles).
- **Resina** (6 Tipos novos): mesclei dois fornecedores —
  `https://3dcure.com.br/categoria/resina-3d/` (Basic/Pixel/Gamer/Flex/
  ABS-like, com preço E cores reais de cada produto individual) e
  `https://quanton3d.com.br/resinas/` (Spin/PyroBlast/Spark, usado só pra
  ampliar a paleta da linha "Padrão" e como referência da linha
  "Cristal"). Preços por kg são os reais dos sites (só "Cristal" ficou
  estimado, sem confirmação exata). Linhas de nicho (odontologia,
  joalheria/fundição) ficaram de fora de propósito — não fazem sentido
  pra uma loja de impressão sob encomenda geral.
- Resultado final: 3 Materiais, 11 Tipos, 60 Cores. Script apaga o
  catálogo de materiais atual antes de semear (confirmado com o usuário,
  que ainda não tinha muita coisa cadastrada) — não mexe em
  produtos/categorias/pedidos, e não dá erro de FK mesmo se algum produto
  já usar uma cor (constraints são cascade/set null, não restrict).

**Lista de cores "Cores aceitas" ficou enorme e lenta** — consequência
direta do catálogo ter saltado de ~10 pra 60 cores: o usuário reportou a
lista "enorme" e "travando um pouco" ao selecionar cores de uma peça.
Duas causas reais, dois fixes:
1. **UX**: `ProductPartsManager` renderizava as 60 cores como uma lista
   plana, sem agrupamento nem busca. Novo componente
   `PartColorPicker` (client) agrupa por Material · Tipo (mesma convenção
   já usada em `ColorSwatches` da loja), com uma caixa de busca e cada
   grupo recolhido por padrão (exceto o(s) grupo(s) que já têm alguma cor
   selecionada — assim o admin vê de cara só o que importa). **Cuidado
   deliberado**: visibilidade (grupo recolhido, linha fora da busca) é
   controlada SÓ por className (`hidden`) — nenhum checkbox/radio é
   desmontado nunca, então marcar uma cor, buscar por outra coisa
   (escondendo essa cor) e depois limpar a busca nunca perde a seleção já
   feita. Confirmei isso especificamente via Playwright (marcar uma cor,
   buscar um termo que não bate com ela, confirmar que continua marcada,
   limpar a busca, confirmar de novo) — um `unmount` condicional ali
   seria um jeito fácil de silenciosamente desmarcar cor sem o admin
   perceber.
2. **Performance**: a página de edição de produto pode ter VÁRIOS
   preview 3D abertos ao mesmo tempo (um `PartThumbnailCapture` por peça
   + o novo `ProductViewerAngleControl` da rodada 39) — cada
   `<Canvas>` do `ProductViewer3D` rodava em loop de render contínuo
   (`frameloop` padrão do r3f é "always") mesmo parado, o que é
   provavelmente a causa real do "travando" (não as 60 cores em si, 120
   inputs não é pesado pro React). Mudei pra `frameloop="demand"` — só
   redesenha quando algo muda de verdade (arrastar a câmera, trocar de
   cor), aproveitando que `OrbitControls` já tem `makeDefault` (invalida
   sozinho no modo demand). Afeta todo mundo que usa `ProductViewer3D`
   (loja, admin, modelo customizado) — sem downside conhecido pra
   nenhum desses usos.

**Testado**: Playwright contra `ProductPartsManager` mockado com 110
cores (11 grupos × 10, maior que o catálogo real de 60, pra estressar
ainda mais): confirmei que só 10 de 110 checkboxes ficam visíveis
inicialmente (só o grupo com a cor já selecionada abre sozinho), que
buscar "Amarelo" mostra só as linhas que batem (uma por grupo) escondendo
o resto, e o teste crítico de marcar→buscar-outra-coisa→limpar-busca
mantendo o checkbox marcado o tempo todo — zero erros de console. `npm
run lint`, `npx tsc --noEmit`, `npm run test` (13/13) e `npm run build`
(`.next` limpo) passaram limpos.

**Pendente**: rodar `scripts/seed-full-material-catalog.sql` no Supabase
real quando o usuário quiser popular o catálogo de verdade — nenhuma
migração nova nesta rodada (só o script de seed e mudanças de
componente/UI).

### Rodada 42: peso/preço de P/G passam a ser calculados a partir da escala

Usuário perguntou se o preço base dava pra ser calculado a partir do
tamanho/peso do objeto — resposta é que **já é assim** desde as rodadas
22/28 (`PriceSuggestionCalculator`, botão "Usar esse preço" no admin,
nunca aplica sozinho). O pedido de verdade era outro, mais específico:
"o tamanho M é o que é gerado pelo arquivo. O P e o G precisam ter o
valor e peso de acordo com o aumento... no caso do P, o preço pode
deixar o mesmo do M, mas o peso diminui. o G precisa aumentar o preço e
o peso. Tudo baseado no aumento ou diminuição da escala que já temos
hoje."

**Bug real confirmado antes de mexer**: `autoGenerateSizeOptions`
(rodada 19, cria P/M/G automaticamente a partir da medida do arquivo)
sempre deixava `weightModifierGrams`/`priceModifierCents` no default da
coluna (`0`) pros 3 tamanhos — ou seja, P e G sempre tiveram o MESMO
peso/preço do M, apesar do `scaleFactor` (0.5/1/1.5) já existir e ser
aplicado de verdade na malha 3D. `createSizeOption`/`updateSizeOption`
(form manual do admin) também exigiam digitar esses dois números à mão,
sem nenhuma ajuda.

**Fix**: nova função `estimateSizeScalingModifiers` (`pricing.ts`) —
peso escala com o CUBO do `scaleFactor` (é volume, não comprimento: a
peça a 50% linear tem só 12,5% do peso original), preço só pode
AUMENTAR (nunca diminuir): pra escalas menores o preço fica igual ao
tamanho base (decisão de negócio explícita do usuário — custo fixo de
operação não cai só porque a peça ficou menor), pra escalas maiores soma
o custo real de material/energia extra usando a MESMA cor padrão de
cada peça antes/depois da escala (reaproveita `colorCostCents`/
`resolveDefaultMaterialColorId`, já existentes pra calcular o delta por
TROCA de material — dimensão totalmente independente desta). Nova query
`getProductPartsForSizeEstimate` busca só o necessário (peso + cor
padrão + cores aceitas de cada parte) pra rodar essa conta.

`autoGenerateSizeOptions`, `createSizeOption` e `updateSizeOption`
passaram a chamar essa função automaticamente — `SizeOptionInput` perdeu
os campos `priceModifierReais`/`weightModifierGrams` (não existe mais
"digitar peso/preço de um tamanho à mão": P/M/G são sempre a MESMA malha
escalada, então quanto peso/preço mudam é consequência direta da
escala, não uma decisão separada — mesmo espírito de peso/dimensões da
peça terem virado 100% automáticos na rodada 26). `SizeForm` ficou só
com Label + Escala; `ProductSizesManager` ganhou uma nota explicando a
regra (peso pelo cubo da escala, preço só sobe).

**Testado com contas feitas à mão**: 6 testes novos em `pricing.test.ts`
(peça de 40g, escala 0.5 → -35g/R$0,00; escala 1.5 → +95g/R$7,60; escala
1 → 0/0; delta com componente de energia; peça sem peso não contribui;
sem cor padrão salva cai pra primeira da lista, com a taxa de
pós-processamento cancelando corretamente no delta) — todos batem com o
cálculo manual. `npm run lint`, `npx tsc --noEmit`, `npm run test`
(19/19) e `npm run build` (`.next` limpo) passaram limpos.

**Pendente**: tamanhos já criados antes desta rodada (se o usuário já
tiver algum produto cadastrado com P/G gerados automaticamente) ficam
com os modificadores antigos (0/0) até o admin abrir "Editar" em cada um
e salvar de novo — isso já recalcula pela fórmula nova, não precisa de
migração nem script.

### Rodada 43: cor ganha "disponível (em estoque)" + peça aceita Tipo de material (não mais Cor)

Usuário pediu uma mudança estrutural: (1) cor precisa de uma flag manual
de "tem em estoque?" (todas nascem disponíveis); (2) no cadastro/edição
de produto, o admin não cura mais cor por cor — marca quais TIPOS de
material (ex.: "Plástico · PLA") uma peça aceita, e as cores oferecidas
pro cliente viram TODAS as disponíveis desses Tipos (geral do catálogo,
não uma seleção por produto); a única curadoria que sobra por peça/região
é a cor PADRÃO. Perguntei (`AskUserQuestion`) 2 pontos antes de mexer no
schema: o que fazer quando a cor padrão salva fica sem estoque (escolheu
"troca sozinho pra outra disponível do mesmo tipo") e se cor sem estoque
deveria aparecer desabilitada na loja ou simplesmente sumir (escolheu
"some completamente"). Dado o tamanho (schema + várias telas do admin +
toda a árvore de queries que monta as cores oferecidas), usei
`EnterPlanMode` antes de tocar em código.

**Achado que reduziu bastante o raio de mudança**: `ProductPart
.availableColors: MaterialColor[]` (`types.ts`) já era a interface que
desacopla "como as cores foram escolhidas" de "como preço/render/
checkout usam elas" — `pricing.ts`, `ColorSwatches`/
`MaterialTypeDescription` (`product-configurator.tsx`), o checkout e o
modelo customizado só consomem esse array já pronto. Trocando só a FONTE
de onde `getProductBySlug` monta esse array (de "cores curadas por
parte" pra "cores disponíveis dos Tipos aceitos pela parte"), o fallback
de cor padrão que já existia (`resolveDefaultMaterialColorId`) passa a
implementar as duas regras confirmadas **de graça** — zero mudança de
lógica de preço/render/checkout. Uma cor que vira indisponível
simplesmente não entra mais em `availableColors`; se ela era o padrão
salvo de uma peça/região, o mesmo fallback que já existia (e já era
testado em `pricing.test.ts`) escolhe outra sozinho.

**Schema** (migração `0016_slim_black_cat.sql`, gerada limpa — tabela
nova de verdade, sem risco de rename ambíguo como a 0009 da Fase 1):
`material_colors.available` (boolean, default true). Nova tabela
`product_part_material_types` (part↔Tipo, substitui a curadoria de
`product_part_material_options`, que fica declarada mas órfã no schema —
mesmo tratamento já dado a `filament_options` desde a rodada 28, evita o
drizzle-kit confundir "sumiu" com "virou outra coisa"). Migração editada
à mão pra fazer o backfill: deriva os Tipos aceitos de cada peça a partir
das cores que ela já tinha curadas (`INSERT ... SELECT DISTINCT ... JOIN
material_colors ... ON CONFLICT DO NOTHING`) — não tenta reconstruir a
seleção exata de antes (agora é por Tipo, não por cor), só preserva a
intenção o quanto der.

**Queries** (`queries.ts`): `getAllMaterialColorsForAdmin` ganhou
`available`. Função nova `mapAvailableColorsFromTypeOptions` (+ o `with`
compartilhado `materialTypeOptionsWithAvailableColors`, que filtra
`material_colors.available = true` na própria query) substitui, em
`getProductBySlug`/`getProductPartsForSizeEstimate`/
`getPublishedProductsForCatalog`, o antigo `part.materialOptions.map(
({color}) => ...)` — mesma forma de saída (`MaterialColor[]`), só a
fonte muda. `getMaterialColorDeletionImpact` (usado antes de excluir uma
cor/Tipo/Material, pra perguntar por um substituto) recalcula
"cores que a peça ainda aceitaria" a partir dos Tipos aceitos em vez da
lista curada — mesma forma de retorno, ninguém mais precisou mudar.
`getProductWithConfigForAdmin` troca `materialOptions: true` por
`materialTypeOptions: true`. **Bug de inferência do Drizzle pego no
`tsc`**: extrair um objeto `{ with: {...} }` pra uma variável e reusá-lo
em dois `with` aninhados (`getMaterialColorDeletionImpact`) faz o
Drizzle perder a inferência de tipo literal da coluna (`colors` virava
`{}[]`) — corrigido inlineando o objeto nas duas chamadas em vez de
compartilhar a variável (o `with` compartilhado que FUNCIONOU em
`getProductBySlug` está num nível de aninhamento raso o suficiente pra
não ter esse problema).

**Actions**: `setPartMaterials` deletado (não deprecado, mesmo critério
da rodada 26) — `setPartMaterialTypes` novo grava os Tipos aceitos +
a cor padrão, conferindo no servidor que a cor escolhida está disponível
E pertence a um dos Tipos aceitos antes de gravar (nunca confia
cegamente no client), com fallback pra primeira cor disponível se não.
`custom-models/actions.ts` (Fase 4/4b) precisou de um ajuste: a
confirmação de um modelo customizado agora faz a peça aceitar o TIPO
inteiro da cor escolhida pelo cliente (não só aquela cor isolada) —
mesma regra universal de qualquer produto agora, consistente com o
resto do catálogo.

**Admin**: `MaterialColorForm` ganhou o checkbox "Disponível (em
estoque)" (nasce marcado); `MaterialColorRow` mostra "(sem estoque)"
junto do swatch quando `available: false`. `part-color-picker.tsx`
deletado, substituído por `part-material-type-picker.tsx`
(`PartMaterialTypePicker`) — um checkbox por Material·Tipo (não mais por
cor) + um `<select>` "Cor padrão" cujas opções são recalculadas ao vivo
(só cores disponíveis dos Tipos marcados no momento). `NewProductForm`
(cadastro novo): `PartDraft.selectedColorIds` virou `selectedTypeIds`;
a lista de Tipos é **derivada** das próprias cores já carregadas
(dedupe por `typeId`, sem precisar de uma query/prop nova); a
recomendação por categoria (Fase 1b) ficou mais simples — já vem no
formato `materialTypeId[]`, não precisa mais mapear tipo→cores só pra
filtrar de novo.

**Testado com Playwright** contra uma página mockada (`dev-preview-temp`,
removida depois) cobrindo os 3 componentes com um catálogo de 2 Tipos (1
cor disponível + 1 indisponível em PLA, 1 cor disponível em Cristal):
confirmei que a cor indisponível mostra "(sem estoque)" no admin de
materiais e que uma cor nova nasce com "Disponível" marcado; que o
`PartMaterialTypePicker` começa com o select de padrão mostrando só
"Azul" (só PLA aceito), marcar "Cristal" adiciona "Transparente" às
opções, e desmarcar "PLA" remove "Azul" das opções (sobra só
"Transparente") — esse último caso só bateu depois de eu perceber que
meu PRÓPRIO script de teste usava um seletor ambíguo (`label:has-text
("PLA")` batia tanto no checkbox do `ProductPartsManager` quanto no
`"Plástico · PLA"` do `NewProductForm`) — trocando pro atributo
`name="materialTypeId"` (só existe no primeiro) confirmou que o
componente sempre esteve correto, o bug era só do teste; e que o
`NewProductForm` mostra "Plástico · PLA"/"Resina · Cristal" já marcados
por padrão, e escolher a categoria "Decoração" (recomenda só Cristal)
desmarca PLA automaticamente — zero erros de console novos (o único
aviso, do Base UI sobre o Select de categoria virando controlado, já é
pré-existente desde a rodada 29). `npm run lint`, `npx tsc --noEmit`,
`npm run test` (19/19, suíte de pricing não mudou — decoupled da forma
da query, exatamente o ponto da interface `availableColors`) e `npm run
build` (`.next` limpo) passaram limpos.

**Pendente**: rodar a migração `0016` contra o Supabase real — SQL
combinado atualizado em `scripts/pending-migrations-0001-a-0016.sql`
(renomeado de `...-0015.sql`). O comportamento "cor sem estoque some da
loja / padrão indisponível cai pra outra cor" não pôde ser confirmado
contra banco real nesta sessão (sem `DATABASE_URL`) — a garantia vem de
(a) o fallback de `defaultMaterialColorId` já ser testado em
`pricing.test.ts` e (b) `getProductBySlug` simplesmente não incluir mais
a cor indisponível em `availableColors`, então o mesmo caminho de código
já testado entra em ação sozinho, sem lógica nova a confirmar.

### Rodada 44: cubo cortando no `ProductViewer3D` (margin do Bounds)

Usuário mandou um print de um produto cúbico com as bordas visivelmente
cortadas no visualizador 3D (não o `AnimatedModelViewer` da home, esse já
foi corrigido na rodada 35 — este é o `ProductViewer3D`, usado no
admin/loja, que nunca tinha passado por esse ajuste). Mesma causa raiz já
documentada na rodada 35: o `Bounds` do drei (`node_modules/@react-three/
drei/core/Bounds.js`) calcula a distância da câmera só a partir da MAIOR
dimensão isolada da caixa (`Math.max(box.x, box.y, box.z)`), nunca da
diagonal — visto do ângulo de canto fixo (`DEFAULT_CAMERA_POSITION =
[2.5, 2, 2.5]`), um objeto compacto/cúbico aparenta ser bem maior que
essa dimensão isolada, e o `margin={1.4}` que esse componente usava não
dava conta disso (mesmo `Bounds`, mesma fórmula, mas o `ProductViewer3D`
nunca tinha sido auditado pra esse problema especificamente — só o
`AnimatedModelViewer` tinha).

**Fix**: `margin` subiu de `1.4` pra `1.8` em `product-viewer-3d.tsx`
(afeta todo mundo que usa esse componente — produto na loja, thumbnails
do admin, controle de ângulo, modelo customizado). **Testado
comparando as duas margens lado a lado**: capturei o mesmo cubo
placeholder via Playwright com `margin=1.4` (bordas bem coladas no
quadro) e com `margin=1.8` (folga clara em todas as bordas) — a versão
1.4 não chegou a cortar de verdade nesse cubo sintético simples (o
objeto real do usuário provavelmente tem mais geometria/detalhe nas
quinas que aumenta a silhueta aparente), mas a comparação confirma que
1.8 dá uma folga real e substancial a mais, direção certa pro problema
relatado. `npm run lint`, `npx tsc --noEmit`, `npm run test` (19/19) e
`npm run build` (`.next` limpo) passaram limpos.

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
