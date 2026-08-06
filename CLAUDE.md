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
  `drizzle/0002_flawless_runaways.sql`, `drizzle/0003_curvy_boom_boom.sql` e
  `drizzle/0004_empty_amphibian.sql` contra o Supabase real (`npm run
  db:migrate` ou colar o SQL no SQL Editor) — sem isso, nada da rodada 10
  (Superfrete completo, imagens de produto), da rodada 12 (regiões
  pintadas), da rodada 13 (material padrão por parte) nem da rodada 15
  (esconder/definir padrão por região) funciona contra produção. Todas são
  só aditivas (CREATE TABLE / ALTER TABLE ADD COLUMN), seguras. **Atenção
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
